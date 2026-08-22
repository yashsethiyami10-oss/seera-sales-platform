import { createHash } from "node:crypto";
import { after } from "next/server";
import type { Prisma, PrismaClient, OrderSource } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { timeOperation, operationalLog } from "@/lib/foundation/logger";
import {
  assertAssistedAction,
  assertPromisePreservesContract,
  evaluateDistributorCredit,
  inventoryPosition,
  reconciliationVariance,
} from "./business-rules";
import { canonicalDistributorExposure } from "./credit-service";
import { resolveDistributorPurchaseRate } from "./distributor-pricing";
import { COMPANY_ORDER_UNIT_OVERRIDES, wholesaleOrderUnitToCanonicalPieces, canonicalPiecesToWholesaleOrderUnit } from "./company-order-catalog";
import { notifyPartyUsers, requirePartyMembership, executiveAuthorizedDistributors, companyDirectPartnerId, isCompanyDirectEligible } from "./scope";
import { deriveInclusiveTax, deriveExclusiveTax, priceModeForBrand } from "./document-lines";
import { evaluateHqGeofence, recordGpsSample, recomputeSessionDistance } from "./field-travel-service";
import { queueRetailerCommunicationSafe } from "./retailer-communication-service";
import { assertCompanyDispatchAvailable, postCompanyDispatchStockAndCogs } from "@/lib/manufacturing/company-stock-service";

// `uom` (Final Master Revision Part 2, 22-Aug): the client (FieldJourney.tsx's toBasePcLine) has
// already converted `quantity`/`rate` to base PC units before this reaches placeRetailerOrder — no
// pricing math here changes. `uom` is purely the human-readable record of what was actually
// selected ("2 BOX"), carried through to packSnapshot/schemeSnapshot so it's never lost, matching
// the exact same schemeSnapshot-reuse convention createCompanyOrder already established for its own
// order-unit snapshot (no schema change).
// `scheme` (Final Retailer Cleanup + Handover, 22-Aug): an optional free-goods scheme captured on
// the SAME line as the paid quantity — "10 BOX purchase -> 1 PC FREE". `quantity`/`rate` here are
// always the PAID amount only (the client has already excluded free units before this point) — so
// every downstream subtotal/tax/lineTotal calculation is completely unaffected; freeBaseQuantity is
// carried purely as informational snapshot data for the Distributor/documents to display.
type OrderLineInput = { skuId: string; quantity: number; rate?: number; uom?: { unit: string; packFactor: number; uomQuantity: number }; scheme?: { freeQuantity: number; freeUom: string; freeBaseQuantity: number } };
type ActorContext = {
  actorId: string;
  sourcePortal: string;
  commercialPartyType: string;
  commercialPartyId: string;
  onBehalfOfPartyId?: string;
  financialAcceptance?: boolean;
  assistedReason?: string;
};

export async function createSku(
  prisma: PrismaClient,
  actorId: string,
  input: {
    code: string;
    productName: string;
    category: string;
    packSize: number;
    unitType: string;
    unitsPerCase: number;
    mrp: number;
    hsn?: string;
    taxRate?: number;
    // Optional so every existing caller (all of which only ever sold "Seera"-branded goods) keeps
    // working unchanged. Multi-brand catalog restoration (MUV/SEERA/SHINE PLUS/YUVA) needs a real
    // brand per SKU — the previous hardcoded "Seera" silently merged every non-Seera product into
    // the Seera brand string, which is exactly the brand-identity loss the restoration must avoid.
    brand?: string;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (input.unitsPerCase < 1 || input.packSize <= 0 || input.mrp <= 0)
    throw new FoundationError(
      "INVALID_SKU",
      "Invalid SKU commercial values",
      400,
    );
  return prisma.$transaction(async (tx) => {
    const sku = await tx.seeraSku.create({
      data: {
        ...input,
        code: input.code.trim().toUpperCase(),
        brand: input.brand?.trim() || "Seera",
        status: "ACTIVE",
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "sku.created",
      entityType: "SeeraSku",
      entityId: sku.id,
      afterState: { code: sku.code, mrp: sku.mrp.toString() },
    });
    return sku;
  });
}

// Founder-authorized: applicable canonical commercial SKUs carry GST RATE 18% under the same HSN
// family already frozen as a Founder decision for the existing 9-SKU range (see
// smoke-stage1e-gst-tax-total.ts's own "Pre-Launch Pass 0A: HSN 3402, GST 18%, frozen" comment) and
// already live on at least one real production SKU (SEERA-CAKE-BLUE, hsn "34021190"). This extends
// that SAME already-approved RATE to every other ACTIVE SKU still missing tax config, rather than
// inventing a new classification — idempotent (only touches rows where taxRate or hsn is currently
// null), one click, no schema change. This function only ever sets taxRate/hsn — it does NOT decide
// or store a price mode. GST correctness fix (Founder directive): an earlier pass wrongly assumed
// setting a rate here made every touched SKU's price GST-inclusive; price mode is in fact brand-
// determined (see priceModeForBrand in document-lines.ts — MUV is GST-inclusive, every other brand,
// including every SKU this action can touch, is GST-exclusive/added-on-top), and is resolved
// automatically wherever tax is computed, independent of this action. HSN is deliberately NOT
// varied per product sub-category here since no Founder-supplied per-category HSN mapping exists —
// if a specific SKU genuinely needs a different HSN (e.g. a non-detergent product), that remains a
// Founder/Admin edit via the existing Masters SKU form.
export async function bulkConfigureCanonicalSkuGst(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const FROZEN_TAX_RATE = 18;
  const FROZEN_HSN = "34021190";
  const unconfigured = await prisma.seeraSku.findMany({
    where: { status: "ACTIVE", OR: [{ taxRate: null }, { hsn: null }] },
    select: { id: true, code: true, productName: true },
  });
  if (!unconfigured.length) return { configured: 0, skus: [] as { code: string; productName: string }[] };
  await prisma.seeraSku.updateMany({
    where: { id: { in: unconfigured.map((s) => s.id) } },
    data: { taxRate: FROZEN_TAX_RATE, hsn: FROZEN_HSN },
  });
  await recordAudit(prisma, {
    actorId,
    action: "sku.bulk_gst_configured",
    entityType: "SeeraSku",
    entityId: "bulk",
    afterState: { count: unconfigured.length, taxRate: FROZEN_TAX_RATE, hsn: FROZEN_HSN, skuCodes: unconfigured.map((s) => s.code) },
  });
  return { configured: unconfigured.length, skus: unconfigured.map((s) => ({ code: s.code, productName: s.productName })) };
}

export async function createPriceVersion(
  prisma: PrismaClient,
  actorId: string,
  input: {
    skuId: string;
    tier: "COMPANY_TO_SS" | "SS_TO_DISTRIBUTOR" | "DISTRIBUTOR_TO_RETAILER";
    amount: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const overlap = await prisma.seeraPriceVersion.findFirst({
    where: {
      skuId: input.skuId,
      tier: input.tier,
      status: "ACTIVE",
      effectiveFrom: { lt: input.effectiveTo ?? new Date("9999-12-31") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
    },
  });
  if (overlap)
    throw new FoundationError(
      "PRICE_VERSION_OVERLAP",
      "Active price period overlaps",
      409,
    );
  const sku = await prisma.seeraSku.findUniqueOrThrow({
    where: { id: input.skuId },
  });
  return prisma.seeraPriceVersion.create({
    data: {
      ...input,
      mrpSnapshot: sku.mrp,
      status: "ACTIVE",
      createdById: actorId,
    },
  });
}

// Stage 4 fix: createPriceVersion (above) has no way to actually CHANGE a price once one exists —
// any new version for the same SKU/tier always collides with the existing open-ended
// (effectiveTo: null) active one and throws PRICE_VERSION_OVERLAP. There was no code path that ever
// closed out an old version, so "Founder changes 8% -> 6%, or a fixed rate" was structurally
// impossible through this function for any SKU that already has a price — which is every real
// Seera/MUV SKU. This closes the actual gap: atomically closes the current active version's
// effectiveTo at the moment the new one starts (status -> INACTIVE; MasterStatus has no SUPERSEDED
// value, INACTIVE is the closest existing equivalent — no schema/migration change) and creates the
// new ACTIVE version. Historical order/quotation/invoice line snapshots are copied values at
// creation time (priceSnapshot on SeeraOrderLine etc.), never a live reference to this row, so
// closing the old version can never retroactively alter a past transaction.
export async function supersedePriceVersion(
  prisma: PrismaClient,
  actorId: string,
  input: {
    skuId: string;
    tier: "COMPANY_TO_SS" | "SS_TO_DISTRIBUTOR" | "DISTRIBUTOR_TO_RETAILER";
    amount: number;
    effectiveFrom: Date;
    marginType?: "FIXED" | "PERCENTAGE";
    marginValue?: number;
    reason: string;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!input.reason.trim())
    throw new FoundationError("PRICE_CHANGE_REASON_REQUIRED", "A reason is required to change a governed price", 400);
  const sku = await prisma.seeraSku.findUniqueOrThrow({ where: { id: input.skuId } });
  return prisma.$transaction(async (tx) => {
    const current = await tx.seeraPriceVersion.findFirst({
      where: {
        skuId: input.skuId,
        tier: input.tier,
        status: "ACTIVE",
        effectiveFrom: { lte: input.effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (current) {
      if (current.effectiveFrom.getTime() === input.effectiveFrom.getTime())
        throw new FoundationError("PRICE_VERSION_OVERLAP", "A price version already starts on this exact date", 409);
      await tx.seeraPriceVersion.update({ where: { id: current.id }, data: { effectiveTo: input.effectiveFrom, status: "INACTIVE" } });
    }
    const created = await tx.seeraPriceVersion.create({
      data: {
        skuId: input.skuId,
        tier: input.tier,
        amount: input.amount,
        marginType: input.marginType,
        marginValue: input.marginValue,
        mrpSnapshot: sku.mrp,
        effectiveFrom: input.effectiveFrom,
        status: "ACTIVE",
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "price_version.superseded",
      entityType: "SeeraPriceVersion",
      entityId: created.id,
      reason: input.reason,
      beforeState: current ? { id: current.id, amount: current.amount.toString() } : undefined,
      afterState: { amount: input.amount, effectiveFrom: input.effectiveFrom.toISOString() },
    });
    return { previous: current, current: created };
  });
}

// Working types where the Founder's "Choose Working Distributor" requirement applies — this is
// Start Day CONTEXT ONLY (which market the Executive is primarily working today), never retailer-
// order routing authority. Retailer order routing (placeRetailerOrder) continues to resolve its own
// commercialPartyId strictly from retailer.distributorId / territory / Manager assignment, exactly
// as before this feature — it never reads SeeraWorkSession.workingDistributorId.
const WORKING_TYPES_REQUIRING_DISTRIBUTOR = new Set(["RETAILING", "DISTRIBUTOR_VISIT"]);

export async function startFieldDay(
  prisma: PrismaClient,
  actorId: string,
  input: {
    employeeRole: "SALES_EXECUTIVE" | "SALES_MANAGER";
    workingType: string;
    plannedGeographyId?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    startExceptionReason?: string;
    remarks?: string;
    workingDistributorId?: string;
  },
) {
  // PERFORMANCE PHASE 2: evaluateHqGeofence() only reads `input` (the GPS point already captured
  // client-side) and currently-active SeeraHqConfiguration rows — it has no dependency on the
  // authorize() permission check, so the two independent reads run concurrently instead of
  // sequentially.
  const [, geofence] = await Promise.all([
    authorize(prisma, {
      actorId,
      permission:
        input.employeeRole === "SALES_MANAGER"
          ? "manager_field:operate"
          : "field_day:manage_self",
    }),
    evaluateHqGeofence(prisma, input, new Date()),
  ]);

  // Only Sales Executives are in scope for this requirement (spec: "Sales Executive Start Day") —
  // a Sales Manager's own Start Day is unaffected.
  if (input.employeeRole === "SALES_EXECUTIVE") {
    const distributorRequired = WORKING_TYPES_REQUIRING_DISTRIBUTOR.has(input.workingType);
    if (distributorRequired && !input.workingDistributorId)
      throw new FoundationError(
        "WORKING_DISTRIBUTOR_REQUIRED",
        "Choose a working Distributor before starting the day for this work type",
        400,
      );
    if (input.workingDistributorId) {
      // Never trust a client-supplied Partner ID alone — it must be an active Distributor the
      // Executive is actually authorized for (their own retailer-mapped distributors, widened to
      // their Manager's team mapping), the exact same canonical relation
      // Manager Distributor Oversight already uses, not a parallel/looser check.
      const authorized = await executiveAuthorizedDistributors(prisma, actorId);
      if (!authorized.some((d) => d.id === input.workingDistributorId))
        throw new FoundationError(
          "DISTRIBUTOR_NOT_AUTHORIZED",
          "That Distributor is not in your authorized working scope",
          403,
        );
    }
  }

  try {
    const session = await prisma.seeraWorkSession.create({
      data: {
        employeeId: actorId,
        employeeRole: input.employeeRole,
        workingType: input.workingType,
        plannedGeographyId: input.plannedGeographyId,
        workingDistributorId: input.employeeRole === "SALES_EXECUTIVE" ? (input.workingDistributorId ?? null) : null,
        startLatitude: input.latitude,
        startLongitude: input.longitude,
        hqId: geofence.hqId,
        startInsideGeofence: geofence.inside,
        startExceptionReason: geofence.inside === false ? input.startExceptionReason : undefined,
        remarks: input.remarks,
        startedAt: new Date(),
      },
    });
    await recordGpsSample(prisma, {
      employeeId: actorId,
      workSessionId: session.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "START_DAY",
      trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
    });
    return session;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new FoundationError(
        "ACTIVE_WORKDAY_EXISTS",
        "Only one active workday is allowed",
        409,
      );
    throw error;
  }
}

// P0 fix (Founder-reported repeated live failure): the previous version awaited
// recomputeSessionDistance() — and, before that, recordGpsSample() bundled into the same
// Promise.all as the session-close write — directly in the critical path, un-caught. Neither
// operation is required for a day to be validly closed (GPS is already optional-with-exception,
// see Test 12 in daily-working-end-day-proof.ts; distance is a derived TA-claim enrichment, not a
// closure precondition). Because seeraWorkSession.updateMany() below is a single, independently-
// committing statement (not wrapped in a $transaction with anything after it), the DB row could
// already be durably status="ENDED" while a LATER secondary operation still throws — turning a
// genuinely successful close into a user-visible "Action could not be completed" error. This is
// the exact contradiction the Founder reported (session shows ENDED, UI shows failure). Fixed by
// making the session-close write the sole determinant of success/failure; every operation after
// it is wrapped so it can never propagate out of this function.
export async function endFieldDay(
  prisma: PrismaClient,
  actorId: string,
  sessionId: string,
  input: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    endExceptionReason?: string;
    remarks?: string;
    outcome: string;
  },
) {
  const operationId = timeOperation("workflow.endFieldDay").operationId;
  const stageLog: Array<{ stage: string; ms: number }> = [];
  const t0 = performance.now();
  let tPrev = t0;
  const mark = (stage: string) => {
    const now = performance.now();
    stageLog.push({ stage, ms: Math.round(now - tPrev) });
    tPrev = now;
  };
  // Always-on structured log (not gated behind the >1000ms slow-operation threshold) — Section 3
  // of the End Day P0 directive requires stage-by-stage visibility into every attempt, not just
  // slow ones, since a fast failure is just as diagnostically important as a slow one.
  const logOutcome = (outcome: "success" | "already_ended" | "failed", extra: Record<string, unknown> = {}) =>
    operationalLog(outcome === "failed" ? "error" : "info", "workflow.endFieldDay.outcome", {
      operationId,
      actorId,
      sessionId,
      outcome,
      totalMs: Math.round(performance.now() - t0),
      stages: stageLog,
      ...extra,
    });

  // PERFORMANCE PHASE 2: evaluateHqGeofence() depends only on `input`/`now`, not on the session
  // lookup below — running them concurrently instead of sequentially removes one round trip from
  // End Day's critical path. The tiny amount of geofence work "wasted" on the rare
  // already-ended/not-found early-return paths below is a pure read with no side effects.
  const [owned, geofence] = await Promise.all([
    prisma.seeraWorkSession.findFirst({
      where: { id: sessionId, employeeId: actorId },
      select: { employeeRole: true, status: true },
    }),
    evaluateHqGeofence(prisma, input, new Date()),
  ]);
  mark("END_DAY_02_LOAD_ACTIVE_SESSION");
  if (!owned) {
    logOutcome("failed", { code: "WORKDAY_NOT_ACTIVE", reason: "session_not_found_or_not_owned" });
    throw new FoundationError(
      "WORKDAY_NOT_ACTIVE",
      "Active workday not found",
      409,
    );
  }
  await authorize(prisma, {
    actorId,
    permission:
      owned.employeeRole === "SALES_MANAGER"
        ? "manager_field:operate"
        : "field_day:manage_self",
  });
  mark("END_DAY_01_AUTHORIZE");
  // Idempotency fix (P0, Founder UAT): "Confirm & end day" returned "Active workday not found"
  // for a session the dashboard clearly showed as active. Root cause: FieldJourney's End Day
  // handler unconditionally drains the offline queue right before firing an explicit end-day call
  // — if a PRIOR end-day attempt had hit a network hiccup, queued itself, and only got synced by
  // that drain (offline-sync-service.ts calls this same endFieldDay), the day is already ENDED by
  // the time the explicit call below runs against the same sessionId. Treat "already ended by this
  // same actor" as a benign no-op success rather than an error — the day genuinely was ended. This
  // is also the governed response for a genuine double-submit (Section 7 of the P0 directive):
  // never re-mutate, never report a generic failure for a day that is already durably closed.
  if (owned.status === "ENDED") {
    logOutcome("already_ended");
    return { alreadyEnded: true as const };
  }
  if (owned.status !== "ACTIVE") {
    logOutcome("failed", { code: "WORKDAY_NOT_ACTIVE", reason: "session_not_active", sessionStatus: owned.status });
    throw new FoundationError(
      "WORKDAY_NOT_ACTIVE",
      "Active workday not found",
      409,
    );
  }
  mark("END_DAY_03_VALIDATE_SESSION");
  mark("END_DAY_04_CAPTURE_END_GPS_AND_GEOFENCE");
  // ================= CRITICAL PATH ENDS HERE =================
  // This single, independently-committing write is the ENTIRE definition of "End Day succeeded".
  // Everything after it is secondary/enrichment work — see the function-level comment above for
  // why none of it may be allowed to throw out of this function once this write has landed.
  const result = await prisma.seeraWorkSession.updateMany({
    where: { id: sessionId, employeeId: actorId, status: "ACTIVE" },
    data: {
      status: "ENDED",
      endedAt: new Date(),
      endLatitude: input.latitude,
      endLongitude: input.longitude,
      returnedToHq: geofence.inside,
      endExceptionReason: geofence.inside === false ? input.endExceptionReason : undefined,
      remarks: input.remarks,
      outcome: input.outcome,
    },
  });
  mark("END_DAY_06_CLOSE_SESSION");
  if (result.count !== 1) {
    // Same race as above, closed at the point of a concurrent double-submit landing between the
    // status read above and this write — re-check rather than assume failure.
    const now = await prisma.seeraWorkSession.findFirst({ where: { id: sessionId, employeeId: actorId }, select: { status: true } });
    if (now?.status === "ENDED") {
      logOutcome("already_ended", { reason: "concurrent_close_race" });
      return { alreadyEnded: true as const };
    }
    logOutcome("failed", { code: "WORKDAY_NOT_ACTIVE", reason: "close_write_matched_zero_rows" });
    throw new FoundationError(
      "WORKDAY_NOT_ACTIVE",
      "Active workday not found",
      409,
    );
  }
  // ================= SECONDARY PATH: session is now durably ENDED =================
  // Nothing below this line may throw out of endFieldDay. Each secondary step is independently
  // wrapped: a failure here is logged for internal follow-up but the day the user just closed
  // must never be reported back to them as failed.
  // PERFORMANCE PHASE 2 (P1 End Day SLO): both of these were previously AWAITED before the
  // response, even though the session is already durably ENDED by this point and neither result
  // is returned to the caller — pure latency for enrichment data (GPS sample, TA/DA distance
  // recompute) the response doesn't need. Deferred via after(), same guarded pattern as
  // placeRetailerOrder's post-commit notifications (throws synchronously outside a real request
  // scope; falls back to running inline so non-request callers — scripts/tests — see identical
  // end state, same stage marks and error logging either way).
  const secondaryWork = async () => {
    try {
      await recordGpsSample(prisma, {
        employeeId: actorId,
        workSessionId: sessionId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        source: "END_DAY",
        trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
      });
      mark("END_DAY_07_RECORD_GPS_SAMPLE");
    } catch (error) {
      mark("END_DAY_07_RECORD_GPS_SAMPLE_FAILED");
      operationalLog("error", "workflow.endFieldDay.secondary_failed", {
        operationId,
        actorId,
        sessionId,
        stage: "END_DAY_07_RECORD_GPS_SAMPLE",
        errorName: error instanceof Error ? error.name : "unknown",
        errorCode: error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined,
      });
    }
    try {
      await recomputeSessionDistance(prisma, actorId, sessionId);
      mark("END_DAY_08_DISTANCE_RECOMPUTE");
    } catch (error) {
      mark("END_DAY_08_DISTANCE_RECOMPUTE_FAILED");
      operationalLog("error", "workflow.endFieldDay.secondary_failed", {
        operationId,
        actorId,
        sessionId,
        stage: "END_DAY_08_DISTANCE_RECOMPUTE",
        errorName: error instanceof Error ? error.name : "unknown",
        errorCode: error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined,
      });
    }
    mark("END_DAY_12_RESPONSE_BUILD");
    logOutcome("success");
  };
  try {
    after(secondaryWork);
  } catch {
    await secondaryWork();
  }
  return { alreadyEnded: false as const };
}

export async function placeRetailerOrder(
  prisma: PrismaClient,
  context: ActorContext,
  input: {
    retailerId: string;
    idempotencyKey: string;
    requestedDeliveryAt?: Date;
    notes?: string;
    commercialPaymentType?: "CASH" | "CREDIT";
    lines: OrderLineInput[];
    // Repeat-business / phone-order support (Part A): defaults to FIELD_VISIT so every existing
    // caller (managerBookRetailerOrder, retailer self-service, scripts) is completely unaffected.
    source?: OrderSource;
    visitId?: string;
  },
) {
  const timing = timeOperation("workflow.placeRetailerOrder");
  const source: OrderSource = input.source ?? "FIELD_VISIT";
  if (source !== "FIELD_VISIT" && input.visitId)
    throw new FoundationError("VISIT_NOT_ALLOWED_FOR_NON_FIELD_VISIT_SOURCE", "A non-field-visit order cannot reference a visit", 400);
  // PERFORMANCE PHASE 2 (P0 place-order SLO): retailer_lookup, the visit-ownership check, and the
  // portal-specific authorize()+scope query below were three SEQUENTIAL round trips even though
  // none of them consumes another's result — visit ownership only needs input.retailerId (already
  // known, not retailer.id), the sales-manager team query only needs context.actorId, and the
  // retailer-portal assignment check only needs input.retailerId too. One round trip instead of
  // three. authorize() itself still throws synchronously into this Promise.all on a denied
  // permission, same as it always did.
  const [retailer, visitCheck, scopeQuery, cdPartnerId] = await Promise.all([
    prisma.seeraRetailer.findUniqueOrThrow({ where: { id: input.retailerId } }),
    input.visitId
      ? prisma.seeraVisit.findFirst({
          where: { id: input.visitId, retailerId: input.retailerId, workSession: { employeeId: context.actorId } },
          select: { id: true, checkedOutAt: true, workSession: { select: { workingDistributorId: true } } },
        })
      : Promise.resolve(null),
    context.sourcePortal === "sales-executive"
      ? authorize(prisma, { actorId: context.actorId, permission: "retailer:order" }).then(() => null)
      : context.sourcePortal === "sales-manager"
        ? authorize(prisma, { actorId: context.actorId, permission: "retailer:order" }).then(() =>
            prisma.seeraAssignment.findMany({
              where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: context.actorId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
              select: { subjectId: true },
            }),
          )
        : context.sourcePortal === "retailer"
          ? authorize(prisma, { actorId: context.actorId, permission: "portal:retailer" }).then(() =>
              prisma.seeraAssignment.findFirst({
                where: {
                  assignmentType: "RETAILER_USER",
                  subjectType: "USER",
                  subjectId: context.actorId,
                  targetType: "RETAILER",
                  targetId: input.retailerId,
                  effectiveFrom: { lte: new Date() },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
                },
                select: { id: true },
              }),
            )
          : Promise.reject(new FoundationError("INVALID_SOURCE_PORTAL", "Retailer order source denied", 403)),
    // Company Direct governance (GAP-004 addendum) — independent of everything else above, folded
    // into the same round trip. Singleton lookup, cheap even on the busiest write path in the app.
    companyDirectPartnerId(prisma),
  ]);
  timing.stage("retailer_lookup_authorize_scope");
  // P0 21-Aug closed-visit immutability fix (real production incident: an order was silently
  // accepted against the Mishra kirana visit 18.5 minutes AFTER it was already checked out, because
  // this check never verified checkedOutAt). A FIELD_VISIT order must reference a still-open visit
  // — this is deliberately scoped inside `input.visitId &&` so the no-visit phone/repeat-order path
  // (source !== "FIELD_VISIT", never carries a visitId — enforced above) is completely unaffected.
  if (input.visitId) {
    if (!visitCheck) throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
    if (visitCheck.checkedOutAt) throw new FoundationError("VISIT_ALREADY_CLOSED", "This visit is already checked out and can no longer accept a new order", 409);
  }
  timing.stage("source_and_visit_validation");
  // Executive→Distributor routing foundation (Founder decision, RUN 1 shared-foundation pass, then
  // corrected 22-Aug): Start Day's chosen working Distributor is now the authoritative daily
  // commercial-routing context for a FIELD_VISIT order — a retailer with no Distributor mapping
  // must NEVER lose the order, and must never need Manager manual assignment when a valid working
  // Distributor context already exists. Resolution order:
  //   1. retailer.distributorId if already set — unchanged, unambiguous, and never silently
  //      overwritten. If the acting session's workingDistributorId is set and DIFFERS from it, that
  //      is recorded as a governed conflict for Manager review (never a silent reroute).
  //   2. Else, if this order is inside a FIELD_VISIT whose work session has a workingDistributorId
  //      (Start Day's Distributor selection, already validated against
  //      executiveAuthorizedDistributors when the session started), resolve to it AND persist it
  //      onto the retailer — a safe first-time mapping, exactly like the territory-match case below.
  //   3. Else, if the retailer's territory has EXACTLY ONE active Distributor covering it, that
  //      is a deterministic (not guessed) routing decision — resolve to it AND persist it onto
  //      the retailer so every future order for this retailer routes directly, no repeated lookup.
  //   4. Else (zero or multiple territory candidates, and no working-distributor context), the
  //      order still books successfully as unassigned (sellerPartnerId/commercialPartyId
  //      empty-string sentinel) for Manager/Admin to resolve — never a random Distributor, never a
  //      dropped order.
  let resolvedDistributorId = retailer.distributorId;
  let territoryResolved = false;
  let workingDistributorMapped = false;
  const workingDistributorId = visitCheck?.workSession?.workingDistributorId ?? null;
  // Routing outcome, distinguished explicitly (Founder decision, RUN 2 shared-foundation residual)
  // rather than collapsing "no candidate" and "multiple candidates" into one indistinguishable
  // pending bucket — recorded as a SeeraStatusHistory reason (no schema change) so Manager's
  // unassigned-orders queue can tell them apart and, for the multiple-candidate case, show which
  // Distributors are in play instead of a bare "unassigned".
  let routingOutcome: "RETAILER_ASSIGNED" | "WORKING_DISTRIBUTOR_ASSIGNED" | "WORKING_DISTRIBUTOR_CONFLICT" | "SINGLE_TERRITORY_MATCH" | "MULTIPLE_DISTRIBUTOR_CANDIDATES" | "NO_DISTRIBUTOR_MAPPING" = "RETAILER_ASSIGNED";
  let candidateDistributorIds: string[] = [];
  let workingDistributorConflictId: string | null = null;
  if (resolvedDistributorId) {
    if (workingDistributorId && workingDistributorId !== resolvedDistributorId) {
      routingOutcome = "WORKING_DISTRIBUTOR_CONFLICT";
      workingDistributorConflictId = workingDistributorId;
    }
  } else if (workingDistributorId) {
    resolvedDistributorId = workingDistributorId;
    workingDistributorMapped = true;
    routingOutcome = "WORKING_DISTRIBUTOR_ASSIGNED";
  } else if (retailer.territoryId) {
    const candidates = await prisma.seeraPartner.findMany({
      where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE", territoryIds: { has: retailer.territoryId } },
      select: { id: true },
    });
    if (candidates.length === 1) {
      resolvedDistributorId = candidates[0]!.id;
      territoryResolved = true;
      routingOutcome = "SINGLE_TERRITORY_MATCH";
    } else if (candidates.length > 1) {
      routingOutcome = "MULTIPLE_DISTRIBUTOR_CANDIDATES";
      candidateDistributorIds = candidates.map((c) => c.id);
    } else {
      routingOutcome = "NO_DISTRIBUTOR_MAPPING";
    }
  } else {
    routingOutcome = "NO_DISTRIBUTOR_MAPPING";
  }
  timing.stage("distributor_company_direct_routing_resolution");
  // authorize() itself already ran (and would have thrown) inside the Promise.all above —
  // everything below is a synchronous check against its already-resolved scope query, not a new
  // round trip.
  if (context.sourcePortal === "sales-executive") {
    // Only a retailer that ALREADY had a known distributorId can be tampered with — comparing
    // against a null/unresolved assignment would reject the very "book as unassigned" case this
    // routing foundation exists to support.
    if (retailer.distributorId && retailer.distributorId !== context.commercialPartyId)
      throw new FoundationError(
        "FORGED_ASSIGNMENT",
        "Retailer assignment mismatch",
        403,
      );
  } else if (context.sourcePortal === "sales-manager") {
    const team = scopeQuery as { subjectId: string }[];
    const scopedSalespeople = [context.actorId, ...team.map((x) => x.subjectId)];
    if (
      retailer.salespersonId &&
      !scopedSalespeople.includes(retailer.salespersonId)
    )
      throw new FoundationError(
        "RETAILER_SCOPE_DENIED",
        "Retailer is outside your team's scope",
        403,
      );
  } else if (context.sourcePortal === "retailer") {
    if (!scopeQuery)
      throw new FoundationError(
        "RETAILER_SCOPE_DENIED",
        "Retailer account is not assigned to this business",
        403,
      );
  }
  // Company Direct governance (GAP-004 addendum): placing an order for a retailer already routed
  // through Company Direct requires the ACTING executive/manager themselves to be eligible — a
  // retailer legitimately assigned to Company Direct by an eligible Manager doesn't hand blanket
  // Company Direct authority to whichever field user happens to place the next order for it.
  // Retailer self-service orders (sourcePortal:"retailer") are unaffected — eligibility is a field
  // -force concept, not a retailer-portal one.
  if (
    resolvedDistributorId &&
    cdPartnerId &&
    resolvedDistributorId === cdPartnerId &&
    (context.sourcePortal === "sales-executive" || context.sourcePortal === "sales-manager") &&
    !(await isCompanyDirectEligible(prisma, context.actorId))
  )
    throw new FoundationError("COMPANY_DIRECT_NOT_ELIGIBLE", "You are not authorized to place orders through Company Direct", 403);
  timing.stage("authorize_and_scope_checks");
  // Empty-string sentinel for "no commercial party assigned yet" — the same convention
  // managerBookRetailerOrder already passes for this field; commercialPartyId itself is a
  // required (non-nullable) column, so this is the additive representation rather than a schema
  // change, matching the Founder's "minimum safe additive mechanism" instruction.
  const commercialPartyId = resolvedDistributorId ?? "";
  const commercialPartyType = "DISTRIBUTOR";
  const { order, isNew } = await prisma.$transaction(async (tx) => {
    const existing = await tx.seeraSalesOrder.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) return { order: existing, isNew: false };
    if ((territoryResolved || workingDistributorMapped) && resolvedDistributorId)
      await tx.seeraRetailer.update({ where: { id: retailer.id }, data: { distributorId: resolvedDistributorId } });
    timing.stage("tx_idempotency_check");
    // PERFORMANCE PHASE 2: this runs inside an interactive $transaction, which pins `tx` to a
    // SINGLE reserved connection — a per-line Promise.all here does NOT give real concurrency, it
    // just queues N (or up to 2N) round trips one after another on the wire while looking parallel
    // in source. Batched below: one findMany for every line's SKU, one findMany for every line that
    // still needs a governed price (client-submitted rate is normal path per Founder decision — see
    // comment further down), instead of a per-line query pair. `now` computed once for consistency
    // across the whole order (previously implicitly the same by being inside one request anyway).
    const now = new Date();
    const skuIds = Array.from(new Set(input.lines.map((l) => l.skuId)));
    const fetchedSkus = await tx.seeraSku.findMany({ where: { id: { in: skuIds } } });
    const skuById = new Map(fetchedSkus.map((s) => [s.id, s]));
    // Same not-found semantics as the previous per-line findUniqueOrThrow — only reached if a
    // submitted skuId isn't a real SKU at all, so paying for an individual lookup here (to get the
    // identical P2025 error) costs nothing in the normal, all-valid-SKUs path.
    for (const id of skuIds) if (!skuById.has(id)) await tx.seeraSku.findUniqueOrThrow({ where: { id } });
    timing.stage("tx_sku_lookup");

    const skuIdsNeedingGovernedPrice = Array.from(
      new Set(input.lines.filter((l) => !(typeof l.rate === "number" && l.rate > 0)).map((l) => l.skuId)),
    );
    const priceVersionBySkuId = new Map<string, Prisma.Decimal>();
    if (skuIdsNeedingGovernedPrice.length > 0) {
      const priceVersions = await tx.seeraPriceVersion.findMany({
        where: {
          skuId: { in: skuIdsNeedingGovernedPrice },
          tier: "DISTRIBUTOR_TO_RETAILER",
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      // Ordered desc — the first row seen per skuId is the latest, matching the previous
      // findFirstOrThrow's `orderBy: { effectiveFrom: "desc" }` semantics exactly.
      for (const pv of priceVersions) if (!priceVersionBySkuId.has(pv.skuId!)) priceVersionBySkuId.set(pv.skuId!, pv.amount);
      for (const id of skuIdsNeedingGovernedPrice)
        if (!priceVersionBySkuId.has(id))
          await tx.seeraPriceVersion.findFirstOrThrow({
            where: { skuId: id, tier: "DISTRIBUTOR_TO_RETAILER", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
            orderBy: { effectiveFrom: "desc" },
          });
    }
    timing.stage("tx_price_lookup");

    // GST/tax is computed here purely in-memory from sku.taxRate (already fetched above via
    // tx_sku_lookup) — no separate DB round trip, so it's not its own timing stage.
    const snapshots = input.lines.map((line) => {
      const sku = skuById.get(line.skuId)!;
      // Rate is editable by the Executive at field-order time (Founder decision — the field
      // screen no longer forces a fixed governed catalog price). A positive client-submitted
      // rate wins; only when one isn't supplied (older/other callers, e.g. Manager-assisted
      // flows not yet updated) does this fall back to the governed DISTRIBUTOR_TO_RETAILER
      // price version, preserving prior behavior for every other caller of this function.
      const unitRate = typeof line.rate === "number" && line.rate > 0 ? line.rate : Number(priceVersionBySkuId.get(line.skuId));
      return {
        sku,
        unitRate,
        quantity: line.quantity,
        total: unitRate * line.quantity,
        uom: line.uom,
        scheme: line.scheme,
      };
    });
    const subtotal = snapshots.reduce((sum, item) => sum + item.total, 0);
    // RUN 2B resume Section 12: taxTotal must reflect real EMBEDDED tax when the SKU carries a
    // governed taxRate — the line-level taxSnapshot below already derives this correctly via
    // deriveInclusiveTax; this just sums it onto the order header too, instead of a hardcoded 0
    // that would misreport tax the moment any SKU gets a real HSN/taxRate configured. Gross is
    // unaffected either way — total/subtotal are still exactly the sum of GST-inclusive line
    // totals, never taxable-plus-tax-again.
    const taxTotal = snapshots.reduce(
      (sum, item) => sum + (item.sku.taxRate == null ? 0 : deriveInclusiveTax(item.total, Number(item.sku.taxRate)).taxAmount),
      0,
    );
    const order = await tx.seeraSalesOrder.create({
      data: {
        orderNumber: numberFor("RO", input.idempotencyKey),
        type: "RETAILER_ORDER",
        status: "SUBMITTED",
        retailerId: retailer.id,
        sellerPartnerId: resolvedDistributorId,
        salespersonId:
          context.sourcePortal === "sales-executive" ||
          context.sourcePortal === "sales-manager"
            ? context.actorId
            : undefined,
        actorId: context.actorId,
        commercialPartyType,
        commercialPartyId,
        sourcePortal: context.sourcePortal,
        source,
        visitId: input.visitId,
        financialAcceptance: false,
        commercialPaymentType: input.commercialPaymentType,
        subtotal,
        discountTotal: 0,
        taxTotal,
        total: subtotal,
        requestedDeliveryAt: input.requestedDeliveryAt,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        submittedAt: new Date(),
        lines: {
          create: snapshots.map(({ sku, unitRate, quantity, total, uom, scheme }) => ({
            skuId: sku.id,
            skuCodeSnapshot: sku.code,
            productNameSnapshot: sku.productName,
            // Final Master Revision (Part 2, 22-Aug) + scheme support (22-Aug): when a UOM was
            // selected, packSnapshot shows it directly ("2 BOX (80 PC)"), plus "+ N FREE" when a
            // scheme applies — this is the one field every existing order-line display already
            // renders everywhere, so both become visible on every surface with no rendering-code
            // changes. Falls back to the plain physical pack description when neither applies.
            packSnapshot:
              (uom ? `${uom.uomQuantity} ${uom.unit} (${quantity} PC)` : `${sku.packSize} ${sku.unitType}`) +
              (scheme ? ` + ${scheme.freeQuantity} ${scheme.freeUom} FREE` : ""),
            priceSnapshot: unitRate,
            mrpSnapshot: sku.mrp,
            // Rate is GST-inclusive (Founder global rule) — taxable/tax are derived FROM unitRate,
            // never added on top of it; lineTotal (below) stays exactly unitRate*quantity. `quantity`
            // and `total` are the PAID amount only — a scheme's free units never reach this
            // calculation, so free goods can never inflate taxable value, GST, or the grand total.
            taxSnapshot:
              sku.taxRate == null
                ? undefined
                : (() => {
                    const { taxableValue, taxAmount } = deriveInclusiveTax(total, Number(sku.taxRate));
                    return { rate: sku.taxRate.toString(), hsn: sku.hsn, taxableValue, taxAmount };
                  })(),
            orderedQuantity: quantity,
            lineTotal: total,
            // Structured UOM + scheme snapshot (Founder field list: selectedUom/orderedUomQuantity/
            // packFactor/packCommercialRate/paidQuantity/paidUom/freeQuantity/freeUom/
            // paidBaseQuantity/freeBaseQuantity/schemeNote) — same schemeSnapshot-reuse convention
            // createCompanyOrder already established, no schema change. undefined when neither a
            // UOM nor a scheme was selected (the plain base-PC, no-scheme order — still the
            // overwhelmingly common case).
            schemeSnapshot:
              uom || scheme
                ? {
                    ...(uom ? { selectedUom: uom.unit, orderedUomQuantity: uom.uomQuantity, packFactor: uom.packFactor, packCommercialRate: unitRate * uom.packFactor } : {}),
                    paidQuantity: uom ? uom.uomQuantity : quantity,
                    paidUom: uom ? uom.unit : "PC",
                    paidBaseQuantity: quantity,
                    ...(scheme
                      ? {
                          freeQuantity: scheme.freeQuantity,
                          freeUom: scheme.freeUom,
                          freeBaseQuantity: scheme.freeBaseQuantity,
                          schemeNote: `+${scheme.freeQuantity} ${scheme.freeUom} FREE`,
                        }
                      : {}),
                  }
                : undefined,
          })),
        },
      },
      include: { lines: true },
    });
    // Commercial payment type is an order-level TERM only (informational, matches Founder
    // Section 12) — it never posts a ledger entry, never touches canonicalDistributorExposure,
    // and never runs through the payment/collection review pipeline. An Executive is never
    // treated as Accounts by recording it.
    await recordAudit(tx, {
      actorId: context.actorId,
      action: "retailer_order.submitted",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      details: { sourcePortal: context.sourcePortal, commercialPartyId, commercialPaymentType: input.commercialPaymentType ?? null },
    });
    if (routingOutcome !== "RETAILER_ASSIGNED")
      await tx.seeraStatusHistory.create({
        data: {
          entityType: "SeeraSalesOrder",
          entityId: order.id,
          fromStatus: null,
          toStatus: order.status,
          actorId: context.actorId,
          reason:
            routingOutcome === "MULTIPLE_DISTRIBUTOR_CANDIDATES"
              ? `MULTIPLE_DISTRIBUTOR_CANDIDATES:${candidateDistributorIds.join(",")}`
              : routingOutcome === "WORKING_DISTRIBUTOR_CONFLICT"
                ? `WORKING_DISTRIBUTOR_CONFLICT:${workingDistributorConflictId}`
                : routingOutcome === "WORKING_DISTRIBUTOR_ASSIGNED"
                  ? "WORKING_DISTRIBUTOR_ASSIGNED"
                  : routingOutcome === "SINGLE_TERRITORY_MATCH"
                    ? "SINGLE_TERRITORY_MATCH"
                    : "NO_DISTRIBUTOR_MAPPING",
        },
      });
    timing.stage("tx_order_create");
    return { order, isNew: true };
  }, {
    // PERFORMANCE / RELIABILITY: Prisma's interactive-transaction default (5000ms timeout, 2000ms
    // maxWait) was measured to be too tight for this transaction's real work (idempotency check +
    // SKU/price lookup + order+lines+audit+statusHistory create) under realistic connection-pool
    // latency — observed failing outright with P2028 "Transaction already closed" at ~5.8s against
    // TEST Neon under load. This was a genuine functional failure risk on the Executive's most
    // frequent write action, not just a UX slowness complaint. Widened, not the work reduced further
    // here — the queries themselves are already batched (see PERFORMANCE PHASE 2 comment above).
    timeout: 10_000,
    maxWait: 5_000,
  });
  timing.stage("transaction_commit");
  // PERFORMANCE PHASE 2 (P0 place-order SLO): both of these are side effects the order's own
  // success never depends on (documented below), and were previously AWAITED before the client
  // got a response — pure latency on the critical path. Deferred via Next.js's after() so they
  // run once the response has already been sent, the same mechanism this codebase already uses
  // for the WhatsApp dispatch-worker nudge (retailer-communication-service.ts). Both remain
  // best-effort (never throw into the caller) exactly as before — only WHEN they run changed, not
  // whether a failure here can affect the order's own committed state.
  const deferredNotifications = async () => {
    const notifyTiming = timeOperation("workflow.placeRetailerOrder.deferred");
    // No commercialPartyId means this order is unassigned for fulfilment (no Distributor mapped
    // yet) — nobody to notify; it surfaces instead via unassignedRetailerOrders() for Manager/
    // Admin routing.
    if (commercialPartyId) {
      await notifyPartyUsers(prisma, commercialPartyId, {
        title: "New retailer order",
        body: `${retailer.businessName} placed order ${order.orderNumber} awaiting fulfilment.`,
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        actionPath: "/portal/distributor/fulfilment",
      }).catch((error) => console.error("notify_party_users.failed", error));
    }
    notifyTiming.stage("notify_party_users");
    // Retailer-facing "your order was recorded" WhatsApp — moved here from executiveCheckOut
    // (Part A5: independent orders/day need independent notifications, not one tied to checkout
    // outcome using a "most recent order" guess that breaks once multiple orders/day are normal).
    // Always references THIS order's own id (never a lookup-by-recency), and only ever fires for a
    // genuinely new order — `isNew` guards a retried idempotencyKey from re-queuing a duplicate
    // send.
    if (isNew) {
      try {
        await queueRetailerCommunicationSafe(prisma, {
          eventType: "ORDER_RECORDED",
          retailerId: retailer.id,
          orderId: order.id,
          visitId: input.visitId,
          actorId: context.actorId,
        });
      } catch (error) {
        console.error("retailer_communication.queue_failed", error);
      }
    }
    notifyTiming.stage("queue_whatsapp");
    notifyTiming.finish({ actorId: context.actorId, orderId: order.id });
  };
  // after() throws SYNCHRONOUSLY outside a real Next.js request scope (bare scripts/tests) — same
  // guarded pattern already used by retailer-communication-service.ts's scheduleImmediateDispatchAttempt.
  // Falls back to awaiting inline so non-request callers still observe the identical end state.
  try {
    after(deferredNotifications);
  } catch {
    await deferredNotifications();
  }
  timing.finish({ actorId: context.actorId, retailerId: input.retailerId, lineCount: input.lines.length, source, isNew });
  return order;
}

export async function fulfilRetailerOrder(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: {
    orderId: string;
    accepted: { lineId: string; quantity: number }[];
    action: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT" | "HOLD";
    reason?: string;
  },
) {
  await authorize(prisma, { actorId, permission: "distributor_orders:fulfil" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: distributorId,
        type: "RETAILER_ORDER",
        status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order unavailable",
        403,
      );
    for (const accepted of input.accepted) {
      const line = order.lines.find((item) => item.id === accepted.lineId);
      if (
        !line ||
        accepted.quantity < 0 ||
        accepted.quantity > Number(line.orderedQuantity)
      )
        throw new FoundationError(
          "INVALID_ACCEPTED_QUANTITY",
          "Invalid line acceptance",
          400,
        );
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { acceptedQuantity: accepted.quantity },
      });
    }
    const status =
      input.action === "REJECT"
        ? "REJECTED"
        : input.action === "HOLD"
          ? "HELD"
          : input.action === "PARTIAL_ACCEPT"
            ? "PARTIAL_ACCEPTED"
            : "ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: status,
        actorId,
        reason: input.reason ?? input.action,
      },
    });
    const result = await tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status, acknowledgedAt: new Date() },
      include: { lines: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "retailer_order.decided",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      afterState: { status, decision: input.action, reason: input.reason ?? null },
    });
    return result;
  });
  // Stage 7 fix: ORDER_ACCEPTED/ORDER_PARTIAL were defined in the retailer-communication event
  // matrix (retailer-communication-service.ts) but never actually triggered anywhere — queued
  // AFTER commit (never inside the transaction) so a message is never queued for a decision that
  // didn't actually save. REJECT/HOLD have no governed retailer-facing template, so they're
  // deliberately not queued rather than inventing one.
  if (updated.retailerId && (updated.status === "ACCEPTED" || updated.status === "PARTIAL_ACCEPTED")) {
    try {
      await queueRetailerCommunicationSafe(prisma, {
        eventType: updated.status === "ACCEPTED" ? "ORDER_ACCEPTED" : "ORDER_PARTIAL",
        retailerId: updated.retailerId,
        orderId: updated.id,
        actorId,
      });
    } catch (error) {
      console.error("retailer_communication.queue_failed", error);
    }
  }
  return updated;
}

export async function createDistributorReplenishment(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: { idempotencyKey: string; notes?: string; lines: OrderLineInput[] },
) {
  await authorize(prisma, {
    actorId,
    permission: "distributor_replenishment:create",
  });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  if (!input.lines.length || input.lines.some((line) => line.quantity <= 0))
    throw new FoundationError(
      "INVALID_ORDER_LINES",
      "At least one positive order line is required",
      400,
    );
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.seeraSalesOrder.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { lines: true },
      });
      if (existing) return existing;
      const distributor = await tx.seeraPartner.findFirst({
        where: { id: distributorId, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
      });
      if (!distributor?.assignedSuperStockistId)
        throw new FoundationError(
          "UPSTREAM_STOCKIST_REQUIRED",
          "Distributor has no active Super Stockist assignment",
          409,
        );
      const stockist = await tx.seeraPartner.findFirst({
        where: {
          id: distributor.assignedSuperStockistId,
          type: "SUPER_STOCKIST",
          lifecycle: "ACTIVE",
        },
        select: { id: true },
      });
      if (!stockist)
        throw new FoundationError(
          "UPSTREAM_STOCKIST_UNAVAILABLE",
          "Assigned Super Stockist is unavailable",
          409,
        );
      const now = new Date();
      const snapshots = await Promise.all(
        input.lines.map(async (line) => {
          const sku = await tx.seeraSku.findFirst({
            where: { id: line.skuId, status: "ACTIVE" },
          });
          if (!sku)
            throw new FoundationError(
              "SKU_UNAVAILABLE",
              "An ordered SKU is unavailable",
              409,
            );
          const price = await resolveDistributorPurchaseRate(tx, sku.id, sku.code, now);
          if (!price)
            throw new FoundationError(
              "PRICE_UNAVAILABLE",
              `No active distributor price for ${sku.code}`,
              409,
            );
          // Founder correction 22-Aug: the governed/derived distributor rate is a BASIC (ex-GST)
          // rate, not GST-inclusive — GST must be added on top, never extracted from it. Reuses the
          // same governed priceModeForBrand/deriveExclusiveTax convention document-lines.ts already
          // established (Seera brand = GST_EXCLUSIVE) instead of inventing a new rule, so a future
          // MUV SKU reaching this same order type would still correctly stay GST-inclusive.
          const gross = price.amount * line.quantity;
          const priceMode = priceModeForBrand(sku.brand);
          const { taxableValue, taxAmount } =
            sku.taxRate == null
              ? { taxableValue: gross, taxAmount: 0 }
              : priceMode === "GST_INCLUSIVE"
                ? deriveInclusiveTax(gross, Number(sku.taxRate))
                : deriveExclusiveTax(gross, Number(sku.taxRate));
          const lineTotal = priceMode === "GST_INCLUSIVE" ? gross : taxableValue + taxAmount;
          return {
            sku,
            price,
            quantity: line.quantity,
            taxableValue,
            taxAmount,
            lineTotal,
          };
        }),
      );
      // subtotal = sum of taxable (basic) values; taxTotal = sum of GST; total = subtotal+taxTotal
      // — correct for BOTH modes: GST_EXCLUSIVE (subtotal=basic, taxTotal=added-on-top GST) and
      // GST_INCLUSIVE (taxableValue is already tax-extracted from gross, so subtotal+taxTotal
      // reconstructs the original inclusive gross exactly).
      const subtotal = snapshots.reduce((sum, line) => sum + line.taxableValue, 0);
      const taxTotal = snapshots.reduce((sum, line) => sum + line.taxAmount, 0);
      const terms = await tx.seeraCreditTerm.findFirst({
        where: {
          distributorId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      // Founder decision 22-Aug: a Distributor's own replenishment order to its authorised S.S.
      // must never be blocked by credit configuration/limit/overdue state — that barrier applied
      // only to THIS submission path. canonicalDistributorExposure/evaluateDistributorCredit are
      // untouched and still govern everywhere else (Distributor Credit page, Finance/Accounts
      // views, and releaseHeldDistributorOrder below for any order that reaches HELD another way).
      // Missing terms no longer throws CREDIT_TERMS_REQUIRED; terms.creditDays only informs the
      // recorded due date when terms genuinely exist — never invented.
      const contractualCreditDays = terms?.creditDays ?? null;
      const originalDueDate = terms ? new Date(now.getTime() + terms.creditDays * 86_400_000) : null;
      const order = await tx.seeraSalesOrder.create({
        data: {
          orderNumber: numberFor("DO", input.idempotencyKey),
          type: "DISTRIBUTOR_REPLENISHMENT",
          status: "SUBMITTED",
          buyerPartnerId: distributorId,
          sellerPartnerId: stockist.id,
          actorId,
          commercialPartyType: "DISTRIBUTOR",
          commercialPartyId: distributorId,
          sourcePortal: "distributor",
          financialAcceptance: true,
          subtotal,
          discountTotal: 0,
          taxTotal,
          // Correct for both price modes (see snapshot derivation above): GST_EXCLUSIVE means
          // total = basic subtotal + added GST; GST_INCLUSIVE means subtotal is already
          // tax-extracted from the original inclusive gross, so subtotal+taxTotal reconstructs it.
          total: subtotal + taxTotal,
          contractualCreditDays,
          originalDueDate,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          submittedAt: now,
          lines: {
            create: snapshots.map(({ sku, price, quantity, taxableValue, taxAmount, lineTotal }) => ({
              skuId: sku.id,
              skuCodeSnapshot: sku.code,
              productNameSnapshot: sku.productName,
              packSnapshot: `${sku.packSize} ${sku.unitType}`,
              priceSnapshot: price.amount,
              mrpSnapshot: sku.mrp,
              taxSnapshot: sku.taxRate == null ? undefined : { rate: sku.taxRate.toString(), hsn: sku.hsn, taxableValue, taxAmount },
              orderedQuantity: quantity,
              lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
      await recordAudit(tx, {
        actorId,
        action: "distributor_replenishment.submitted",
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        afterState: {
          orderNumber: order.orderNumber,
          total: subtotal,
        },
      });
      await notifyPartyUsers(tx, stockist.id, {
        title: "New distributor order",
        body: `${distributor.tradeName ?? distributor.legalName} placed order ${order.orderNumber} awaiting fulfilment.`,
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        actionPath: "/portal/super-stockist/distributor-orders",
      });
      return order;
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );
}

export async function fulfilDistributorReplenishment(
  prisma: PrismaClient,
  actorId: string,
  stockistId: string,
  input: {
    orderId: string;
    accepted: { lineId: string; quantity: number }[];
    action: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT" | "HOLD";
    reason?: string;
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "super_stockist_orders:fulfil",
  });
  await requirePartyMembership(prisma, actorId, stockistId, "SUPER_STOCKIST");
  // createDistributorReplenishment already put this order into HELD because credit evaluation
  // returned BLOCK/HOLD/OVERRIDE_REQUIRED — accepting or partially accepting a HELD order must
  // re-check the CURRENT credit position (it may have changed since submission) rather than
  // silently letting the S.S. push through an order its own Distributor is blocked on. An
  // override requires its own, narrower permission and is fully audited (actor/reason/timestamp).
  // Checked here, before the transaction, since `authorize`/`effectivePermissions` need a full
  // PrismaClient, not the interactive-transaction client.
  if (input.action === "ACCEPT" || input.action === "PARTIAL_ACCEPT") {
    const heldOrder = await prisma.seeraSalesOrder.findFirst({
      where: { id: input.orderId, sellerPartnerId: stockistId, type: "DISTRIBUTOR_REPLENISHMENT", status: "HELD" },
    });
    if (heldOrder && heldOrder.buyerPartnerId) {
      const terms = await prisma.seeraCreditTerm.findFirst({
        where: { distributorId: heldOrder.buyerPartnerId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
        orderBy: { effectiveFrom: "desc" },
      });
      if (terms) {
        const { exposure: outstanding } = await canonicalDistributorExposure(prisma, heldOrder.buyerPartnerId, new Date());
        const credit = evaluateDistributorCredit({
          creditEnabled: terms.creditEnabled,
          creditLimit: Number(terms.creditLimit),
          outstanding,
          orderValue: Number(heldOrder.total),
          warningThreshold: terms.warningThreshold == null ? null : Number(terms.warningThreshold),
          blockThreshold: terms.blockThreshold == null ? null : Number(terms.blockThreshold),
          now: new Date(),
        });
        if (["BLOCK", "HOLD", "OVERRIDE_REQUIRED"].includes(credit.decision)) {
          const permissions = await effectivePermissions(prisma, actorId);
          if (!permissions.has("partner_credit:override") && !permissions.has("system:super_admin"))
            throw new FoundationError("DISTRIBUTOR_CREDIT_HELD", `Distributor remains ${credit.decision} on credit (${credit.availableCredit} available) — an authorized override is required`, 409);
          if (!input.reason?.trim())
            throw new FoundationError("CREDIT_OVERRIDE_REASON_REQUIRED", "A reason is required to override a credit hold", 400);
        }
      }
    }
  }
  return prisma.$transaction(async (tx) => {
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: stockistId,
        type: "DISTRIBUTOR_REPLENISHMENT",
        status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order unavailable",
        403,
      );
    for (const accepted of input.accepted) {
      const line = order.lines.find(
        (candidate) => candidate.id === accepted.lineId,
      );
      if (
        !line ||
        accepted.quantity < 0 ||
        accepted.quantity > Number(line.orderedQuantity)
      )
        throw new FoundationError(
          "INVALID_ACCEPTED_QUANTITY",
          "Invalid line acceptance",
          400,
        );
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { acceptedQuantity: accepted.quantity },
      });
    }
    const status =
      input.action === "REJECT"
        ? "REJECTED"
        : input.action === "HOLD"
          ? "HELD"
          : input.action === "PARTIAL_ACCEPT"
            ? "PARTIAL_ACCEPTED"
            : "ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: status,
        actorId,
        reason: input.reason ?? input.action,
      },
    });
    const updated = await tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status, acknowledgedAt: new Date() },
      include: { lines: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "distributor_replenishment.decided",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      afterState: { status, decision: input.action, reason: input.reason ?? null },
    });
    return updated;
  });
}

function computeRemainingLineQuantity(line: {
  orderedQuantity: number | Prisma.Decimal;
  acceptedQuantity: number | Prisma.Decimal;
  cancelledQuantity: number | Prisma.Decimal;
}) {
  return (
    Number(line.orderedQuantity) -
    Number(line.acceptedQuantity) -
    Number(line.cancelledQuantity)
  );
}

export async function fulfilRemainingOrderQuantity(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    orderId: string;
    lines: { lineId: string; quantity: number }[];
    reason?: string;
  },
) {
  await authorize(prisma, {
    actorId,
    permission:
      input.partyType === "DISTRIBUTOR"
        ? "distributor_orders:fulfil"
        : "super_stockist_orders:fulfil",
  });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  return prisma.$transaction(async (tx) => {
    // Stage 1C fix: the "easy mode" collapsed Accept action (acceptAndPrepareRetailerOrder /
    // acceptAndAllocateDistributorOrder) always drives a PARTIAL_ACCEPT straight through to
    // ALLOCATED/DISPATCHED in the same call — the order never lingers at PARTIAL_ACCEPTED the way
    // the older step-by-step workflow assumed. Gating only on ACCEPTED/PARTIAL_ACCEPTED/HELD made
    // the still-outstanding balance of every easy-mode partial order structurally unreachable
    // through this function (and therefore invisible on the "remaining" screen, which queries this
    // same status set — see the matching OperationalWorkspace.tsx fix). allocatedQuantity/
    // dispatchedQuantity are tracked as running per-line totals and every downstream call
    // (allocateOrderStock/dispatchAllocatedOrder) is delta-based and idempotent, so re-entering from
    // a further-along status to accept MORE quantity is safe — it never double-reserves or
    // double-dispatches what was already handled.
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: input.partyId,
        status: { in: ["ACCEPTED", "PARTIAL_ACCEPTED", "HELD", "ALLOCATED", "DISPATCH_READY", "DISPATCHED", "PARTIAL_DELIVERED"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order is not open for a remaining-quantity decision",
        403,
      );
    let anyChange = false;
    for (const request of input.lines) {
      if (request.quantity <= 0) continue;
      const line = order.lines.find((item) => item.id === request.lineId);
      if (!line)
        throw new FoundationError("INVALID_REMAINING_LINE", "Unknown order line", 400);
      const remaining = computeRemainingLineQuantity(line);
      if (request.quantity > remaining)
        throw new FoundationError(
          "INVALID_REMAINING_QUANTITY",
          `Requested quantity exceeds the remaining balance for ${line.productNameSnapshot}`,
          400,
        );
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { acceptedQuantity: { increment: request.quantity } },
      });
      anyChange = true;
    }
    if (!anyChange)
      throw new FoundationError(
        "NO_REMAINING_QUANTITY_FULFILLED",
        "No remaining quantity was fulfilled",
        400,
      );
    const refreshedLines = await tx.seeraOrderLine.findMany({
      where: { orderId: order.id },
    });
    const stillRemaining = refreshedLines.some(
      (line) => computeRemainingLineQuantity(line) > 0,
    );
    const nextStatus = stillRemaining ? "PARTIAL_ACCEPTED" : "ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        actorId,
        reason: input.reason?.trim() || "Remaining quantity fulfilled",
      },
    });
    const updated = await tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
      include: { lines: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "order.remaining_fulfilled",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      afterState: { status: nextStatus, lines: input.lines },
    });
    return updated;
  });
}

export async function closeRemainingOrderQuantity(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    orderId: string;
    reason: string;
  },
) {
  await authorize(prisma, {
    actorId,
    permission:
      input.partyType === "DISTRIBUTOR"
        ? "distributor_orders:fulfil"
        : "super_stockist_orders:fulfil",
  });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  if (!input.reason?.trim())
    throw new FoundationError(
      "REMAINING_CLOSE_REASON_REQUIRED",
      "A reason is required to close the remaining balance",
      400,
    );
  return prisma.$transaction(async (tx) => {
    // Same reachability fix as fulfilRemainingOrderQuantity above — an easy-mode partial order is
    // never left sitting at PARTIAL_ACCEPTED, so closing its leftover balance needs the same
    // broadened status set.
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: input.partyId,
        status: { in: ["ACCEPTED", "PARTIAL_ACCEPTED", "HELD", "ALLOCATED", "DISPATCH_READY", "DISPATCHED", "PARTIAL_DELIVERED"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order is not open for a remaining-quantity decision",
        403,
      );
    let anyClosed = false;
    for (const line of order.lines) {
      const remaining = computeRemainingLineQuantity(line);
      if (remaining <= 0) continue;
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { cancelledQuantity: { increment: remaining } },
      });
      anyClosed = true;
    }
    if (!anyClosed)
      throw new FoundationError(
        "NOTHING_REMAINING_TO_CLOSE",
        "There is no remaining balance to close",
        400,
      );
    const refreshedLines = await tx.seeraOrderLine.findMany({
      where: { orderId: order.id },
    });
    const totalAccepted = refreshedLines.reduce(
      (sum, line) => sum + Number(line.acceptedQuantity),
      0,
    );
    const nextStatus = totalAccepted <= 0 ? "REJECTED" : "PARTIAL_ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        actorId,
        reason: input.reason.trim(),
      },
    });
    const updated = await tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
      include: { lines: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "order.remaining_closed",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      afterState: { status: nextStatus, reason: input.reason.trim() },
    });
    return updated;
  });
}

export async function allocateOrderStock(prisma:PrismaClient,actorId:string,input:{partyType:"DISTRIBUTOR"|"SUPER_STOCKIST";partyId:string;orderId:string;lines:{lineId:string;quantity:number}[];idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:input.partyType==="DISTRIBUTOR"?"distributor_orders:fulfil":"super_stockist_orders:fulfil"});
  await requirePartyMembership(prisma,actorId,input.partyId,input.partyType);
  return prisma.$transaction(async(tx)=>{
    const order=await tx.seeraSalesOrder.findFirst({where:{id:input.orderId,sellerPartnerId:input.partyId,status:{in:["ACCEPTED","PARTIAL_ACCEPTED"]}},include:{lines:true}});
    if(!order)throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED","Order is not ready for allocation",403);
    for(const request of input.lines){const line=order.lines.find((x)=>x.id===request.lineId);if(!line||request.quantity<0||request.quantity>Number(line.acceptedQuantity))throw new FoundationError("INVALID_ALLOCATION_QUANTITY","Allocation exceeds the accepted quantity",400);
      // This function is called more than once per order (e.g. deliverRemainingRetailerOrder
      // re-allocates the full cumulative acceptedQuantity for a second delivery slice). A RESERVE
      // movement must only ever cover the NEW quantity on top of what's already allocated for this
      // line — reserving `request.quantity` again in full on every call double-counts the first
      // slice's reservation and leaves it permanently stuck in `reserved`, understating Available
      // stock forever. Only the delta is reserved; the already-allocated portion was reserved (and,
      // once dispatched, released) by the earlier call.
      const alreadyAllocated=Number(line.allocatedQuantity);const delta=request.quantity-alreadyAllocated;
      // STAGE 12: allocatedQuantity/delta stay in the order's own commercial unit (this function is
      // shared by a S.S. fulfilling a Box/Bag-priced DISTRIBUTOR_REPLENISHMENT line and a Distributor
      // fulfilling an already-piece-denominated RETAILER_ORDER line). The physical stock ledger this
      // reserves against is canonical pieces, so a wholesale line's delta must be converted before it
      // ever reaches the availability check or the RESERVE movement — a RETAILER_ORDER line is never
      // converted, since it's already pieces by design.
      const deltaPieces=order.type==="RETAILER_ORDER"?delta:wholesaleOrderUnitToCanonicalPieces(line.skuCodeSnapshot,delta);
      if(delta>0){const movements=await tx.seeraInventoryMovement.findMany({where:{partyType:input.partyType,partyId:input.partyId,skuId:line.skuId},select:{direction:true,quantity:true},orderBy:{occurredAt:"asc"}});const position=inventoryPosition(movements.map((x)=>({direction:x.direction,quantity:Number(x.quantity)})));const short=deltaPieces>position.onHand-position.reserved;
        // Founder decision 22-Aug, extended in the Final Master Revision (Part 5) to
        // DISTRIBUTOR_REPLENISHMENT: stock stays an OPTIONAL operational record for BOTH the
        // Executive->Distributor (RETAILER_ORDER) and S.S.->Distributor (DISTRIBUTOR_REPLENISHMENT)
        // flows — most Distributors AND most Super Stockists never maintain a live Seera stock
        // ledger at all, and a party who genuinely has never recorded a movement for this SKU
        // (`movements.length===0`, i.e. untracked) must not be hard-blocked on a fabricated "zero
        // stock." A party who DOES track stock for this SKU and is genuinely short on it still gets
        // a real, governed block — this only removes the block for the untracked case, it does not
        // weaken real stock discipline for whoever actually keeps one.
        const untracked = movements.length === 0;
        if(order.type==="RETAILER_ORDER"||untracked){if(!short)await tx.seeraInventoryMovement.create({data:{partyType:input.partyType,partyId:input.partyId,skuId:line.skuId,type:"ALLOCATION",direction:"RESERVE",quantity:deltaPieces,sourceType:"SeeraSalesOrder",sourceId:order.id,actorId,sourcePortal:input.partyType==="DISTRIBUTOR"?"distributor":"super-stockist",reason:"Order allocation",idempotencyKey:`${input.idempotencyKey}-${line.id}`}});}
        else{if(short)throw new FoundationError("INSUFFICIENT_AVAILABLE_STOCK",`Available stock is insufficient for ${line.productNameSnapshot}`,409);await tx.seeraInventoryMovement.create({data:{partyType:input.partyType,partyId:input.partyId,skuId:line.skuId,type:"ALLOCATION",direction:"RESERVE",quantity:deltaPieces,sourceType:"SeeraSalesOrder",sourceId:order.id,actorId,sourcePortal:input.partyType==="DISTRIBUTOR"?"distributor":"super-stockist",reason:"Order allocation",idempotencyKey:`${input.idempotencyKey}-${line.id}`}});}}
      if(request.quantity!==alreadyAllocated)await tx.seeraOrderLine.update({where:{id:line.id},data:{allocatedQuantity:request.quantity}});}
    await tx.seeraStatusHistory.create({data:{entityType:"SeeraSalesOrder",entityId:order.id,fromStatus:order.status,toStatus:"ALLOCATED",actorId,reason:"Stock allocated"}});
    const updated = await tx.seeraSalesOrder.update({where:{id:order.id},data:{status:"ALLOCATED"},include:{lines:true}});
    await recordAudit(tx,{actorId,action:"order.allocated",entityType:"SeeraSalesOrder",entityId:order.id,afterState:{lines:input.lines}});
    return updated;
  },{isolationLevel:"Serializable",timeout:15000});
}

export async function dispatchAllocatedOrder(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    orderId: string;
    idempotencyKey: string;
    vehicleNumber?: string;
    driverName?: string;
    driverMobile?: string;
    transporterName?: string;
    lrNumber?: string;
    challanNumber?: string;
    invoiceDocumentId?: string;
    eta?: Date;
  },
) {
  await authorize(prisma, {
    actorId,
    permission:
      input.partyType === "DISTRIBUTOR"
        ? "distributor_orders:fulfil"
        : "super_stockist_orders:fulfil",
  });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  // OUT_FOR_DELIVERY fix (Founder UAT, closes a registered P1): dispatchAllocatedOrder is the ONE
  // shared function for both Distributor->Retailer dispatch AND S.S.->Distributor dispatch
  // (partyType distinguishes them) — captured here, inside the transaction where the order's real
  // type/retailerId are known, so the retailer-facing message queued after commit (same
  // queue-after-commit pattern as ORDER_ACCEPTED/DELIVERED above) can never fire for a
  // DISTRIBUTOR_REPLENISHMENT/COMPANY_REPLENISHMENT dispatch — only ever a genuine RETAILER_ORDER.
  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.seeraDelivery.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return { delivery: existing, dispatchedRetailerOrder: null };
      const order = await tx.seeraSalesOrder.findFirst({
        where: {
          id: input.orderId,
          sellerPartnerId: input.partyId,
          status: { in: ["ALLOCATED", "DISPATCH_READY"] },
        },
        include: { lines: true },
      });
      if (!order)
        throw new FoundationError(
          "ORDER_SCOPE_OR_STATE_DENIED",
          "Order is not ready for dispatch",
          403,
        );
      const dispatchedRetailerOrder = { retailerId: order.retailerId, type: order.type, orderId: order.id };
      for (const line of order.lines) {
        const quantity =
          Number(line.allocatedQuantity) - Number(line.dispatchedQuantity);
        if (quantity <= 0) continue;
        // STAGE 12: `quantity` above stays in the order's own commercial unit and drives the
        // SeeraOrderLine.dispatchedQuantity update below, unchanged — but the RELEASE/DISPATCH
        // movements written to the physical stock ledger must use the SAME canonical-pieces
        // conversion allocateOrderStock used for the matching RESERVE, or the RELEASE never fully
        // cancels it out for a wholesale (Box/Bag) line. A RETAILER_ORDER line is never converted.
        const quantityPieces = order.type === "RETAILER_ORDER" ? quantity : wholesaleOrderUnitToCanonicalPieces(line.skuCodeSnapshot, quantity);
        await tx.seeraInventoryMovement.createMany({
          data: [
            {
              partyType: input.partyType,
              partyId: input.partyId,
              skuId: line.skuId,
              type: "RELEASE",
              direction: "RELEASE",
              quantity: quantityPieces,
              sourceType: "SeeraSalesOrder",
              sourceId: order.id,
              actorId,
              sourcePortal:
                input.partyType === "DISTRIBUTOR" ? "distributor" : "super-stockist",
              reason: "Allocated stock dispatched",
              idempotencyKey: `${input.idempotencyKey}-release-${line.id}`,
            },
            {
              partyType: input.partyType,
              partyId: input.partyId,
              skuId: line.skuId,
              type: "DISPATCH",
              direction: "OUT",
              quantity: quantityPieces,
              sourceType: "SeeraSalesOrder",
              sourceId: order.id,
              actorId,
              sourcePortal:
                input.partyType === "DISTRIBUTOR" ? "distributor" : "super-stockist",
              reason: "Order dispatch",
              idempotencyKey: `${input.idempotencyKey}-out-${line.id}`,
            },
          ],
        });
        await tx.seeraOrderLine.update({
          where: { id: line.id },
          data: { dispatchedQuantity: { increment: quantity } },
        });
      }
      await tx.seeraStatusHistory.create({
        data: {
          entityType: "SeeraSalesOrder",
          entityId: order.id,
          fromStatus: order.status,
          toStatus: "DISPATCHED",
          actorId,
          reason: "Order dispatched",
        },
      });
      await tx.seeraSalesOrder.update({
        where: { id: order.id },
        data: { status: "DISPATCHED", dispatchedAt: new Date() },
      });
      const delivery = await tx.seeraDelivery.create({
        data: {
          orderId: order.id,
          status: "PENDING",
          quantities: {},
          actorId,
          idempotencyKey: input.idempotencyKey,
          vehicleNumber: input.vehicleNumber,
          driverName: input.driverName,
          driverMobile: input.driverMobile,
          transporterName: input.transporterName,
          lrNumber: input.lrNumber,
          challanNumber: input.challanNumber,
          invoiceDocumentId: input.invoiceDocumentId,
          eta: input.eta,
        },
      });
      await recordAudit(tx, {
        actorId,
        action: "order.dispatched",
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        afterState: {
          deliveryId: delivery.id,
          vehicleNumber: input.vehicleNumber ?? null,
          lrNumber: input.lrNumber ?? null,
          challanNumber: input.challanNumber ?? null,
        },
      });
      return { delivery, dispatchedRetailerOrder };
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
  // Queued after commit (same pattern as ORDER_ACCEPTED/DELIVERED elsewhere in this file) and
  // strictly gated on RETAILER_ORDER — this is the one function shared by Distributor->Retailer
  // AND S.S.->Distributor dispatch, so without this guard a Distributor/S.S. replenishment dispatch
  // would incorrectly queue a retailer-facing message.
  const { delivery, dispatchedRetailerOrder } = result;
  if (dispatchedRetailerOrder && dispatchedRetailerOrder.type === "RETAILER_ORDER" && dispatchedRetailerOrder.retailerId) {
    try {
      await queueRetailerCommunicationSafe(prisma, {
        eventType: "OUT_FOR_DELIVERY",
        retailerId: dispatchedRetailerOrder.retailerId,
        orderId: dispatchedRetailerOrder.orderId,
        actorId,
      });
    } catch (error) {
      console.error("retailer_communication.queue_failed", error);
    }
  }
  return delivery;
}

export async function receiveIncomingOrder(prisma:PrismaClient,actorId:string,input:{partyType:"DISTRIBUTOR"|"SUPER_STOCKIST";partyId:string;orderId:string;lines:{lineId:string;quantity:number}[];reason?:string;idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:input.partyType==="DISTRIBUTOR"?"distributor_inventory:adjust":"super_stockist_inventory:adjust"});
  await requirePartyMembership(prisma,actorId,input.partyId,input.partyType);
  return prisma.$transaction(async(tx)=>{const order=await tx.seeraSalesOrder.findFirst({where:{id:input.orderId,buyerPartnerId:input.partyId,status:{in:["DISPATCHED","PARTIAL_DELIVERED","DELIVERED"]}},include:{lines:true}});if(!order)throw new FoundationError("INCOMING_ORDER_SCOPE_DENIED","Incoming order is unavailable",403);const shortages:{lineId:string;skuId:string;expected:number;received:number}[]=[];for(const receipt of input.lines){const line=order.lines.find((x)=>x.id===receipt.lineId);if(!line||receipt.quantity<0)throw new FoundationError("INVALID_RECEIPT_QUANTITY","Invalid receipt quantity",400);
      // STAGE 12: `already`/`expected`/`receipt.quantity` stay in the order's own commercial unit
      // (e.g. Boxes) throughout this shortage-tracking comparison — never rewritten. Only the
      // SeeraInventoryMovement row actually written below (the physical stock ledger, which a
      // RETAILER_ORDER also writes to, always in pieces) is converted to canonical physical pieces,
      // via the single conversion boundary in company-order-catalog.ts. The previously-recorded IN
      // movements this aggregate reads back were written by this same converted path, so translating
      // their piece sum back to order-units here (rather than re-deriving from order-line fields) is
      // exact, not an approximation.
      const previous=await tx.seeraInventoryMovement.aggregate({where:{partyType:input.partyType,partyId:input.partyId,skuId:line.skuId,sourceType:"IncomingReceipt",sourceId:order.id,direction:"IN"},_sum:{quantity:true}}),already=canonicalPiecesToWholesaleOrderUnit(line.skuCodeSnapshot,Number(previous._sum.quantity??0)),expected=Number(line.dispatchedQuantity);if(receipt.quantity>expected-already)throw new FoundationError("OVER_RECEIPT_DENIED","Receipt exceeds the remaining dispatched quantity",409);if(receipt.quantity>0)await tx.seeraInventoryMovement.create({data:{partyType:input.partyType,partyId:input.partyId,skuId:line.skuId,type:"RECEIPT",direction:"IN",quantity:wholesaleOrderUnitToCanonicalPieces(line.skuCodeSnapshot,receipt.quantity),sourceType:"IncomingReceipt",sourceId:order.id,actorId,sourcePortal:input.partyType==="DISTRIBUTOR"?"distributor":"super-stockist",reason:input.reason?.trim()||"Confirmed incoming receipt",idempotencyKey:`${input.idempotencyKey}-${line.id}`}});if(receipt.quantity<expected-already)shortages.push({lineId:line.id,skuId:line.skuId,expected:expected-already,received:receipt.quantity});}if(shortages.length){if(!input.reason?.trim())throw new FoundationError("SHORT_RECEIPT_REASON_REQUIRED","A reason is required for a short receipt",400);await tx.seeraClaim.create({data:{claimNumber:numberFor("SC",input.idempotencyKey),claimantType:input.partyType,claimantId:input.partyId,againstPartyType:order.sellerPartnerId?(input.partyType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY"):"COMPANY",againstPartyId:order.sellerPartnerId??"SEERA_COMPANY",type:"SHORT_DELIVERY",sourceType:"SeeraSalesOrder",sourceId:order.id,details:{shortages,reason:input.reason},actorId,idempotencyKey:`${input.idempotencyKey}-claim`}});}await recordAudit(tx,{actorId,action:"incoming_stock.received",entityType:"SeeraSalesOrder",entityId:order.id,afterState:{partyId:input.partyId,shortages}});return{orderId:order.id,shortages};},{isolationLevel:"Serializable",timeout:15000});
}

export async function recordInventoryMovement(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    skuId: string;
    type:
      | "OPENING"
      | "RECEIPT"
      | "ALLOCATION"
      | "RELEASE"
      | "DISPATCH"
      | "DELIVERY"
      | "RETURN"
      | "DAMAGE"
      | "SHORTAGE"
      | "ADJUSTMENT"
      | "RECONCILIATION"
      | "OFF_SYSTEM_ISSUE"
      | "CORRECTION";
    direction: "IN" | "OUT" | "RESERVE" | "RELEASE";
    quantity: number;
    sourceType: string;
    sourceId: string;
    sourcePortal: string;
    reason: string;
    idempotencyKey: string;
    approvalId?: string;
    onBehalfOfPartyId?: string;
  },
) {
  const permission =
    input.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:adjust"
      : "super_stockist_inventory:adjust";
  await authorize(prisma, { actorId, permission });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  const previous = await prisma.seeraInventoryMovement.findMany({
    where: {
      partyType: input.partyType,
      partyId: input.partyId,
      skuId: input.skuId,
    },
    select: { direction: true, quantity: true },
    orderBy: { occurredAt: "asc" },
  });
  inventoryPosition([
    ...previous.map((item) => ({
      direction: item.direction,
      quantity: Number(item.quantity),
    })),
    { direction: input.direction, quantity: input.quantity },
  ]);
  const movement = await prisma.seeraInventoryMovement.create({ data: { ...input, actorId } });
  // Completeness fix (Founder UAT connection re-audit): every other governed mutation in this file
  // calls recordAudit — this manual/exception-only stock-adjustment tool was the one gap, so a
  // unilateral ADJUSTMENT/CORRECTION had no audit-log trail even though it can never overwrite/
  // delete a prior movement row (append-only, confirmed elsewhere in this file).
  await recordAudit(prisma, {
    actorId,
    action: "inventory.movement_recorded",
    entityType: "SeeraInventoryMovement",
    entityId: movement.id,
    reason: input.reason,
    afterState: { partyType: input.partyType, partyId: input.partyId, skuId: input.skuId, type: input.type, direction: input.direction, quantity: input.quantity },
  });
  return movement;
}

export async function reconcileStock(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    periodEnd: Date;
    sourcePortal: string;
    reason: string;
    idempotencyKey: string;
    lines: {
      skuId: string;
      opening: number;
      receipts: number;
      issues: number;
      physicalClosing: number;
      reason: string;
    }[];
  },
) {
  const permission =
    input.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:reconcile"
      : "super_stockist_inventory:reconcile";
  await authorize(prisma, { actorId, permission });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  return prisma.seeraStockReconciliation.create({
    data: {
      partyType: input.partyType,
      partyId: input.partyId,
      periodEnd: input.periodEnd,
      actorId,
      sourcePortal: input.sourcePortal,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      lines: {
        create: input.lines.map((line) => {
          const systemClosing = line.opening + line.receipts - line.issues;
          return {
            skuId: line.skuId,
            openingQuantity: line.opening,
            receiptQuantity: line.receipts,
            issueQuantity: line.issues,
            systemClosing,
            physicalClosing: line.physicalClosing,
            variance: reconciliationVariance(
              systemClosing,
              line.physicalClosing,
            ),
            reason: line.reason,
          };
        }),
      },
    },
    include: { lines: true },
  });
}

export async function recordPaymentPromise(
  prisma: PrismaClient,
  actorId: string,
  input: {
    orderId: string;
    partyId?: string;
    promisedPaymentDate: Date;
    reason: string;
    verbalCommitmentContext?: string;
    sourcePortal: "sales-manager" | "super-stockist";
  },
) {
  await authorize(prisma, { actorId, permission: "payment_promise:create" });
  if (input.sourcePortal === "super-stockist") {
    if (!input.partyId)
      throw new FoundationError(
        "PARTY_SCOPE_REQUIRED",
        "The recording Super Stockist must be specified",
        400,
      );
    await requirePartyMembership(prisma, actorId, input.partyId, "SUPER_STOCKIST");
  }
  const order = await prisma.seeraSalesOrder.findUniqueOrThrow({
    where: { id: input.orderId },
  });
  if (
    input.sourcePortal === "super-stockist" &&
    order.sellerPartnerId !== input.partyId
  )
    throw new FoundationError(
      "ORDER_SCOPE_OR_STATE_DENIED",
      "Order is outside this Super Stockist's scope",
      403,
    );
  if (!order.originalDueDate)
    throw new FoundationError(
      "ORIGINAL_DUE_DATE_REQUIRED",
      "Original due date is required",
      409,
    );
  assertPromisePreservesContract({
    originalDueDate: order.originalDueDate,
    storedOriginalDueDate: order.originalDueDate,
    promisedPaymentDate: input.promisedPaymentDate,
  });
  return prisma.seeraPaymentPromise.create({
    data: {
      orderId: order.id,
      originalDueDate: order.originalDueDate,
      promisedPaymentDate: input.promisedPaymentDate,
      reason: input.reason,
      verbalCommitmentContext: input.verbalCommitmentContext,
      actorId,
      sourcePortal: input.sourcePortal,
    },
  });
}

export async function createCompanyOrder(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: {
    idempotencyKey: string;
    lines: OrderLineInput[];
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "company_replenishment:create",
  });
  await requirePartyMembership(
    prisma,
    actorId,
    superStockistId,
    "SUPER_STOCKIST",
  );
  if (!input.lines.length || input.lines.some((line)=>line.quantity<=0)) throw new FoundationError("INVALID_ORDER_LINES","At least one positive order line is required",400);
  const now=new Date(), snapshots=await Promise.all(input.lines.map(async(line)=>{const sku=await prisma.seeraSku.findFirst({where:{id:line.skuId,status:"ACTIVE"}});if(!sku)throw new FoundationError("SKU_UNAVAILABLE","An ordered SKU is unavailable",409);const price=await prisma.seeraPriceVersion.findFirst({where:{skuId:sku.id,tier:"COMPANY_TO_SS",status:"ACTIVE",effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]},orderBy:{effectiveFrom:"desc"}});if(!price)throw new FoundationError("PRICE_UNAVAILABLE",`No active Super Stockist price for ${sku.code}`,409);return{sku,price,quantity:line.quantity,total:Number(price.amount)*line.quantity};}));
  const subtotal=snapshots.reduce((sum,line)=>sum+line.total,0);
  // RUN 2B resume Section 12: currently always 0 in practice (no real Seera/MUV SKU has a governed
  // taxRate yet — see RUN 2B report), but derives real embedded tax the moment one is configured,
  // matching placeRetailerOrder/createDistributorReplenishment instead of a permanently-hardcoded 0.
  const taxTotal=snapshots.reduce((sum,line)=>sum+(line.sku.taxRate==null?0:deriveInclusiveTax(line.total,Number(line.sku.taxRate)).taxAmount),0);
  return prisma.seeraSalesOrder.create({
    data: {
      orderNumber: numberFor("CO", input.idempotencyKey),
      type: "COMPANY_REPLENISHMENT",
      status: "SUBMITTED",
      buyerPartnerId: superStockistId,
      actorId,
      commercialPartyType: "SUPER_STOCKIST",
      commercialPartyId: superStockistId,
      sourcePortal: "super-stockist",
      financialAcceptance: false,
      subtotal,
      discountTotal: 0,
      taxTotal,
      total: subtotal,
      contractualCreditDays: 0,
      idempotencyKey: input.idempotencyKey,
      submittedAt: new Date(),
      lines:{create:snapshots.map(({sku,price,quantity,total})=>{
        // RUN 2B resume Section C: a canonical order-unit/conversion snapshot, captured at order
        // time so later changes to COMPANY_ORDER_UNIT_OVERRIDES never retroactively alter what this
        // historical line meant. Reuses the existing nullable schemeSnapshot JSON column — no schema
        // change — since nothing else reads this column for COMPANY_REPLENISHMENT orders (only
        // quotation-service.ts uses the same field name on a different model, for an unrelated
        // discount-pct shape).
        const override = COMPANY_ORDER_UNIT_OVERRIDES[sku.code];
        const orderUnitSnapshot = {
          orderUnit: override?.orderUnit ?? "PCS",
          unitsPerOrderUnit: override?.unitsPerOrderUnit ?? 1,
          rateBasis: override?.rateBasis ?? "Rate per piece",
        };
        return {skuId:sku.id,skuCodeSnapshot:sku.code,productNameSnapshot:sku.productName,packSnapshot:`${sku.packSize} ${sku.unitType}`,priceSnapshot:price.amount,mrpSnapshot:sku.mrp,schemeSnapshot:orderUnitSnapshot,taxSnapshot:sku.taxRate?{rate:sku.taxRate}:undefined,orderedQuantity:quantity,lineTotal:total};
      })},
    },
    include:{lines:true},
  });
}

// Company never holds governed inventory in this system (InventoryPartyType only has DISTRIBUTOR
// and SUPER_STOCKIST — Company is the ultimate, effectively-unlimited source), so a Company order
// has no seller-side reservation to release/OUT the way dispatchAllocatedOrder does for a
// Distributor/S.S. order. This is the previously-missing step that let a CONFIRMED (payment
// verified) COMPANY_REPLENISHMENT order dispatch to the ordering Super Stockist, unblocking the
// receiveIncomingOrder step it already requires (status DISPATCHED/PARTIAL_DELIVERED/DELIVERED).
export async function dispatchCompanyOrder(
  prisma: PrismaClient,
  actorId: string,
  input: {
    orderId: string;
    idempotencyKey: string;
    vehicleNumber?: string;
    driverName?: string;
    driverMobile?: string;
    transporterName?: string;
    lrNumber?: string;
    challanNumber?: string;
    invoiceDocumentId?: string;
    eta?: Date;
  },
) {
  await authorize(prisma, { actorId, permission: "company_replenishment:dispatch" });
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.seeraDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
      const order = await tx.seeraSalesOrder.findFirst({
        where: { id: input.orderId, type: "COMPANY_REPLENISHMENT", status: "CONFIRMED" },
        include: { lines: true },
      });
      if (!order || !order.buyerPartnerId)
        throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED", "Order is not ready for dispatch", 403);
      const dispatchLines = order.lines
        .map((line) => ({ skuId: line.skuId, quantity: Number(line.orderedQuantity) - Number(line.dispatchedQuantity) }))
        .filter((line) => line.quantity > 0);
      // Company Stock Compatibility Mode (spec §10/§11) — governed, Founder/Admin-only,
      // defaults to LEGACY_UNBOUNDED so this check/posting is a total no-op unless a
      // Founder has explicitly enabled Manufacturing-governed Company stock. Checked here,
      // BEFORE any mutation, so an insufficient-stock dispatch fails cleanly with nothing
      // written — never a partial dispatchedQuantity increment followed by a thrown error.
      const companyInventoryMode = await assertCompanyDispatchAvailable(tx, dispatchLines);
      for (const line of order.lines) {
        const quantity = Number(line.orderedQuantity) - Number(line.dispatchedQuantity);
        if (quantity <= 0) continue;
        await tx.seeraOrderLine.update({ where: { id: line.id }, data: { dispatchedQuantity: { increment: quantity } } });
      }
      await tx.seeraStatusHistory.create({
        data: { entityType: "SeeraSalesOrder", entityId: order.id, fromStatus: order.status, toStatus: "DISPATCHED", actorId, reason: "Company order dispatched" },
      });
      await tx.seeraSalesOrder.update({ where: { id: order.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      const delivery = await tx.seeraDelivery.create({
        data: {
          orderId: order.id,
          status: "PENDING",
          quantities: {},
          actorId,
          idempotencyKey: input.idempotencyKey,
          vehicleNumber: input.vehicleNumber,
          driverName: input.driverName,
          driverMobile: input.driverMobile,
          transporterName: input.transporterName,
          lrNumber: input.lrNumber,
          challanNumber: input.challanNumber,
          invoiceDocumentId: input.invoiceDocumentId,
          eta: input.eta,
        },
      });
      await recordAudit(tx, { actorId, action: "company_order.dispatched", entityType: "SeeraSalesOrder", entityId: order.id, afterState: { deliveryId: delivery.id } });
      if (companyInventoryMode === "MANUFACTURING_GOVERNED") {
        await postCompanyDispatchStockAndCogs(tx, actorId, { orderId: order.id, deliveryId: delivery.id, idempotencyKey: input.idempotencyKey, lines: dispatchLines });
      }
      return delivery;
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}

export async function assistedDistributorOperation(
  prisma: PrismaClient,
  actorId: string,
  input: {
    distributorId: string;
    reason: string;
    idempotencyKey: string;
    subtotal: number;
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "assisted_distributor:operate",
  });
  const context = {
    actorId,
    commercialPartyId: input.distributorId,
    sourcePortal: "sales-manager",
    onBehalfOfPartyId: input.distributorId,
    reason: input.reason,
    financialAcceptance: false,
  };
  assertAssistedAction(context);
  return prisma.seeraSalesOrder.create({
    data: {
      orderNumber: numberFor("AR", input.idempotencyKey),
      type: "DISTRIBUTOR_REPLENISHMENT",
      status: "DRAFT",
      buyerPartnerId: input.distributorId,
      actorId,
      commercialPartyType: "DISTRIBUTOR",
      commercialPartyId: input.distributorId,
      sourcePortal: context.sourcePortal,
      onBehalfOfPartyId: input.distributorId,
      financialAcceptance: false,
      subtotal: input.subtotal,
      discountTotal: 0,
      taxTotal: 0,
      total: input.subtotal,
      notes: input.reason,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function evaluateOrderCredit(
  prisma: PrismaClient,
  distributorId: string,
  orderValue: number,
  now = new Date(),
) {
  const terms = await prisma.seeraCreditTerm.findFirstOrThrow({
    where: {
      distributorId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const { exposure: outstanding } = await canonicalDistributorExposure(
    prisma,
    distributorId,
    now,
  );
  return evaluateDistributorCredit({
    creditEnabled: terms.creditEnabled,
    creditLimit: Number(terms.creditLimit),
    outstanding,
    orderValue,
    warningThreshold:
      terms.warningThreshold == null ? null : Number(terms.warningThreshold),
    blockThreshold:
      terms.blockThreshold == null ? null : Number(terms.blockThreshold),
    now,
  });
}

export function numberFor(prefix: string, key: string) {
  return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;
}
