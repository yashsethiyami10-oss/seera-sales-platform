import { createHash } from "node:crypto";
import { after } from "next/server";
import type { Prisma, PrismaClient, VisitOutcome } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { operationalLog, timeOperation } from "@/lib/foundation/logger";
import { eligibleDelivered } from "./business-rules";
import { canonicalDistributorExposure } from "./credit-service";
import { recordGpsSample } from "./field-travel-service";
import { queueRetailerCommunicationSafe, type RetailerCommEventType } from "./retailer-communication-service";
import { companyDirectPartnerId, isCompanyDirectEligible } from "./scope";

const numberFor = (prefix: string, key: string) =>
  `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;

export async function executiveCheckIn(
  db: PrismaClient,
  actorId: string,
  input: {
    workSessionId: string;
    retailerId: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsExceptionReason?: string;
    idempotencyKey: string;
  },
) {
  const timing = timeOperation("field_portal.executiveCheckIn");
  await authorize(db, { actorId, permission: "retailer:visit" });
  timing.stage("authorize");
  // These three reads are independent of each other (none consumes another's result, only the
  // validation logic below combines them) — one round trip instead of three.
  const [session, retailer, open] = await Promise.all([
    db.seeraWorkSession.findFirst({
      where: {
        id: input.workSessionId,
        employeeId: actorId,
        employeeRole: "SALES_EXECUTIVE",
        status: "ACTIVE",
      },
    }),
    db.seeraRetailer.findFirst({
      where: {
        id: input.retailerId,
        salespersonId: actorId,
        lifecycle: "ACTIVE",
      },
    }),
    db.seeraVisit.findFirst({
      where: { workSession: { employeeId: actorId }, checkedOutAt: null },
    }),
  ]);
  if (!session)
    throw new FoundationError(
      "ACTIVE_WORKDAY_REQUIRED",
      "Start Day before checking in",
      409,
    );
  if (!retailer)
    throw new FoundationError(
      "RETAILER_SCOPE_DENIED",
      "Retailer is not assigned or active",
      403,
    );
  if (open && open.retailerId !== retailer.id)
    throw new FoundationError(
      "OPEN_VISIT_EXISTS",
      "Checkout the current retailer first",
      409,
    );
  timing.stage("scope_checks");
  const visit = await db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      retailerId: retailer.id,
      checkedInAt: new Date(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      gpsExceptionReason: input.gpsExceptionReason,
      idempotencyKey: input.idempotencyKey,
    },
  });
  timing.stage("visit_upsert");
  // PERFORMANCE PHASE 2 (P1 check-in SLO): the visit is already durably created above — the GPS
  // sample is a secondary tracking record the client never waits on for correctness, so it's
  // deferred via after() rather than merely parallelized. Same guarded pattern as
  // placeRetailerOrder/executiveCheckOut/endFieldDay.
  const gpsSample = () =>
    recordGpsSample(db, {
      employeeId: actorId,
      workSessionId: session.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "CHECK_IN",
      trackingStatus: input.gpsExceptionReason ? "EXCEPTION" : input.latitude != null ? "OK" : "UNAVAILABLE",
    }).catch((error) => console.error("record_gps_sample.failed", error));
  try {
    after(gpsSample);
  } catch {
    await gpsSample();
  }
  timing.finish({ actorId, retailerId: input.retailerId });
  return visit;
}

export async function executiveCheckOut(
  db: PrismaClient,
  actorId: string,
  visitId: string,
  input: {
    outcome:
      | "ORDER_BOOKED"
      | "NO_ORDER"
      | "FOLLOW_UP"
      | "COLLECTION"
      | "MARKET_INTELLIGENCE";
    noOrderReason?: string;
    followUpAt?: Date;
    notes?: string;
    photoExceptionReason?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    idempotencyKey: string;
  },
) {
  const timing = timeOperation("field_portal.executiveCheckOut");
  await authorize(db, { actorId, permission: "retailer:visit" });
  timing.stage("authorize");
  // Fail loud, not silently no-op: Prisma's `where: { checkoutIdempotencyKey: undefined }` means
  // "no filter on this field" (not "match null"), so a caller that skips the API route's Zod
  // validation and passes idempotencyKey as undefined/empty would make the priorByKey lookup below
  // match ANY visit by id regardless of its actual checkoutIdempotencyKey — silently short-
  // circuiting a real checkout with no error and no durable write. Caught live by this fix's own
  // test suite (an older test calling this function without an idempotencyKey left checkedOutAt
  // null). The API route already requires this via Zod; this is defense-in-depth for any other
  // caller (scripts, future service code) that isn't Zod-validated.
  if (!input.idempotencyKey) throw new FoundationError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required", 400);
  // P0 21-Aug idempotency fix (real production incident: Mishra kirana visit
  // cmt2tqcw9001zwhr9or51qm1j — a checkout retry against an already-closed visit returned "Active
  // visit unavailable" even though the FIRST checkout had already durably succeeded). A retry
  // carrying the SAME key as an already-completed checkout for THIS visit is a confirmed replay of
  // the same intent — return that already-completed result instead of failing. Mirrors the
  // idempotencyKey pattern executiveCheckIn/placeRetailerOrder/capturePhoto already use.
  const priorByKey = await db.seeraVisit.findFirst({ where: { id: visitId, checkoutIdempotencyKey: input.idempotencyKey } });
  if (priorByKey) {
    timing.finish({ actorId, visitId, idempotentReplay: true });
    await recordAudit(db, {
      actorId,
      action: "field_visit.checkout_idempotent_replay",
      entityType: "SeeraVisit",
      entityId: visitId,
      outcome: "SUCCESS",
    });
    return priorByKey;
  }
  // Photo count folded into the same query as a relation count instead of a second round trip.
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      checkedOutAt: null,
      workSession: { employeeId: actorId, status: "ACTIVE" },
    },
    include: { _count: { select: { photos: { where: { deletedAt: null } } } } },
  });
  timing.stage("visit_lookup");
  if (!visit) {
    // A different intent (no matching idempotency key) hitting an already-closed — or genuinely
    // not-owned — visit. Distinguish for observability: was this actually a close-race duplicate
    // (visit exists, closed, just under a DIFFERENT key — a real double-submit that skipped past
    // the key check above only because the two requests raced) versus a truly invalid visit.
    const closedVisit = await db.seeraVisit.findFirst({ where: { id: visitId, workSession: { employeeId: actorId } }, select: { checkedOutAt: true } });
    await recordAudit(db, {
      actorId,
      action: "field_visit.checkout_failed",
      entityType: "SeeraVisit",
      entityId: visitId,
      outcome: "DENIED",
      reason: closedVisit?.checkedOutAt ? "ALREADY_CLOSED" : "NOT_FOUND_OR_NOT_OWNED",
    });
    throw new FoundationError(
      "VISIT_SCOPE_DENIED",
      "Active visit unavailable",
      403,
    );
  }
  if (input.outcome === "NO_ORDER" && !input.noOrderReason)
    throw new FoundationError(
      "NO_ORDER_REASON_REQUIRED",
      "No-order reason required",
      400,
    );
  if (visit._count.photos === 0 && !input.photoExceptionReason && !visit.photoExceptionReason)
    throw new FoundationError(
      "PHOTO_OR_EXCEPTION_REQUIRED",
      "Add a shop photo or choose a valid no-photo reason.",
      400,
    );
  const outcome: VisitOutcome =
    input.outcome === "NO_ORDER"
      ? "NO_ORDER"
      : input.outcome === "FOLLOW_UP"
        ? "FOLLOW_UP"
        : "PRODUCTIVE";
  // The visit update and the GPS sample write are independent (recordGpsSample only needs
  // visit.workSessionId, already known) — one round trip instead of two, and both are the
  // actual durable-success boundary for this checkout.
  //
  // `updateMany` with `checkedOutAt: null` repeated in the WHERE clause (not a plain `update`) is
  // the actual compare-and-swap here — this is NOT redundant with the SELECT above. Two concurrent
  // requests carrying the SAME idempotencyKey can both pass that SELECT before either commits (a
  // real, reproducible TOCTOU race, caught live by this fix's own concurrent-checkout test): a
  // plain `update()` has no WHERE guard tied to the row's read state, so both would silently
  // succeed, each overwriting the other's checkedOutAt with its own timestamp — no error, no
  // constraint violation (the unique index on checkoutIdempotencyKey only rejects two DIFFERENT
  // rows sharing a key, not the same row being written twice). Postgres serializes two concurrent
  // `UPDATE ... WHERE id = ? AND checkedOutAt IS NULL` statements against the same row via normal
  // row-level locking, so the loser's `count` is reliably 0.
  const [closeResult] = await Promise.all([
    db.seeraVisit.updateMany({
      where: { id: visit.id, checkedOutAt: null },
      data: {
        outcome,
        noOrderReason: input.noOrderReason,
        followUpAt: input.followUpAt,
        notes: input.notes,
        photoExceptionReason: input.photoExceptionReason ?? visit.photoExceptionReason,
        checkedOutAt: new Date(),
        checkoutIdempotencyKey: input.idempotencyKey,
      },
    }),
    recordGpsSample(db, {
      employeeId: actorId,
      workSessionId: visit.workSessionId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "CHECK_OUT",
      trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
    }),
  ]);
  if (closeResult.count === 0) {
    // Lost the race: a concurrent request for THIS visit closed it first. If it closed with the
    // SAME idempotencyKey, this is a safe idempotent replay of the same intent — return that
    // result. A different key means a genuinely conflicting concurrent intent, correctly denied.
    const winner = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
    if (winner.checkoutIdempotencyKey === input.idempotencyKey) {
      timing.finish({ actorId, visitId, idempotentReplay: true, racedReplay: true });
      return winner;
    }
    await recordAudit(db, { actorId, action: "field_visit.checkout_failed", entityType: "SeeraVisit", entityId: visitId, outcome: "DENIED", reason: "RACED_BY_DIFFERENT_INTENT" });
    throw new FoundationError("VISIT_SCOPE_DENIED", "Active visit unavailable", 403);
  }
  const updated = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
  timing.stage("visit_update_and_gps");
  await recordAudit(db, {
    actorId,
    action: "field_visit.checkout_succeeded",
    entityType: "SeeraVisit",
    entityId: visitId,
    outcome: "SUCCESS",
    afterState: { outcome, workSessionId: visit.workSessionId },
  });
  // Retailer WhatsApp notification is queued strictly AFTER the visit is durably checked out
  // (this is a fast local outbox write, not the Meta network call, which only ever happens
  // later from the separate dispatch worker) — never before/concurrent with the commit above,
  // so a checkout that ultimately fails can never have already queued a message for it, and a
  // queuing hiccup (queueRetailerCommunicationSafe never throws) can never turn an already-
  // successful checkout into a user-visible failure.
  // NOTE: ORDER_RECORDED is deliberately NOT triggered here anymore (Part A5) — it now fires
  // from placeRetailerOrder itself, once per order, referencing that order's own id, instead of
  // this checkout-outcome-driven trigger with a "most recent order" guess that breaks once
  // multiple orders/day are normal. Only the genuinely checkout-outcome-driven events remain.
  const commEventType: RetailerCommEventType | null =
    input.outcome === "NO_ORDER" ? "REFUSED_OR_UNABLE" : input.outcome === "FOLLOW_UP" ? "FOLLOW_UP" : null;
  // PERFORMANCE PHASE 2 (P1 checkout SLO): deferred via after() — the visit is already durably
  // checked out above, so the client doesn't need to wait for this best-effort queue write. Same
  // guarded pattern as placeRetailerOrder/endFieldDay (throws synchronously outside a request
  // scope; falls back to running inline for non-request callers).
  if (commEventType && visit.retailerId) {
    const queueComm = async () => {
      try {
        await queueRetailerCommunicationSafe(db, { eventType: commEventType, retailerId: visit.retailerId!, visitId: visit.id, actorId });
      } catch (error) {
        console.error("retailer_communication.queue_failed", error);
      }
    };
    try {
      after(queueComm);
    } catch {
      await queueComm();
    }
  }
  timing.finish({ actorId, visitId });
  return updated;
}

// A planned stop that is skipped never gets an actual check-in — recorded as a same-instant,
// zero-duration visit with VisitOutcome.SKIPPED so it still shows up in the day's history/DSR and
// counts toward "planned vs visited" without inventing a parallel "planned retailer" record type.
export async function skipRetailer(
  db: PrismaClient,
  actorId: string,
  input: {
    workSessionId: string;
    retailerId: string;
    reason: string;
    remarks?: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const session = await db.seeraWorkSession.findFirst({
    where: { id: input.workSessionId, employeeId: actorId, status: "ACTIVE" },
  });
  if (!session)
    throw new FoundationError(
      "ACTIVE_WORKDAY_REQUIRED",
      "Start Day before recording a skip",
      409,
    );
  const retailer = await db.seeraRetailer.findFirst({
    where: { id: input.retailerId, salespersonId: actorId, lifecycle: "ACTIVE" },
  });
  if (!retailer)
    throw new FoundationError(
      "RETAILER_SCOPE_DENIED",
      "Retailer is not assigned or active",
      403,
    );
  if (!input.reason.trim())
    throw new FoundationError("SKIP_REASON_REQUIRED", "A skip reason is required", 400);
  const now = new Date();
  return db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      retailerId: retailer.id,
      checkedInAt: now,
      checkedOutAt: now,
      outcome: "SKIPPED",
      skipReason: input.reason,
      notes: input.remarks,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

// Executives cannot silently rewrite a Manager-published beat; a deviation from the planned route
// is still allowed operationally but is always attached to the visit and audited.
export async function recordRouteDeviation(
  db: PrismaClient,
  actorId: string,
  input: { visitId: string; reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  // Full-system audit fix: closed history is immutable (matches deleteVisitPhoto's own stated
  // convention below) — a route deviation is reported DURING travel/the visit itself, never
  // added retroactively to an already-checked-out visit.
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, checkedOutAt: null, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  const updated = await db.seeraVisit.update({
    where: { id: visit.id },
    data: { routeDeviationReason: input.reason },
  });
  await recordAudit(db, {
    actorId,
    action: "visit.route_deviation",
    entityType: "SeeraVisit",
    entityId: visit.id,
    afterState: { reason: input.reason },
  });
  return updated;
}

const SHOP_TYPES = [
  "KIRANA",
  "GENERAL_STORE",
  "SUPERMARKET",
  "MINI_MART",
  "DEPARTMENTAL_STORE",
  "WHOLESALE_RETAILER",
  "CHEMIST_PHARMACY",
  "INSTITUTIONAL_COUNTER",
  "OTHER",
] as const;

export async function findSimilarRetailers(
  db: PrismaClient,
  input: { businessName: string; mobile?: string },
) {
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  return db.seeraRetailer.findMany({
    where: {
      OR: [
        ...(normalizedMobile ? [{ normalizedMobile, NOT: { normalizedMobile: "" } }] : []),
        { businessName: { equals: input.businessName, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, businessName: true, mobile: true, address: true, lifecycle: true },
    take: 5,
  });
}

// Typeahead for placing a non-visit (phone/WhatsApp) order against an existing retailer without
// forcing "+ Add customer" — scoped to the Executive's own retailer book only.
export async function executiveRetailerSearch(
  db: PrismaClient,
  actorId: string,
  q: string,
  limit = 10,
) {
  await authorize(db, { actorId, permission: "retailer:order" });
  if (q.trim().length < 2) return [];
  return db.seeraRetailer.findMany({
    where: {
      salespersonId: actorId,
      lifecycle: "ACTIVE",
      OR: [
        { businessName: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
        { mobile: { contains: q } },
      ],
    },
    select: { id: true, businessName: true, mobile: true, code: true },
    take: limit,
  });
}

// Only Shop/Firm Name and Area/Address are mandatory — every other field is optional, and a new
// retailer must be usable in the current visit/order immediately (lifecycle ACTIVE right away);
// Manager review happens after the fact via the audit trail, it never blocks first use.
const CUSTOMER_TYPES = [
  "RETAILER",
  "WHOLESALER",
  "DISTRIBUTOR_PROSPECT",
  "INSTITUTIONAL_OTHER",
] as const;

export async function createRetailer(
  db: PrismaClient,
  actorId: string,
  input: {
    businessName: string;
    address: Record<string, unknown>;
    ownerName?: string;
    mobile?: string;
    alternateMobile?: string;
    pincode?: string;
    shopType?: (typeof SHOP_TYPES)[number];
    customerType?: (typeof CUSTOMER_TYPES)[number];
    gstin?: string;
    distributorId?: string;
    beatId?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
    confirmDuplicate?: boolean;
    idempotencyKey: string;
  },
) {
  const timing = timeOperation("field_portal.createRetailer");
  await authorize(db, { actorId, permission: "retailer:visit" });
  timing.stage("authorize");
  if (!input.businessName.trim())
    throw new FoundationError("SHOP_NAME_REQUIRED", "Shop/Firm name is required", 400);
  if (!input.address || Object.keys(input.address).length === 0)
    throw new FoundationError("AREA_ADDRESS_REQUIRED", "Area/Address is required", 400);
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  // The duplicate check, the distributor-fallback lookup, and (only when a distributorId is
  // explicitly supplied by the caller) the Company Direct governance check are independent reads —
  // one round trip instead of up to three. Company Direct eligibility is only ever checked here for
  // an EXPLICIT input.distributorId — the fallback (anyOwn) path can never newly point at Company
  // Direct unless it already did, and setCompanyDirectEligibility() blocks disabling eligibility
  // while any such retailer still exists, so the fallback can't smuggle in a stale grant.
  const [similar, anyOwn, cdPartnerId] = await Promise.all([
    input.confirmDuplicate
      ? Promise.resolve([])
      : findSimilarRetailers(db, { businessName: input.businessName, mobile: input.mobile }),
    input.distributorId
      ? Promise.resolve(null)
      : db.seeraRetailer.findFirst({
          where: { salespersonId: actorId, distributorId: { not: null } },
          select: { distributorId: true },
          orderBy: { createdAt: "desc" },
        }),
    input.distributorId ? companyDirectPartnerId(db) : Promise.resolve(null),
  ]);
  timing.stage("duplicate_and_distributor_lookup");
  if (similar.length)
    throw new FoundationError(
      "SIMILAR_RETAILER_EXISTS",
      "A similar retailer already exists — confirm to save anyway",
      409,
      { similar },
    );
  if (input.distributorId && cdPartnerId && input.distributorId === cdPartnerId && !(await isCompanyDirectEligible(db, actorId)))
    throw new FoundationError("COMPANY_DIRECT_NOT_ELIGIBLE", "You are not authorized to assign retailers to Company Direct", 403);
  const distributorId = input.distributorId ?? anyOwn?.distributorId ?? undefined;
  const retailer = await db.$transaction(async (tx) => {
    // Real unique-indexed lookup (SeeraRetailer.idempotencyKey), not the previous unindexed
    // notes:{contains} LIKE scan — matches the SeeraVisit/SeeraFollowUp idempotency precedent.
    const existing = await tx.seeraRetailer.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const created = await tx.seeraRetailer.create({
      data: {
        code: numberFor("RT", input.idempotencyKey),
        businessName: input.businessName.trim(),
        ownerName: input.ownerName,
        mobile: input.mobile,
        alternateMobile: input.alternateMobile,
        pincode: input.pincode,
        normalizedMobile,
        address: input.address as Prisma.InputJsonValue,
        latitude: input.latitude,
        longitude: input.longitude,
        gstin: input.gstin,
        shopType: input.shopType,
        customerType: input.customerType,
        distributorId,
        beatId: input.beatId,
        salespersonId: actorId,
        lifecycle: "ACTIVE",
        source: "UNPLANNED_FIELD_ADDED",
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "retailer.created_by_executive",
      entityType: "SeeraRetailer",
      entityId: created.id,
      afterState: { businessName: created.businessName, distributorId, source: "UNPLANNED_FIELD_ADDED" },
    });
    return created;
  });
  timing.stage("transaction");
  timing.finish({ actorId });
  return retailer;
}

// PERFORMANCE PHASE 3 (P0 Add Customer latency): "Add Customer" was 2 sequential client round
// trips (create-retailer, then check-in) plus GPS acquisition. Composes createRetailer's and
// executiveCheckIn's own validation/write logic into ONE transaction so the client only pays for
// one round trip — createRetailer/executiveCheckIn themselves are left exported and unchanged for
// every other existing caller.
export async function createRetailerAndCheckIn(
  db: PrismaClient,
  actorId: string,
  input: {
    businessName: string;
    address: Record<string, unknown>;
    ownerName?: string;
    mobile?: string;
    alternateMobile?: string;
    pincode?: string;
    shopType?: (typeof SHOP_TYPES)[number];
    customerType?: (typeof CUSTOMER_TYPES)[number];
    gstin?: string;
    distributorId?: string;
    beatId?: string;
    notes?: string;
    confirmDuplicate?: boolean;
    idempotencyKey: string;
    workSessionId: string;
    checkInIdempotencyKey: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsExceptionReason?: string;
  },
) {
  const timing = timeOperation("field_portal.createRetailerAndCheckIn");
  await authorize(db, { actorId, permission: "retailer:visit" });
  timing.stage("authorize");
  if (!input.businessName.trim())
    throw new FoundationError("SHOP_NAME_REQUIRED", "Shop/Firm name is required", 400);
  if (!input.address || Object.keys(input.address).length === 0)
    throw new FoundationError("AREA_ADDRESS_REQUIRED", "Area/Address is required", 400);
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  // All five reads are independent of each other — one round trip instead of five.
  // existingByKey (idempotencyKey lookup) is fetched here too, not only inside the transaction:
  // a genuine RETRY of this same call (same idempotencyKey) already has an open visit from its
  // first, successful attempt — the OPEN_VISIT_EXISTS check below needs to know that visit
  // belongs to the SAME retailer this retry resolves to, or every retry would wrongly self-block.
  const [similar, anyOwn, session, open, existingByKey, cdPartnerId] = await Promise.all([
    input.confirmDuplicate
      ? Promise.resolve([])
      : findSimilarRetailers(db, { businessName: input.businessName, mobile: input.mobile }),
    input.distributorId
      ? Promise.resolve(null)
      : db.seeraRetailer.findFirst({
          where: { salespersonId: actorId, distributorId: { not: null } },
          select: { distributorId: true },
          orderBy: { createdAt: "desc" },
        }),
    db.seeraWorkSession.findFirst({
      where: { id: input.workSessionId, employeeId: actorId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
    }),
    db.seeraVisit.findFirst({
      where: { workSession: { employeeId: actorId }, checkedOutAt: null },
    }),
    db.seeraRetailer.findUnique({ where: { idempotencyKey: input.idempotencyKey } }),
    // Company Direct governance (GAP-004 addendum) — same explicit-input-only scoping as
    // createRetailer, so the busy default path (no distributorId passed) never pays this cost.
    input.distributorId ? companyDirectPartnerId(db) : Promise.resolve(null),
  ]);
  timing.stage("duplicate_distributor_session_openvisit_lookup");
  if (!existingByKey && similar.length)
    throw new FoundationError(
      "SIMILAR_RETAILER_EXISTS",
      "A similar retailer already exists — confirm to save anyway",
      409,
      { similar },
    );
  if (!session)
    throw new FoundationError("ACTIVE_WORKDAY_REQUIRED", "Start Day before checking in", 409);
  if (input.distributorId && cdPartnerId && input.distributorId === cdPartnerId && !existingByKey && !(await isCompanyDirectEligible(db, actorId)))
    throw new FoundationError("COMPANY_DIRECT_NOT_ELIGIBLE", "You are not authorized to assign retailers to Company Direct", 403);
  // Same OPEN_VISIT_EXISTS governance as the standalone executiveCheckIn: only blocks when the
  // open visit belongs to a DIFFERENT retailer. For a brand-new retailer (existingByKey is null)
  // that's any open visit at all; for a retry of this same call, it's correctly a no-op once the
  // open visit is this retry's own prior visit.
  if (open && open.retailerId !== existingByKey?.id)
    throw new FoundationError("OPEN_VISIT_EXISTS", "Checkout the current retailer first", 409);
  const distributorId = input.distributorId ?? anyOwn?.distributorId ?? undefined;
  timing.stage("pre_transaction_validation");
  // PERFORMANCE PHASE 2 (P0 Add Customer SLO): existingByKey was ALREADY fetched above (as part
  // of the same batched Promise.all) — re-querying it again inside the transaction was a genuinely
  // redundant round trip on the same pinned connection. Reused directly instead.
  const { retailer, visit } = await db.$transaction(async (tx) => {
    const existingRetailer = existingByKey;
    const retailer =
      existingRetailer ??
      (await tx.seeraRetailer.create({
        data: {
          code: numberFor("RT", input.idempotencyKey),
          businessName: input.businessName.trim(),
          ownerName: input.ownerName,
          mobile: input.mobile,
          alternateMobile: input.alternateMobile,
          pincode: input.pincode,
          normalizedMobile,
          address: input.address as Prisma.InputJsonValue,
          latitude: input.latitude,
          longitude: input.longitude,
          gstin: input.gstin,
          shopType: input.shopType,
          customerType: input.customerType,
          distributorId,
          beatId: input.beatId,
          salespersonId: actorId,
          lifecycle: "ACTIVE",
          source: "UNPLANNED_FIELD_ADDED",
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          createdById: actorId,
        },
      }));
    if (!existingRetailer) {
      await recordAudit(tx, {
        actorId,
        action: "retailer.created_by_executive",
        entityType: "SeeraRetailer",
        entityId: retailer.id,
        afterState: { businessName: retailer.businessName, distributorId, source: "UNPLANNED_FIELD_ADDED" },
      });
    }
    timing.stage("tx_retailer_create_and_audit");
    const visit = await tx.seeraVisit.upsert({
      where: { idempotencyKey: input.checkInIdempotencyKey },
      update: {},
      create: {
        workSessionId: session.id,
        retailerId: retailer.id,
        checkedInAt: new Date(),
        checkInLatitude: input.latitude,
        checkInLongitude: input.longitude,
        gpsExceptionReason: input.gpsExceptionReason,
        idempotencyKey: input.checkInIdempotencyKey,
      },
    });
    timing.stage("tx_visit_upsert");
    return { retailer, visit };
  });
  timing.stage("transaction");
  // PERFORMANCE PHASE 2 (P0 Add Customer SLO): the GPS sample is a secondary tracking record —
  // the retailer+visit are already durably created above, so the client doesn't need to wait for
  // this write. Deferred via after() (same mechanism as placeRetailerOrder's post-commit
  // notifications); a no-op fallback outside request scope (bare scripts/tests) still runs it
  // inline so those callers see the same end state.
  const gpsSample = () =>
    recordGpsSample(db, {
      employeeId: actorId,
      workSessionId: session.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "CHECK_IN",
      trackingStatus: input.gpsExceptionReason ? "EXCEPTION" : input.latitude != null ? "OK" : "UNAVAILABLE",
    }).catch((error) => console.error("record_gps_sample.failed", error));
  try {
    after(gpsSample);
  } catch {
    await gpsSample();
  }
  timing.finish({ actorId });
  return { retailer, visit };
}

export async function retailer360(db: PrismaClient, actorId: string, retailerId: string) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const retailer = await db.seeraRetailer.findFirst({
    where: { id: retailerId, salespersonId: actorId },
  });
  if (!retailer)
    throw new FoundationError("RETAILER_SCOPE_DENIED", "Retailer scope denied", 403);
  const [lastVisit, recentOrders, followUps, photos] = await Promise.all([
    db.seeraVisit.findFirst({
      where: { retailerId },
      orderBy: { checkedInAt: "desc" },
    }),
    db.seeraSalesOrder.findMany({
      where: { retailerId, salespersonId: actorId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { lines: true },
    }),
    db.seeraFollowUp.findMany({
      where: { retailerId, ownerId: actorId, status: "OPEN" },
      orderBy: { dueDate: "asc" },
    }),
    db.seeraVisitPhoto.findMany({
      where: { retailerId, deletedAt: null },
      orderBy: { capturedAt: "desc" },
      take: 12,
    }),
  ]);
  return { retailer, lastVisit, recentOrders, followUps, photos };
}

const PHOTO_TYPES = [
  "SHOPFRONT",
  "COUNTER",
  "PRODUCT_DISPLAY",
  "BANNER_BRANDING",
  "MERCHANDISING",
  "OTHER",
] as const;

export async function capturePhoto(
  db: PrismaClient,
  actorId: string,
  input: {
    visitId: string;
    photoType: (typeof PHOTO_TYPES)[number];
    fileBase64: string;
    mimeType: string;
    originalName: string;
    latitude?: number;
    longitude?: number;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  // P0 21-Aug closed-visit immutability fix: this legacy DB-blob capture path (still live via the
  // Manager portal's capture-photo-manager action) was missing the checkedOutAt:null guard every
  // other visit-scoped write in this file already has (recordPhotoException, executiveCheckOut) —
  // a checked-out visit could silently accept a new photo forever after.
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, checkedOutAt: null, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  // Accepts whatever format a phone's native camera actually produces (iPhones default to
  // HEIC/HEIF; some Android camera apps also do) — the client now uses accept="image/*" for the
  // same reason (matches the original phone-camera-first spec). Rejecting real camera output here
  // was a genuine, reproducible cause of "photo added but checkout still says missing": the upload
  // failed server-side while the client-side preview stayed visible, looking like success.
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(input.mimeType))
    throw new FoundationError("UNSUPPORTED_PHOTO_TYPE", "Only JPEG, PNG, WEBP or HEIC photos are accepted", 400);
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > 8_000_000)
    throw new FoundationError("PHOTO_TOO_LARGE", "Photo must be under 8 MB", 400);
  return db.$transaction(async (tx) => {
    const file = await tx.storedFile.create({
      data: {
        provider: "DATABASE",
        storageKey: `visit-photos/${input.idempotencyKey}`,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(bytes.length),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        classification: "FIELD_EVIDENCE",
        entityType: "SeeraVisit",
        entityId: visit.id,
        uploadedById: actorId,
        contentBytes: bytes,
      },
    });
    const photo = await tx.seeraVisitPhoto.create({
      data: {
        visitId: visit.id,
        retailerId: visit.retailerId,
        actorId,
        photoType: input.photoType,
        fileId: file.id,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
    return photo;
  });
}

const PHOTO_TELEMETRY_EVENTS = [
  "IMAGE_PREP_START", "IMAGE_PREP_SUCCESS", "IMAGE_PREP_FAILED",
  "UPLOAD_START", "UPLOAD_SUCCESS", "UPLOAD_FAILED",
  "FINALIZE_START", "FINALIZE_SUCCESS", "FINALIZE_FAILED",
  "RENDERER_RELOAD_RESUME",
] as const;
export type PhotoTelemetryEvent = (typeof PHOTO_TELEMETRY_EVENTS)[number];

// P0 21-Aug telemetry gap fix: the camera pipeline previously had exactly one console.error call
// and nothing else — every device-only failure (the "attempt 1/2 fail, attempt 3 succeeds"
// low-memory pattern) was undiagnosable without another live Founder UAT session. Deliberately
// log-only (no DB write, no schema needed) — forwards into the SAME operationalLog() mechanism
// this codebase already uses for api.internal_error, so it shows up in existing log tooling
// without new infrastructure. Never accepts photo binary/base64/secrets — only small numeric/enum
// fields, enforced by this function's own type signature, not by trusting the caller.
export async function recordPhotoTelemetry(
  db: PrismaClient,
  actorId: string,
  input: {
    event: PhotoTelemetryEvent;
    visitId?: string;
    elapsedMs?: number;
    errorCode?: string;
    sourceMime?: string;
    sourceBytes?: number;
    sourceWidth?: number;
    sourceHeight?: number;
    outputBytes?: number;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  if (!PHOTO_TELEMETRY_EVENTS.includes(input.event)) throw new FoundationError("INVALID_TELEMETRY_EVENT", "Unknown telemetry event", 400);
  operationalLog("info", "field_photo.telemetry", {
    actorId,
    event: input.event,
    visitId: input.visitId,
    elapsedMs: input.elapsedMs,
    errorCode: input.errorCode,
    sourceMime: input.sourceMime,
    sourceBytes: input.sourceBytes,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    outputBytes: input.outputBytes,
  });
  return { ok: true as const };
}

export async function recordPhotoException(
  db: PrismaClient,
  actorId: string,
  input: { visitId: string; reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  // Full-system audit fix: same closed-history immutability as recordRouteDeviation above, and
  // this write previously had no audit trail at all despite mutating governed checkout-gate data.
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, checkedOutAt: null, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  const updated = await db.seeraVisit.update({
    where: { id: visit.id },
    data: { photoExceptionReason: input.reason },
  });
  await recordAudit(db, {
    actorId,
    action: "visit.photo_exception",
    entityType: "SeeraVisit",
    entityId: visit.id,
    afterState: { reason: input.reason },
  });
  return updated;
}

// Deletion is only ever allowed on your own photo, before you've checked out — after that the
// visit's evidence trail is treated as closed history, matching how notes/checkout are immutable.
export async function deleteVisitPhoto(
  db: PrismaClient,
  actorId: string,
  photoId: string,
  input: { reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const photo = await db.seeraVisitPhoto.findFirst({
    where: { id: photoId, actorId, deletedAt: null },
    include: { visit: true },
  });
  if (!photo)
    throw new FoundationError("PHOTO_SCOPE_DENIED", "Photo unavailable", 403);
  if (photo.visit.checkedOutAt)
    throw new FoundationError(
      "VISIT_ALREADY_CLOSED",
      "Photos cannot be removed after checkout",
      409,
    );
  const updated = await db.seeraVisitPhoto.update({
    where: { id: photoId },
    data: { deletedAt: new Date(), deletedById: actorId, deleteReason: input.reason },
  });
  await recordAudit(db, {
    actorId,
    action: "visit_photo.deleted",
    entityType: "SeeraVisitPhoto",
    entityId: photoId,
    reason: input.reason,
  });
  return updated;
}

export async function createFollowUp(
  db: PrismaClient,
  actorId: string,
  input: {
    type: string;
    retailerId?: string;
    prospectId?: string;
    visitId?: string;
    dueDate: Date;
    priority?: "NORMAL" | "HIGH";
    note: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  if (!input.note.trim())
    throw new FoundationError("FOLLOW_UP_NOTE_REQUIRED", "A note is required", 400);
  return db.seeraFollowUp.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      type: input.type,
      retailerId: input.retailerId,
      prospectId: input.prospectId,
      visitId: input.visitId,
      ownerId: actorId,
      dueDate: input.dueDate,
      priority: input.priority ?? "NORMAL",
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function resolveFollowUp(
  db: PrismaClient,
  actorId: string,
  followUpId: string,
  input: { resolutionNote?: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const followUp = await db.seeraFollowUp.findFirst({
    where: { id: followUpId, ownerId: actorId, status: "OPEN" },
  });
  if (!followUp)
    throw new FoundationError("FOLLOW_UP_SCOPE_DENIED", "Follow-up unavailable", 403);
  return db.seeraFollowUp.update({
    where: { id: followUpId },
    data: {
      status: "DONE",
      resolvedAt: new Date(),
      resolvedById: actorId,
      resolutionNote: input.resolutionNote,
    },
  });
}

// "Today" is the executive's own geography for the current day-of-week, resolved from the
// Manager-published SeeraJourneyPlan and matched against the retailer's own beat/market/territory
// field depending on which geography level the plan targets. Executives never edit this — it's a
// read of what the Manager published, plus their normal retailer book for any un-planned day.
export async function executiveBeat(
  db: PrismaClient,
  actorId: string,
  range: "today" | "tomorrow" | "week",
  now = new Date(),
) {
  const timing = timeOperation("field_portal.executiveBeat");
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  timing.stage("authorize");
  const days =
    range === "today"
      ? [now.getDay()]
      : range === "tomorrow"
        ? [(now.getDay() + 1) % 7]
        : [0, 1, 2, 3, 4, 5, 6];
  // P1 22-Aug cross-portal handoff fix (real Founder UAT: a Manager-published plan starting a few
  // days out was invisible under EVERY Executive tab, including "This week" — which is supposed to
  // preview the week ahead, not just what has already started). The bug was `effectiveFrom: {lte:
  // now}` applied unconditionally regardless of range: a plan can only ever show once the literal
  // calendar date arrives, even though "week" already widens dayOfWeek to 0-6. Scale the cutoff to
  // the requested window instead — "today" still means "has this plan actually started as of right
  // now" (unchanged), "tomorrow"/"week" mean "will this plan have started by the end of that
  // window" (a real week-ahead preview). effectiveTo is untouched — a plan that's already ended
  // must never resurface just because its start date is in the past.
  const windowEnd =
    range === "today" ? now : range === "tomorrow" ? new Date(now.getTime() + 86_400_000) : new Date(now.getTime() + 6 * 86_400_000);
  const plans = await db.seeraJourneyPlan.findMany({
    where: {
      employeeId: actorId,
      // Same pass: a DRAFT plan (createBeatPlan's un-published save) had no status filter here at
      // all, so it was visible to the Executive as if it were active work — never the intent (a
      // Manager's DRAFT is explicitly still-being-built, not yet a real handoff).
      status: "PUBLISHED",
      dayOfWeek: { in: days },
      effectiveFrom: { lte: windowEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  timing.stage("plans");
  // Final Master Revision (Beat/Route add-on, 22-Aug) fix: this used to collect ONLY
  // plan.geographyId (the leaf VILLAGE/TOWN/.../OTHER node createBeatPlan creates under the Beat)
  // and match it against retailer.beatId/marketId/territoryId indiscriminately. But
  // SeeraRetailer.beatId/.territoryId are populated with the actual BEAT-level/TERRITORY-level node
  // ids (see seed-routing-fixtures.ts), a DIFFERENT level of the geography tree than the plan's leaf
  // geographyId — so a real PUBLISHED plan with real retailers mapped to its Beat could never match,
  // regardless of date range. Compare each field at its OWN matching level instead: retailer.beatId
  // against plan.beatId, retailer.territoryId against plan.territoryId, and retailer.marketId
  // against plan.geographyId (kept as a defensive extra match — marketId is otherwise never written
  // anywhere today, so this is inert, not a regression risk).
  const beatIds = [...new Set(plans.map((plan) => plan.beatId).filter((id): id is string => Boolean(id)))];
  const territoryIds = [...new Set(plans.map((plan) => plan.territoryId).filter((id): id is string => Boolean(id)))];
  const geographyIds = [...new Set(plans.map((plan) => plan.geographyId))];
  const hasGeographyMatch = beatIds.length > 0 || territoryIds.length > 0 || geographyIds.length > 0;
  const [visitsToday, retailers] = await Promise.all([
    db.seeraVisit.findMany({
      where: {
        workSession: { employeeId: actorId },
        checkedInAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      select: { retailerId: true, outcome: true },
    }),
    hasGeographyMatch
      ? db.seeraRetailer.findMany({
          where: {
            salespersonId: actorId,
            lifecycle: "ACTIVE",
            OR: [
              { beatId: { in: beatIds } },
              { marketId: { in: geographyIds } },
              { territoryId: { in: territoryIds } },
            ],
          },
          orderBy: { businessName: "asc" },
        })
      : range === "today"
        ? db.seeraRetailer.findMany({
            where: { salespersonId: actorId, lifecycle: "ACTIVE" },
            orderBy: { businessName: "asc" },
          })
        : Promise.resolve([]),
  ]);
  timing.stage("visits_and_retailers");
  const visitStatus = new Map(visitsToday.map((v) => [v.retailerId, v.outcome]));
  const openFollowUps = retailers.length
    ? await db.seeraFollowUp.findMany({
        where: { retailerId: { in: retailers.map((r) => r.id) }, ownerId: actorId, status: "OPEN" },
        orderBy: { dueDate: "asc" },
      })
    : [];
  timing.stage("open_follow_ups");
  const followUpAt = new Map<string, Date>();
  for (const f of openFollowUps)
    if (f.retailerId && !followUpAt.has(f.retailerId)) followUpAt.set(f.retailerId, f.dueDate);
  timing.finish({ actorId, range });
  return {
    plans,
    hasPublishedPlan: plans.length > 0,
    retailers: retailers.map((retailer) => ({
      ...retailer,
      visitStatus: range === "today" ? (visitStatus.get(retailer.id) ?? "PENDING") : null,
      followUpAt: followUpAt.get(retailer.id) ?? null,
    })),
  };
}

export async function executiveDashboard(db: PrismaClient, actorId: string, now = new Date()) {
  const timing = timeOperation("field_portal.executiveDashboard");
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  timing.stage("authorize");
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Every read below is independent of every other read in this same batch (none of them consume
  // another's result) — only `monthDelivered` and `plannedCount` further down genuinely need
  // `target`/`plannedToday` resolved first. Previously this was 4 sequential round-trip stages
  // (this batch, then newRetailersToday alone, then a second batch, then plannedCount alone) purely
  // because of source-order, not real dependencies — each stage costs a full network round trip to
  // Neon regardless of how many queries run within it, so collapsing to 2 stages here materially
  // cuts this function's latency on every call (and this function reruns on every field-portal
  // router.refresh(), i.e. after every field action).
  const [session, employee, retailers, target, todayVisits, todayOrders, followUpsDue, prospects, newRetailersToday, photosToday, plannedToday] =
    await Promise.all([
      db.seeraWorkSession.findFirst({
        where: { employeeId: actorId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
      }),
      db.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
      db.seeraRetailer.count({ where: { salespersonId: actorId, lifecycle: "ACTIVE" } }),
      db.seeraTarget.findFirst({
        where: {
          employeeId: actorId,
          periodStart: { lte: now },
          periodEnd: { gte: now },
          metricType: "DELIVERED_VALUE",
        },
        orderBy: { periodStart: "desc" },
      }),
      db.seeraVisit.findMany({
        where: { workSession: { employeeId: actorId }, checkedInAt: { gte: startOfDay } },
      }),
      db.seeraSalesOrder.findMany({
        where: { salespersonId: actorId, createdAt: { gte: startOfDay } },
        select: { total: true, sellerPartnerId: true },
      }),
      db.seeraFollowUp.count({
        where: { ownerId: actorId, status: "OPEN", dueDate: { lte: new Date(startOfDay.getTime() + 86_400_000) } },
      }),
      db.seeraProspect.count({
        where: { ownerEmployeeId: actorId, prospectType: "DISTRIBUTOR", status: { in: ["PROSPECT", "UNDER_REVIEW"] } },
      }),
      db.seeraRetailer.count({ where: { salespersonId: actorId, createdAt: { gte: startOfDay } } }),
      db.seeraVisitPhoto.count({
        where: { actorId, capturedAt: { gte: startOfDay }, deletedAt: null },
      }),
      db.seeraJourneyPlan.findFirst({
        where: {
          employeeId: actorId,
          status: "PUBLISHED",
          dayOfWeek: now.getDay(),
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);
  timing.stage("batch1_independent_reads");
  // Only these three genuinely depend on the batch above (monthDelivered needs target's period;
  // plannedCount needs plannedToday's geography; the partner-type lookup needs todayOrders'
  // sellerPartnerIds) — none depend on each other, so still one round trip, not three.
  const todaySellerPartnerIds = [...new Set(todayOrders.map((o) => o.sellerPartnerId).filter((id): id is string => Boolean(id)))];
  const [monthDelivered, plannedCount, todaySellerPartners] = await Promise.all([
    deliveredValueForPeriod(
      db,
      actorId,
      target?.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1),
      target?.periodEnd ?? now,
    ),
    plannedToday
      ? db.seeraRetailer.count({
          where: {
            salespersonId: actorId,
            lifecycle: "ACTIVE",
            // Final Master Revision (Beat/Route add-on, 22-Aug) fix: same geography-level mismatch
            // as executiveBeat above — beatId/territoryId must match the plan's OWN beatId/
            // territoryId (Beat/Territory-level), not its leaf geographyId.
            OR: [
              ...(plannedToday.beatId ? [{ beatId: plannedToday.beatId }] : []),
              { marketId: plannedToday.geographyId },
              ...(plannedToday.territoryId ? [{ territoryId: plannedToday.territoryId }] : []),
            ],
          },
        })
      : Promise.resolve(retailers),
    // Part B reporting split (COMPANY_DIRECT vs DISTRIBUTOR) — small lookup, only the distinct
    // seller partner ids already present on today's orders, batched here rather than a per-order
    // query.
    todaySellerPartnerIds.length
      ? db.seeraPartner.findMany({ where: { id: { in: todaySellerPartnerIds } }, select: { id: true, type: true } })
      : Promise.resolve([]),
  ]);
  timing.stage("batch2_dependent_reads");
  const partnerTypeById = new Map(todaySellerPartners.map((p) => [p.id, p.type]));
  const companyDirectValue = todayOrders
    .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "COMPANY_DIRECT")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const distributorValue = todayOrders
    .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "DISTRIBUTOR")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const targetValue = Number(target?.targetValue ?? 0);
  const achieved = monthDelivered;
  const remaining = Math.max(0, targetValue - achieved);
  const periodEnd = target?.periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
  const dashboardResult = {
    employee,
    dayStatus: session ? "ACTIVE" : "NOT_STARTED",
    session,
    target: target
      ? {
          value: targetValue,
          achieved,
          remaining,
          achievementPct: targetValue > 0 ? Math.round((achieved / targetValue) * 1000) / 10 : 0,
          daysRemaining,
          requiredDailyRunRate: daysRemaining > 0 ? Math.round((remaining / daysRemaining) * 100) / 100 : remaining,
        }
      : null,
    today: {
      planned: plannedCount,
      visited: todayVisits.length,
      productive: todayVisits.filter((v) => v.outcome === "PRODUCTIVE").length,
      skipped: todayVisits.filter((v) => v.outcome === "SKIPPED").length,
      orders: todayOrders.length,
      bookedValue: todayOrders.reduce((sum, o) => sum + Number(o.total), 0),
      companyDirectValue,
      distributorValue,
      followUpsDue,
      newRetailers: newRetailersToday,
      distributorProspects: prospects,
      photos: photosToday,
    },
    retailerCount: retailers,
  };
  timing.finish({ actorId });
  return dashboardResult;
}

export async function deliveredValueForPeriod(db: PrismaClient, actorId: string, from: Date, to: Date) {
  const orders = await db.seeraSalesOrder.findMany({
    where: {
      salespersonId: actorId,
      type: "RETAILER_ORDER",
      createdAt: { gte: from, lte: to },
    },
    include: { lines: true },
  });
  return orders.reduce(
    (sum, order) =>
      sum +
      order.lines.reduce(
        (lineSum, line) =>
          lineSum +
          eligibleDelivered({
            ordered: Number(line.orderedQuantity),
            cancelled: Number(line.cancelledQuantity),
            delivered: Number(line.deliveredQuantity),
            refused: Number(line.refusedQuantity),
            approvedReturn: Number(line.returnedQuantity),
            unitValue: Number(line.priceSnapshot),
          }).value,
        0,
      ),
    0,
  );
}

export async function executiveTargetProgress(db: PrismaClient, actorId: string, now = new Date()) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const target = await db.seeraTarget.findFirst({
    where: {
      employeeId: actorId,
      periodStart: { lte: now },
      periodEnd: { gte: now },
      metricType: "DELIVERED_VALUE",
    },
    orderBy: { periodStart: "desc" },
  });
  const periodStart = target?.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = target?.periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const orders = await db.seeraSalesOrder.findMany({
    where: { salespersonId: actorId, type: "RETAILER_ORDER", createdAt: { gte: periodStart, lte: periodEnd } },
    include: { lines: true, retailer: { select: { businessName: true, distributorId: true } } },
  });
  const booked = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const delivered = orders.reduce(
    (sum, order) =>
      sum +
      order.lines.reduce(
        (lineSum, line) =>
          lineSum +
          eligibleDelivered({
            ordered: Number(line.orderedQuantity),
            cancelled: Number(line.cancelledQuantity),
            delivered: Number(line.deliveredQuantity),
            refused: Number(line.refusedQuantity),
            approvedReturn: Number(line.returnedQuantity),
            unitValue: Number(line.priceSnapshot),
          }).value,
        0,
      ),
    0,
  );
  const byDistributor = new Map<string, number>();
  for (const order of orders) {
    const key = order.retailer?.distributorId ?? "unmapped";
    const value = order.lines.reduce(
      (lineSum, line) =>
        lineSum +
        eligibleDelivered({
          ordered: Number(line.orderedQuantity),
          cancelled: Number(line.cancelledQuantity),
          delivered: Number(line.deliveredQuantity),
          refused: Number(line.refusedQuantity),
          approvedReturn: Number(line.returnedQuantity),
          unitValue: Number(line.priceSnapshot),
        }).value,
      0,
    );
    byDistributor.set(key, (byDistributor.get(key) ?? 0) + value);
  }
  const targetValue = Number(target?.targetValue ?? 0);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
  return {
    target: target ? { ...target, targetValue } : null,
    periodStart,
    periodEnd,
    booked,
    delivered,
    remaining: Math.max(0, targetValue - delivered),
    achievementPct: targetValue > 0 ? Math.round((delivered / targetValue) * 1000) / 10 : 0,
    daysRemaining,
    requiredDailyRunRate:
      daysRemaining > 0
        ? Math.round((Math.max(0, targetValue - delivered) / daysRemaining) * 100) / 100
        : Math.max(0, targetValue - delivered),
    distributorContribution: [...byDistributor.entries()].map(([distributorId, value]) => ({ distributorId, value })),
  };
}

export async function executiveDeliveredSales(
  db: PrismaClient,
  actorId: string,
  input: { skip?: number; take?: number } = {},
) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const orders = await db.seeraSalesOrder.findMany({
    where: { salespersonId: actorId, type: "RETAILER_ORDER" },
    include: {
      lines: true,
      retailer: { select: { businessName: true } },
      buyerPartner: { select: { legalName: true, tradeName: true } },
      sellerPartner: { select: { legalName: true, tradeName: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 30,
  });
  return orders.map((order) => {
    const eligible = order.lines.reduce(
      (sum, line) =>
        sum +
        eligibleDelivered({
          ordered: Number(line.orderedQuantity),
          cancelled: Number(line.cancelledQuantity),
          delivered: Number(line.deliveredQuantity),
          refused: Number(line.refusedQuantity),
          approvedReturn: Number(line.returnedQuantity),
          unitValue: Number(line.priceSnapshot),
        }).value,
      0,
    );
    const deliveredQty = order.lines.reduce((sum, l) => sum + Number(l.deliveredQuantity), 0);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      retailer: order.retailer?.businessName ?? "Retailer",
      distributor: order.sellerPartner?.tradeName ?? order.sellerPartner?.legalName ?? order.buyerPartner?.tradeName ?? order.buyerPartner?.legalName ?? "—",
      status: order.status,
      booked: Number(order.total),
      deliveredQuantity: deliveredQty,
      eligibleCreditedAmount: eligible,
    };
  });
}

export async function executiveDsr(db: PrismaClient, actorId: string, workSessionId: string) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const session = await db.seeraWorkSession.findFirst({
    where: { id: workSessionId, employeeId: actorId },
  });
  if (!session)
    throw new FoundationError("SESSION_SCOPE_DENIED", "Work day unavailable", 403);
  const dayEnd = session.endedAt ?? new Date();
  const [visits, followUps, photos, unplannedAdded, distributorProspects, travelEstimate] = await Promise.all([
    db.seeraVisit.findMany({
      where: { workSessionId: session.id },
      include: {
        retailer: { select: { businessName: true, mobile: true, address: true, distributorId: true } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    db.seeraFollowUp.findMany({ where: { ownerId: actorId, createdAt: { gte: session.startedAt } } }),
    db.seeraVisitPhoto.count({ where: { actorId, capturedAt: { gte: session.startedAt }, deletedAt: null } }),
    db.seeraRetailer.count({
      where: { salespersonId: actorId, source: "UNPLANNED_FIELD_ADDED", createdAt: { gte: session.startedAt, lte: dayEnd } },
    }),
    db.seeraProspect.count({
      where: { ownerEmployeeId: actorId, prospectType: "DISTRIBUTOR", createdAt: { gte: session.startedAt, lte: dayEnd } },
    }),
    db.seeraTravelEstimate.findUnique({ where: { employeeId_workSessionId: { employeeId: actorId, workSessionId: session.id } } }),
  ]);
  const retailerIds = visits.map((v) => v.retailerId).filter((x): x is string => Boolean(x));
  const orders = retailerIds.length
    ? await db.seeraSalesOrder.findMany({
        where: { retailerId: { in: retailerIds }, salespersonId: actorId, createdAt: { gte: session.startedAt } },
        include: { lines: true },
      })
    : [];
  const rows = visits.map((visit) => {
    const order = orders.find((o) => o.retailerId === visit.retailerId);
    const eligible = order
      ? order.lines.reduce(
          (sum, line) =>
            sum +
            eligibleDelivered({
              ordered: Number(line.orderedQuantity),
              cancelled: Number(line.cancelledQuantity),
              delivered: Number(line.deliveredQuantity),
              refused: Number(line.refusedQuantity),
              approvedReturn: Number(line.returnedQuantity),
              unitValue: Number(line.priceSnapshot),
            }).value,
          0,
        )
      : 0;
    return {
      visitId: visit.id,
      shop: visit.retailer?.businessName ?? "Retailer",
      contact: visit.retailer?.mobile ?? null,
      orderNumber: order?.orderNumber ?? null,
      bookedValue: order ? Number(order.total) : 0,
      outcome: visit.outcome,
      followUpAt: visit.followUpAt,
      linkedDeliveredOutcome: order?.status ?? null,
      linkedEligibleValue: eligible,
    };
  });
  return {
    session,
    planned: rows.length,
    visited: rows.filter((r) => r.outcome !== "SKIPPED").length,
    productive: rows.filter((r) => r.outcome === "PRODUCTIVE").length,
    skipped: rows.filter((r) => r.outcome === "SKIPPED").length,
    unplannedAdded,
    distributorProspects,
    orders: orders.length,
    bookedValue: rows.reduce((s, r) => s + r.bookedValue, 0),
    linkedEligibleValue: rows.reduce((s, r) => s + r.linkedEligibleValue, 0),
    followUps: followUps.length,
    photos,
    distanceTravelledKm: travelEstimate ? Number(travelEstimate.distanceKm) : null,
    gps: {
      startInsideGeofence: session.startInsideGeofence,
      startExceptionReason: session.startExceptionReason,
      returnedToHq: session.returnedToHq,
      endExceptionReason: session.endExceptionReason,
      visitExceptions: visits.filter((v) => v.gpsExceptionReason).length,
    },
    rows,
  };
}

// Date-wise work history (Founder-UAT requirement: Today/Yesterday/This week/This month/custom
// date range, with a per-day summary an Executive can open into full retailer-level detail via
// executiveDsr). Bounded to `take` (default 31, one month of calendar days) so the per-session
// summary aggregation below stays a small, predictable number of extra round trips rather than an
// unbounded N+1 — acceptable at UAT/single-executive scale; would need a real grouped rollup
// query before this is used at multi-year history scale.
export async function executiveDsrHistory(
  db: PrismaClient,
  actorId: string,
  input: { from?: Date; to?: Date; skip?: number; take?: number } = {},
) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const sessions = await db.seeraWorkSession.findMany({
    where: {
      employeeId: actorId,
      employeeRole: "SALES_EXECUTIVE",
      status: { not: "ACTIVE" },
      ...(input.from || input.to
        ? { startedAt: { gte: input.from, lte: input.to } }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 31,
  });
  return Promise.all(
    sessions.map(async (session) => {
      const dayEnd = session.endedAt ?? new Date();
      const [visits, orders, photos, newRetailers] = await Promise.all([
        db.seeraVisit.findMany({ where: { workSessionId: session.id }, select: { outcome: true } }),
        db.seeraSalesOrder.findMany({
          where: { salespersonId: actorId, createdAt: { gte: session.startedAt, lte: dayEnd } },
          select: { total: true },
        }),
        db.seeraVisitPhoto.count({ where: { actorId, capturedAt: { gte: session.startedAt, lte: dayEnd }, deletedAt: null } }),
        db.seeraRetailer.count({ where: { salespersonId: actorId, createdAt: { gte: session.startedAt, lte: dayEnd } } }),
      ]);
      return {
        session,
        visited: visits.filter((v) => v.outcome !== "SKIPPED").length,
        productive: visits.filter((v) => v.outcome === "PRODUCTIVE").length,
        skipped: visits.filter((v) => v.outcome === "SKIPPED").length,
        orders: orders.length,
        bookedValue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        photos,
        newRetailers,
      };
    }),
  );
}

// Read-only Distributor payment-follow-up context for the executive's own mapped Distributor(s) —
// reuses the same canonicalDistributorExposure the Distributor/S.S. Credit pages read from, scoped
// down to only the Distributors that actually supply this executive's own retailer book.
export async function executiveDistributorFollowUp(db: PrismaClient, actorId: string, now = new Date()) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const own = await db.seeraRetailer.findMany({
    where: { salespersonId: actorId, distributorId: { not: null } },
    select: { distributorId: true },
    distinct: ["distributorId"],
  });
  const distributorIds = own.map((r) => r.distributorId).filter((x): x is string => Boolean(x));
  if (!distributorIds.length) return [];
  const distributors = await db.seeraPartner.findMany({
    where: { id: { in: distributorIds } },
    select: { id: true, legalName: true, tradeName: true },
  });
  return Promise.all(
    distributors.map(async (distributor) => {
      const exposure = await canonicalDistributorExposure(db, distributor.id, now);
      const oldest = exposure.openOrders[0];
      const promise = oldest
        ? await db.seeraPaymentPromise.findFirst({
            where: { orderId: oldest.id },
            orderBy: { createdAt: "desc" },
          })
        : null;
      const lastPayment = await db.seeraPaymentRecord.findFirst({
        where: { payerType: "DISTRIBUTOR", payerId: distributor.id, status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } },
        orderBy: { paymentDate: "desc" },
      });
      return {
        distributor,
        outstanding: exposure.exposure,
        overdue: oldest ? now > oldest.originalDueDate! : false,
        originalDueDate: oldest?.originalDueDate ?? null,
        promiseDate: promise?.promisedPaymentDate ?? null,
        lastPaymentDate: lastPayment?.paymentDate ?? null,
      };
    }),
  );
}

export async function acknowledgeInstruction(db: PrismaClient, actorId: string, instructionId: string) {
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  const instruction = await db.seeraManagerInstruction.findFirst({
    where: { id: instructionId, assignedEmployeeId: actorId },
  });
  if (!instruction)
    throw new FoundationError("INSTRUCTION_SCOPE_DENIED", "Instruction unavailable", 403);
  return db.seeraManagerInstruction.update({
    where: { id: instruction.id },
    data: {
      acknowledgedAt: instruction.acknowledgedAt ?? new Date(),
      status: instruction.status === "ASSIGNED" ? "ACKNOWLEDGED" : instruction.status,
    },
  });
}

export async function completeInstruction(
  db: PrismaClient,
  actorId: string,
  instructionId: string,
  input: { remarks?: string },
) {
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  const instruction = await db.seeraManagerInstruction.findFirst({
    where: { id: instructionId, assignedEmployeeId: actorId },
  });
  if (!instruction)
    throw new FoundationError("INSTRUCTION_SCOPE_DENIED", "Instruction unavailable", 403);
  return db.seeraManagerInstruction.update({
    where: { id: instruction.id },
    data: {
      acknowledgedAt: instruction.acknowledgedAt ?? new Date(),
      completedAt: new Date(),
      status: "COMPLETED",
      remarks: input.remarks,
    },
  });
}
