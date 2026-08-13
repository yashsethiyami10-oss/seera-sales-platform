import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";

// Pre-launch Pass 0E: cheap, network-wide stock exception visibility for the Founder — without a
// per-partner recompute loop (that pattern already exists per-partner in
// super-stockist-easy-mode-service.ts's superStockistStockSummary/distributor-easy-mode-service.ts's
// equivalent, and is deliberately NOT reused here at network scale). Instead this does exactly 4
// indexed groupBy aggregates (one per movement direction) over seera_inventory_movements — using the
// same (partyType, partyId, skuId) index those per-partner functions already rely on — then combines
// the four sums in memory. Only (party, sku) pairs that actually HAVE movement history are ever
// considered (a partner that never touched a SKU is not "out of stock" of it, just not carrying it),
// so this scales with real activity, not with the full partner x catalog cross-product.
async function networkStockExceptionCount(db: PrismaClient) {
  const [activePartners, inSum, outSum, reserveSum, releaseSum] = await Promise.all([
    db.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, lifecycle: "ACTIVE" }, select: { id: true } }),
    db.seeraInventoryMovement.groupBy({ by: ["partyType", "partyId", "skuId"], where: { direction: "IN" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.groupBy({ by: ["partyType", "partyId", "skuId"], where: { direction: "OUT" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.groupBy({ by: ["partyType", "partyId", "skuId"], where: { direction: "RESERVE" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.groupBy({ by: ["partyType", "partyId", "skuId"], where: { direction: "RELEASE" }, _sum: { quantity: true } }),
  ]);
  const activeIds = new Set(activePartners.map((p) => p.id));
  const key = (r: { partyType: string; partyId: string; skuId: string }) => `${r.partyType}:${r.partyId}:${r.skuId}`;
  const position = new Map<string, { onHand: number; reserved: number }>();
  for (const row of inSum) position.set(key(row), { onHand: (position.get(key(row))?.onHand ?? 0) + Number(row._sum.quantity ?? 0), reserved: position.get(key(row))?.reserved ?? 0 });
  for (const row of outSum) { const k = key(row); const p = position.get(k) ?? { onHand: 0, reserved: 0 }; p.onHand -= Number(row._sum.quantity ?? 0); position.set(k, p); }
  for (const row of reserveSum) { const k = key(row); const p = position.get(k) ?? { onHand: 0, reserved: 0 }; p.reserved += Number(row._sum.quantity ?? 0); position.set(k, p); }
  for (const row of releaseSum) { const k = key(row); const p = position.get(k) ?? { onHand: 0, reserved: 0 }; p.reserved -= Number(row._sum.quantity ?? 0); position.set(k, p); }
  let exceptions = 0;
  for (const [k, p] of position) {
    const partyId = k.split(":")[1] ?? "";
    if (!activeIds.has(partyId)) continue;
    if (p.onHand - p.reserved <= 0) exceptions++;
  }
  return exceptions;
}

// Pre-launch Pass 0C: a genuinely useful Founder/Admin attention dashboard — deep-linked,
// actionable cards computed from real open work, not vanity counters. Every card here answers
// "what needs the Founder's decision or oversight right now", and every deepLink resolves to a
// real founder-admin surface slug (lib/foundation/product-surface.ts's `founder` array) so the
// card is never a dead end.
export async function founderAttentionDashboard(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "portal:admin" });
  const now = new Date();

  const [
    companyOrdersAwaitingProof,
    companyOrdersAwaitingVerification,
    companyOrdersReadyForDispatch,
    companyOrdersAwaitingSsReceipt,
    activeDistributorsMissingCreditTerm,
    activeExecutives,
    mappedExecutiveIds,
    skusMissingTaxConfig,
    deadLetteredCommunications,
    creditExtensionsPending,
    networkStockExceptions,
  ] = await Promise.all([
    db.seeraSalesOrder.count({ where: { type: "COMPANY_REPLENISHMENT", status: "SUBMITTED" } }),
    db.seeraPaymentProof.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, order: { type: "COMPANY_REPLENISHMENT" } } }),
    db.seeraSalesOrder.count({ where: { type: "COMPANY_REPLENISHMENT", status: "CONFIRMED" } }),
    db.seeraSalesOrder.count({ where: { type: "COMPANY_REPLENISHMENT", status: "DISPATCHED" } }),
    db.seeraPartner.findMany({
      where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE", creditTerms: { none: {} } },
      select: { id: true },
    }),
    db.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } }, select: { userId: true } }),
    db.seeraAssignment.findMany({
      where: { assignmentType: "MANAGER_TEAM", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      select: { subjectId: true },
    }),
    db.seeraSku.count({ where: { status: { not: "DISCONTINUED" }, OR: [{ hsn: null }, { taxRate: null }] } }),
    db.outboxEvent.count({ where: { status: "DEAD_LETTER" } }),
    db.seeraCreditExtension.count({ where: { status: "PENDING" } }),
    networkStockExceptionCount(db),
  ]);

  const mappedSet = new Set(mappedExecutiveIds.map((a) => a.subjectId));
  const unmappedExecutives = activeExecutives.filter((e) => !mappedSet.has(e.userId)).length;

  const attention: { code: string; title: string; deepLink: string }[] = [];
  if (companyOrdersAwaitingProof) attention.push({ code: "COMPANY_ORDER_AWAITING_PROOF", title: `${companyOrdersAwaitingProof} Company order(s) awaiting advance payment proof`, deepLink: "orders" });
  if (companyOrdersAwaitingVerification) attention.push({ code: "COMPANY_ORDER_AWAITING_VERIFICATION", title: `${companyOrdersAwaitingVerification} Company order proof(s) awaiting Accounts verification`, deepLink: "payments" });
  if (companyOrdersReadyForDispatch) attention.push({ code: "COMPANY_ORDER_READY_FOR_DISPATCH", title: `${companyOrdersReadyForDispatch} Company order(s) payment-verified, ready for dispatch`, deepLink: "orders" });
  if (companyOrdersAwaitingSsReceipt) attention.push({ code: "COMPANY_ORDER_AWAITING_SS_RECEIPT", title: `${companyOrdersAwaitingSsReceipt} Company order(s) dispatched, awaiting Super Stockist receipt`, deepLink: "orders" });
  if (activeDistributorsMissingCreditTerm.length) attention.push({ code: "DISTRIBUTOR_MISSING_CREDIT_TERMS", title: `${activeDistributorsMissingCreditTerm.length} active Distributor(s) have no credit terms configured`, deepLink: "distributors" });
  if (unmappedExecutives) attention.push({ code: "EXECUTIVE_UNMAPPED", title: `${unmappedExecutives} Sales Executive(s) not mapped to a Manager`, deepLink: "field-force" });
  if (skusMissingTaxConfig) attention.push({ code: "SKU_MISSING_TAX_CONFIG", title: `${skusMissingTaxConfig} SKU(s) missing HSN/GST configuration`, deepLink: "masters" });
  if (deadLetteredCommunications) attention.push({ code: "COMMUNICATION_DEAD_LETTERED", title: `${deadLetteredCommunications} retailer communication(s) failed permanently and need review`, deepLink: "notifications" });
  if (creditExtensionsPending) attention.push({ code: "CREDIT_EXTENSION_PENDING", title: `${creditExtensionsPending} credit extension request(s) awaiting decision`, deepLink: "payments" });
  if (networkStockExceptions) attention.push({ code: "NETWORK_STOCK_EXCEPTION", title: `${networkStockExceptions} product/partner combination(s) network-wide are out of available stock`, deepLink: "network-stock" });

  return {
    cards: {
      companyOrdersAwaitingProof,
      companyOrdersAwaitingVerification,
      companyOrdersReadyForDispatch,
      companyOrdersAwaitingSsReceipt,
      activeDistributorsMissingCreditTerm: activeDistributorsMissingCreditTerm.length,
      unmappedExecutives,
      skusMissingTaxConfig,
      deadLetteredCommunications,
      creditExtensionsPending,
      networkStockExceptions,
    },
    attention,
  };
}
