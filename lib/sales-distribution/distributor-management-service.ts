import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";
import { numberFor } from "./workflow-service";

// Founder decision (Super Stockist 95% pass, section 16-17): "Add Distributor" is reachable from
// the S.S. portal itself — the S.S. onboards the Distributors in its own network, including their
// initial credit policy, in one governed step. This is the first application-code path that ever
// creates a SeeraPartner{type:DISTRIBUTOR} — until now only test/seed scripts did. No ledger
// balance is ever created here (opening outstanding is explicitly out of scope per the Founder's
// own instruction — "Do NOT silently create ledger balance from a form unless explicitly
// authorized"), only the partner record and, optionally, its first SeeraCreditTerm version.
export async function createDistributorForSuperStockist(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: {
    firmName: string;
    address: Record<string, unknown>;
    mobile: string;
    ownerName?: string;
    alternateMobile?: string;
    email?: string;
    gstin?: string;
    pincode?: string;
    territoryId?: string;
    notes?: string;
    creditEnabled: boolean;
    creditLimit?: number;
    creditDays?: number;
    warningThreshold?: number;
    blockThreshold?: number;
    graceEnabled?: boolean;
    graceDays?: number;
    idempotencyKey: string;
  },
) {
  await authorize(prisma, { actorId, permission: "distributor_credit:manage" });
  // Stage 4 fix: same class of gap as decideReturnRequest (returns-service.ts) — strict
  // same-party membership left the Founder/Admin unable to onboard a Distributor for ANY S.S.
  // they aren't personally a registered SeeraPartyUser of, even though "Add Distributor" is
  // explicitly a Founder/Admin CRUD capability too (Stage 4), not just an S.S. self-service one.
  // Same system:super_admin bypass precedent as document-service.ts/returns-service.ts.
  const permissions = await effectivePermissions(prisma, actorId);
  if (!permissions.has("system:super_admin"))
    await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  if (!input.firmName.trim())
    throw new FoundationError("FIRM_NAME_REQUIRED", "Firm / business name is required", 400);
  const normalizedMobile = input.mobile.replace(/\D/g, "");
  if (normalizedMobile.length < 10)
    throw new FoundationError("INVALID_MOBILE", "A valid primary mobile number is required", 400);
  if (input.creditEnabled && (input.creditLimit == null || input.creditLimit < 0))
    throw new FoundationError("INVALID_CREDIT_LIMIT", "A non-negative credit limit is required when credit is enabled", 400);
  const existing = await prisma.seeraPartner.findFirst({ where: { code: numberFor("DIST", input.idempotencyKey) } });
  if (existing) return { partner: existing, creditTerm: await prisma.seeraCreditTerm.findFirst({ where: { distributorId: existing.id }, orderBy: { effectiveFrom: "desc" } }) };
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const partner = await tx.seeraPartner.create({
      data: {
        type: "DISTRIBUTOR",
        code: numberFor("DIST", input.idempotencyKey),
        legalName: input.firmName.trim(),
        gstin: input.gstin?.trim() || undefined,
        primaryContact: { mobile: normalizedMobile, ownerName: input.ownerName, alternateMobile: input.alternateMobile, email: input.email },
        addresses: { ...input.address, pincode: input.pincode },
        territoryIds: input.territoryId ? [input.territoryId] : [],
        assignedSuperStockistId: superStockistId,
        lifecycle: "ACTIVE",
        appointmentDate: now,
        remarks: input.notes,
        createdById: actorId,
      },
    });
    let creditTerm = null;
    if (input.creditEnabled) {
      creditTerm = await tx.seeraCreditTerm.create({
        data: {
          distributorId: partner.id,
          creditEnabled: true,
          creditLimit: input.creditLimit ?? 0,
          creditDays: input.creditDays ?? 0,
          warningThreshold: input.warningThreshold,
          blockThreshold: input.blockThreshold,
          graceEnabled: input.graceEnabled ?? false,
          graceDays: input.graceDays ?? 0,
          effectiveFrom: now,
          changeReason: "Initial credit policy set at Distributor onboarding",
          createdById: actorId,
        },
      });
    }
    await recordAudit(tx, {
      actorId,
      action: "distributor.created",
      entityType: "SeeraPartner",
      entityId: partner.id,
      afterState: { legalName: partner.legalName, assignedSuperStockistId: superStockistId, creditEnabled: input.creditEnabled },
    });
    return { partner, creditTerm };
  });
}

// Stage 3 fix: createDistributorForSuperStockist (above) lets an EXISTING S.S. onboard its own
// Distributors, but nothing in application code could create the FIRST party in the chain — a new
// Super Stockist — outside a seed script. Founder-only (master:manage), no upstream party/credit
// terms (S.S. has neither), no idempotencyKey collision (mirrors the same numberFor(...)-based
// upsert-safety as createDistributorForSuperStockist).
export async function createSuperStockist(
  prisma: PrismaClient,
  actorId: string,
  input: {
    firmName: string;
    tradeName?: string;
    address: Record<string, unknown>;
    mobile: string;
    ownerName?: string;
    alternateMobile?: string;
    email?: string;
    gstin?: string;
    pincode?: string;
    territoryIds?: string[];
    notes?: string;
    // Founder/Admin UAT correction: the Add Super Stockist form captures a governed billing
    // identity in the same step (spec section 3) — optional because a Founder may onboard the
    // party first and complete billing verification later. Mirrors the exact fields the existing
    // seed fixture already uses for SeeraBillingProfile, nothing invented.
    billingProfile?: {
      state: string;
      stateCode: string;
      invoicePrefix: string;
    };
    idempotencyKey: string;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!input.firmName.trim())
    throw new FoundationError("FIRM_NAME_REQUIRED", "Firm / legal name is required", 400);
  const normalizedMobile = input.mobile.replace(/\D/g, "");
  if (normalizedMobile.length < 10)
    throw new FoundationError("INVALID_MOBILE", "A valid primary mobile number is required", 400);
  const code = numberFor("SS", input.idempotencyKey);
  const existing = await prisma.seeraPartner.findFirst({ where: { code } });
  if (existing) return existing;
  const now = new Date();
  const partner = await prisma.$transaction(async (tx) => {
    const created = await tx.seeraPartner.create({
      data: {
        type: "SUPER_STOCKIST",
        code,
        legalName: input.firmName.trim(),
        tradeName: input.tradeName?.trim() || undefined,
        gstin: input.gstin?.trim() || undefined,
        primaryContact: { mobile: normalizedMobile, ownerName: input.ownerName, alternateMobile: input.alternateMobile, email: input.email },
        addresses: { ...input.address, pincode: input.pincode },
        territoryIds: input.territoryIds ?? [],
        lifecycle: "ACTIVE",
        appointmentDate: now,
        remarks: input.notes,
        createdById: actorId,
      },
    });
    if (input.billingProfile) {
      await tx.seeraBillingProfile.create({
        data: {
          ownerType: "SUPER_STOCKIST",
          ownerId: created.id,
          legalName: created.legalName,
          tradeName: created.tradeName,
          gstRegistered: Boolean(input.gstin?.trim()),
          gstin: created.gstin,
          registeredAddress: created.addresses as object,
          state: input.billingProfile.state,
          stateCode: input.billingProfile.stateCode,
          invoicePrefix: input.billingProfile.invoicePrefix,
          authorizedBilling: true,
          verificationStatus: "VERIFIED",
          verifiedById: actorId,
          effectiveFrom: now,
          createdById: actorId,
        },
      });
    }
    await recordAudit(tx, {
      actorId,
      action: "super_stockist.created",
      entityType: "SeeraPartner",
      entityId: created.id,
      afterState: { legalName: created.legalName, code: created.code, billingProfileCreated: Boolean(input.billingProfile) },
    });
    return created;
  });
  return partner;
}

// Founder/Admin UAT correction (P0, section 13): a Distributor's Super Stockist assignment was
// set once at createDistributorForSuperStockist and never had any application-code path to
// change again — grepped assignedSuperStockistId across lib/ and confirmed it. Founder-only
// (network:manage, the same permission that gates the Super Stockists/Distributors nav entries),
// deliberately not exposed to the S.S. side — a Distributor cannot reassign itself away from its
// own upstream S.S. Historical orders/documents already snapshot their commercial party at
// creation time (priceSnapshot/partySnapshot pattern used throughout this codebase) and are never
// touched here; only SeeraPartner.assignedSuperStockistId changes, governing future routing only.
export async function reassignDistributorToSuperStockist(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: {
    newSuperStockistId: string;
    effectiveFrom: Date;
    reason: string;
    idempotencyKey: string;
  },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (!input.reason.trim())
    throw new FoundationError("REASSIGNMENT_REASON_REQUIRED", "A reason is required to reassign a Distributor", 400);
  const existingEvent = await prisma.seeraDistributorReassignmentEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingEvent) return existingEvent;
  const distributor = await prisma.seeraPartner.findFirst({ where: { id: distributorId, type: "DISTRIBUTOR" } });
  if (!distributor) throw new FoundationError("DISTRIBUTOR_NOT_FOUND", "Distributor is unavailable", 404);
  const newSuperStockist = await prisma.seeraPartner.findFirst({
    where: { id: input.newSuperStockistId, type: "SUPER_STOCKIST", lifecycle: "ACTIVE" },
  });
  if (!newSuperStockist)
    throw new FoundationError("SUPER_STOCKIST_NOT_FOUND", "Target Super Stockist is unavailable or inactive", 404);
  if (distributor.assignedSuperStockistId === input.newSuperStockistId)
    throw new FoundationError("REASSIGNMENT_NO_OP", "Distributor is already assigned to this Super Stockist", 409);
  const [event] = await prisma.$transaction([
    prisma.seeraDistributorReassignmentEvent.create({
      data: {
        distributorId,
        fromSuperStockistId: distributor.assignedSuperStockistId,
        toSuperStockistId: input.newSuperStockistId,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        actorId,
        idempotencyKey: input.idempotencyKey,
      },
    }),
    prisma.seeraPartner.update({ where: { id: distributorId }, data: { assignedSuperStockistId: input.newSuperStockistId } }),
  ]);
  await recordAudit(prisma, {
    actorId,
    action: "distributor.reassigned",
    entityType: "SeeraPartner",
    entityId: distributorId,
    reason: input.reason,
    beforeState: { assignedSuperStockistId: distributor.assignedSuperStockistId },
    afterState: { assignedSuperStockistId: input.newSuperStockistId },
  });
  return event;
}

// Credit policy is versioned, never overwritten in place — the prior version's effectiveTo is
// closed at the moment the new one starts, so the full history of every limit/days/threshold
// change stays queryable (matches the same immutable-version pattern SeeraPriceVersion already
// uses elsewhere in this codebase).
export async function updateDistributorCreditPolicy(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: {
    distributorId: string;
    creditEnabled: boolean;
    creditLimit: number;
    creditDays: number;
    warningThreshold?: number;
    blockThreshold?: number;
    graceEnabled?: boolean;
    graceDays?: number;
    changeReason: string;
  },
) {
  await authorize(prisma, { actorId, permission: "distributor_credit:manage" });
  // Stage 4 fix: same Founder-reachability gap as createDistributorForSuperStockist above —
  // Credit Policies is an explicit Founder/Admin CRUD capability (Stage 4), not S.S.-self-service
  // only.
  const permissions = await effectivePermissions(prisma, actorId);
  if (!permissions.has("system:super_admin"))
    await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  if (!input.changeReason.trim())
    throw new FoundationError("CREDIT_CHANGE_REASON_REQUIRED", "A reason is required to change credit policy", 400);
  if (input.creditLimit < 0) throw new FoundationError("INVALID_CREDIT_LIMIT", "Credit limit cannot be negative", 400);
  const distributor = await prisma.seeraPartner.findFirst({ where: { id: input.distributorId, type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId } });
  if (!distributor)
    throw new FoundationError("DISTRIBUTOR_SCOPE_DENIED", "Distributor is outside this Super Stockist's network", 403);
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const current = await tx.seeraCreditTerm.findFirst({
      where: { distributorId: input.distributorId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    });
    if (current && current.effectiveFrom.getTime() !== now.getTime())
      await tx.seeraCreditTerm.update({ where: { id: current.id }, data: { effectiveTo: now } });
    const updated = await tx.seeraCreditTerm.create({
      data: {
        distributorId: input.distributorId,
        creditEnabled: input.creditEnabled,
        creditLimit: input.creditLimit,
        creditDays: input.creditDays,
        warningThreshold: input.warningThreshold,
        blockThreshold: input.blockThreshold,
        graceEnabled: input.graceEnabled ?? current?.graceEnabled ?? false,
        graceDays: input.graceDays ?? current?.graceDays ?? 0,
        effectiveFrom: now,
        changeReason: input.changeReason,
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "distributor_credit.updated",
      entityType: "SeeraCreditTerm",
      entityId: updated.id,
      beforeState: current ? { creditLimit: Number(current.creditLimit), creditDays: current.creditDays, creditEnabled: current.creditEnabled } : undefined,
      afterState: { creditLimit: input.creditLimit, creditDays: input.creditDays, creditEnabled: input.creditEnabled, reason: input.changeReason },
    });
    return updated;
  });
}

// STAGE 14 — Distributor Closure Stock Settlement. Founder decision: "No routine Company return
// program. Only Distributor Closure Stock Settlement" — replaces the previous silent write-off,
// where transitionPartnerLifecycle's obligations.stock/advances/pendingClaims were hardcoded to 0
// (never computed), so a Distributor with a warehouse full of unsold physical stock could be
// routinely CLOSEd with zero reconciliation. This computes the REAL physical position (reusing the
// exact same IN/OUT/RESERVE/RELEASE ledger every other stock screen reads, so it can never disagree
// with what the Distributor's own Stock page shows) so closureDecision()'s obligation check has a
// real, non-zero figure to actually block on.
export async function distributorClosureStockPosition(prisma: PrismaClient, actorId: string, distributorId: string) {
  await authorize(prisma, { actorId, permission: "partner_lifecycle:manage" });
  const distributor = await prisma.seeraPartner.findFirst({ where: { id: distributorId, type: "DISTRIBUTOR" } });
  if (!distributor) throw new FoundationError("DISTRIBUTOR_NOT_FOUND", "Distributor not found", 404);
  const movements = await prisma.seeraInventoryMovement.groupBy({
    by: ["skuId", "direction"],
    where: { partyType: "DISTRIBUTOR", partyId: distributorId },
    _sum: { quantity: true },
  });
  const bySku = new Map<string, { onHand: number; reserved: number }>();
  for (const row of movements) {
    const entry = bySku.get(row.skuId) ?? { onHand: 0, reserved: 0 };
    const qty = Number(row._sum.quantity ?? 0);
    if (row.direction === "IN") entry.onHand += qty;
    if (row.direction === "OUT") entry.onHand -= qty;
    if (row.direction === "RESERVE") entry.reserved += qty;
    if (row.direction === "RELEASE") entry.reserved -= qty;
    bySku.set(row.skuId, entry);
  }
  const skuIds = [...bySku.keys()].filter((skuId) => (bySku.get(skuId)?.onHand ?? 0) > 0);
  const skus = skuIds.length
    ? await prisma.seeraSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, code: true, productName: true } })
    : [];
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const lines = skuIds.map((skuId) => ({
    skuId,
    code: skuById.get(skuId)?.code ?? skuId,
    productName: skuById.get(skuId)?.productName ?? skuId,
    onHand: bySku.get(skuId)!.onHand,
  }));
  return { distributor, lines, totalUnits: lines.reduce((sum, l) => sum + l.onHand, 0) };
}

// Take-back leg of closure: every remaining physical unit moves OUT of the closing Distributor's
// ledger and IN to the receiving Super Stockist's ledger (normally their own assigned S.S. — the
// natural physical/commercial return path) in one governed, audited transaction. Zeroes the
// Distributor's stock obligation so a subsequent CLOSE genuinely has nothing left unresolved,
// rather than a hardcoded 0 pretending there was never anything to reconcile.
export async function settleDistributorClosureStock(
  prisma: PrismaClient,
  actorId: string,
  input: { distributorId: string; receivingSuperStockistId: string; reason: string; idempotencyKey: string },
) {
  await authorize(prisma, { actorId, permission: "partner_lifecycle:manage" });
  if (!input.reason.trim())
    throw new FoundationError("CLOSURE_SETTLEMENT_REASON_REQUIRED", "A reason is required to settle closure stock", 400);
  const receivingSS = await prisma.seeraPartner.findFirst({ where: { id: input.receivingSuperStockistId, type: "SUPER_STOCKIST" } });
  if (!receivingSS) throw new FoundationError("SUPER_STOCKIST_NOT_FOUND", "Receiving Super Stockist not found", 404);
  const position = await distributorClosureStockPosition(prisma, actorId, input.distributorId);
  if (!position.lines.length)
    throw new FoundationError("NO_CLOSURE_STOCK", "This Distributor has no remaining physical stock to settle", 400);
  return prisma.$transaction(async (tx) => {
    const movementIds: string[] = [];
    for (const line of position.lines) {
      const out = await tx.seeraInventoryMovement.create({
        data: {
          partyType: "DISTRIBUTOR",
          partyId: input.distributorId,
          skuId: line.skuId,
          type: "CORRECTION",
          direction: "OUT",
          quantity: line.onHand,
          sourceType: "DistributorClosureSettlement",
          sourceId: input.distributorId,
          actorId,
          sourcePortal: "founder-admin",
          reason: `Closure stock take-back: ${input.reason.trim()}`,
          idempotencyKey: `${input.idempotencyKey}-out-${line.skuId}`,
        },
      });
      const inMovement = await tx.seeraInventoryMovement.create({
        data: {
          partyType: "SUPER_STOCKIST",
          partyId: input.receivingSuperStockistId,
          skuId: line.skuId,
          type: "CORRECTION",
          direction: "IN",
          quantity: line.onHand,
          sourceType: "DistributorClosureSettlement",
          sourceId: input.distributorId,
          actorId,
          sourcePortal: "founder-admin",
          reason: `Closure stock take-back from ${position.distributor.tradeName ?? position.distributor.legalName}: ${input.reason.trim()}`,
          idempotencyKey: `${input.idempotencyKey}-in-${line.skuId}`,
        },
      });
      movementIds.push(out.id, inMovement.id);
    }
    await recordAudit(tx, {
      actorId,
      action: "distributor_closure.stock_settled",
      entityType: "SeeraPartner",
      entityId: input.distributorId,
      afterState: {
        receivingSuperStockistId: input.receivingSuperStockistId,
        totalUnits: position.totalUnits,
        lines: position.lines.map((l) => ({ skuId: l.skuId, code: l.code, onHand: l.onHand })),
        reason: input.reason,
      },
    });
    return { settledLines: position.lines.length, totalUnits: position.totalUnits, movementIds };
  });
}
