import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Final Retailer Cleanup + Handover (22-Aug): every retailer created in production so far was
// created for testing during this engagement (Founder decision, not inferred) — this is the
// governed cleanup path. Two outcomes only, chosen by real dependency data, never guessed:
//   - genuinely zero dependencies (no order/visit/document/ledger row anywhere) -> hard delete is
//     safe and reversible-in-spirit (nothing is lost because nothing real was ever attached).
//   - any dependency at all -> archive (lifecycle: INACTIVE) instead. Every operational read site
//     already scopes retailers by lifecycle:"ACTIVE" (verified across Executive/Manager/
//     Distributor/document surfaces) or now does after this pass, so an archived retailer stops
//     appearing anywhere operational while every order/visit/photo/document/ledger row it's
//     attached to stays exactly as it is — no orphan, no cascade, no data loss.
async function dependencyCounts(db: PrismaClient, retailerId: string) {
  const [orders, visits, documents, ledger] = await Promise.all([
    db.seeraSalesOrder.count({ where: { retailerId } }),
    db.seeraVisit.count({ where: { retailerId } }),
    db.seeraCommercialDocument.count({ where: { buyerType: "RETAILER", buyerId: retailerId } }),
    db.seeraFinancialEntry.count({ where: { OR: [{ debitPartyType: "RETAILER", debitPartyId: retailerId }, { creditPartyType: "RETAILER", creditPartyId: retailerId }] } }),
  ]);
  return { orders, visits, documents, ledger, total: orders + visits + documents + ledger };
}

// Founder-facing cleanup worklist: every non-archived retailer today, with the exact dependency
// counts that decide which governed action (archive vs hard-delete) applies to it — same rule
// dependencyCounts already encodes, surfaced read-only so the Founder can act per-row from the UI
// instead of a script (production DB writes are categorically blocked outside the running app —
// see lib/database/identity-guard.ts — so this panel IS the execution path for the cleanup).
export async function retailerCleanupOverview(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const retailers = await prisma.seeraRetailer.findMany({
    where: { lifecycle: { not: "INACTIVE" } },
    orderBy: { createdAt: "asc" },
  });
  const salespersonIds = [...new Set(retailers.map((r) => r.salespersonId).filter((x): x is string => Boolean(x)))];
  const distributorIds = [...new Set(retailers.map((r) => r.distributorId).filter((x): x is string => Boolean(x)))];
  const [salespeople, distributors] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, email: true } }),
    prisma.seeraPartner.findMany({ where: { id: { in: distributorIds } }, select: { id: true, legalName: true, tradeName: true } }),
  ]);
  const spMap = new Map(salespeople.map((s) => [s.id, s.name ?? s.email]));
  const distMap = new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  return Promise.all(
    retailers.map(async (r) => {
      const deps = await dependencyCounts(prisma, r.id);
      return {
        id: r.id,
        code: r.code,
        businessName: r.businessName,
        mobile: r.mobile ?? r.normalizedMobile,
        executive: r.salespersonId ? (spMap.get(r.salespersonId) ?? r.salespersonId) : null,
        distributor: r.distributorId ? (distMap.get(r.distributorId) ?? r.distributorId) : null,
        createdAt: r.createdAt,
        dependencies: deps,
        recommendedAction: deps.total === 0 ? ("HARD_DELETE" as const) : ("ARCHIVE" as const),
      };
    }),
  );
}

export async function archiveRetailer(prisma: PrismaClient, actorId: string, input: { retailerId: string; reason: string }) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!input.reason.trim()) throw new FoundationError("ARCHIVE_REASON_REQUIRED", "A reason is required to archive a retailer", 400);
  const retailer = await prisma.seeraRetailer.findUnique({ where: { id: input.retailerId } });
  if (!retailer) throw new FoundationError("RETAILER_NOT_FOUND", "Retailer not found", 404);
  if (retailer.lifecycle === "INACTIVE") return retailer;
  const deps = await dependencyCounts(prisma, input.retailerId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.seeraRetailer.update({ where: { id: input.retailerId }, data: { lifecycle: "INACTIVE" } });
    await recordAudit(tx, {
      actorId,
      action: "retailer.archived",
      entityType: "SeeraRetailer",
      entityId: input.retailerId,
      reason: input.reason,
      beforeState: { lifecycle: retailer.lifecycle },
      afterState: { lifecycle: "INACTIVE", dependencies: deps },
    });
    return result;
  });
  return updated;
}

export async function hardDeleteRetailer(prisma: PrismaClient, actorId: string, input: { retailerId: string; reason: string }) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!input.reason.trim()) throw new FoundationError("DELETE_REASON_REQUIRED", "A reason is required to permanently delete a retailer", 400);
  const retailer = await prisma.seeraRetailer.findUnique({ where: { id: input.retailerId } });
  if (!retailer) throw new FoundationError("RETAILER_NOT_FOUND", "Retailer not found", 404);
  const deps = await dependencyCounts(prisma, input.retailerId);
  if (deps.total > 0)
    throw new FoundationError(
      "RETAILER_HAS_DEPENDENCIES",
      `Cannot permanently delete — this retailer has ${deps.orders} order(s), ${deps.visits} visit(s), ${deps.documents} document(s), ${deps.ledger} ledger entr${deps.ledger === 1 ? "y" : "ies"}. Archive instead.`,
      409,
    );
  await prisma.$transaction(async (tx) => {
    await recordAudit(tx, {
      actorId,
      action: "retailer.hard_deleted",
      entityType: "SeeraRetailer",
      entityId: input.retailerId,
      reason: input.reason,
      beforeState: { businessName: retailer.businessName, code: retailer.code },
    });
    await tx.seeraRetailer.delete({ where: { id: input.retailerId } });
  });
  return { deleted: true, retailerId: input.retailerId };
}

// Manager "Unmapped Retailers" utility (Part 6): real retailers that exist but have no Beat/
// Territory assigned yet — surfaced explicitly rather than silently invisible, so a Manager can
// assign them via governed action instead of the geography ever being guessed from free text.
export async function unmappedRetailers(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const retailers = await prisma.seeraRetailer.findMany({
    where: { lifecycle: "ACTIVE", beatId: null, territoryId: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const salespersonIds = [...new Set(retailers.map((r) => r.salespersonId).filter((x): x is string => Boolean(x)))];
  const distributorIds = [...new Set(retailers.map((r) => r.distributorId).filter((x): x is string => Boolean(x)))];
  const [salespeople, distributors] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, email: true } }),
    prisma.seeraPartner.findMany({ where: { id: { in: distributorIds } }, select: { id: true, legalName: true, tradeName: true } }),
  ]);
  const spMap = new Map(salespeople.map((s) => [s.id, s.name ?? s.email]));
  const distMap = new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  return retailers.map((r) => ({
    id: r.id,
    businessName: r.businessName,
    ownerName: r.ownerName,
    mobile: r.mobile ?? r.normalizedMobile,
    address: r.address,
    executive: r.salespersonId ? (spMap.get(r.salespersonId) ?? r.salespersonId) : null,
    distributor: r.distributorId ? (distMap.get(r.distributorId) ?? r.distributorId) : null,
  }));
}

export async function assignRetailerGeography(
  prisma: PrismaClient,
  actorId: string,
  input: { retailerId: string; territoryId?: string; beatId?: string; marketId?: string; reason: string },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (!input.reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  if (!input.territoryId && !input.beatId && !input.marketId)
    throw new FoundationError("NO_GEOGRAPHY_SUPPLIED", "At least one of territory, beat, or market is required", 400);
  const retailer = await prisma.seeraRetailer.findUnique({ where: { id: input.retailerId } });
  if (!retailer) throw new FoundationError("RETAILER_NOT_FOUND", "Retailer not found", 404);
  // Real existing nodes only — never a freshly-typed name resolved/created here (that stays
  // Manager Beat Planner's own governed path via resolveOrCreateGeography).
  const ids = [input.territoryId, input.beatId, input.marketId].filter((x): x is string => Boolean(x));
  const found = await prisma.seeraGeographyNode.findMany({ where: { id: { in: ids } } });
  if (found.length !== ids.length) throw new FoundationError("GEOGRAPHY_NODE_NOT_FOUND", "One or more selected geography nodes do not exist", 404);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.seeraRetailer.update({
      where: { id: input.retailerId },
      data: { territoryId: input.territoryId, beatId: input.beatId, marketId: input.marketId },
    });
    await recordAudit(tx, {
      actorId,
      action: "retailer.geography_assigned",
      entityType: "SeeraRetailer",
      entityId: input.retailerId,
      reason: input.reason,
      beforeState: { territoryId: retailer.territoryId, beatId: retailer.beatId, marketId: retailer.marketId },
      afterState: { territoryId: input.territoryId, beatId: input.beatId, marketId: input.marketId },
    });
    return result;
  });
  return updated;
}
