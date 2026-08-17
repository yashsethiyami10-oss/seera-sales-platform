import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";
import { inventoryPosition } from "./business-rules";
import { fulfilDistributorReplenishment, allocateOrderStock } from "./workflow-service";
import { creditPositionFor } from "./credit-service";
import { partyOutstanding } from "./financial-service";
import { wholesaleOrderUnitToCanonicalPieces } from "./company-order-catalog";

// Founder decision (Super Stockist 95% pass, section 7-8): unlike the Distributor role, dispatch
// stays a distinct, detailed step for the S.S. (vehicle/driver/transporter/LR/challan/ETA) — so
// this orchestration only removes the mandatory separate ALLOCATION screen, chaining
// decide -> reserve into one call. It never touches dispatchAllocatedOrder; the existing, already
// detailed dispatch function is unchanged and is the deliberate next step after this.

// Shown on the order card before the S.S. decides, so "Ordered 100 / Available 70" is known
// up front rather than discovered as a failure after pressing Accept.
export async function distributorOrderLineAvailability(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  orderId: string,
) {
  await authorize(prisma, { actorId, permission: "super_stockist_orders:fulfil" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const order = await prisma.seeraSalesOrder.findFirst({
    where: { id: orderId, sellerPartnerId: superStockistId, type: "DISTRIBUTOR_REPLENISHMENT" },
    include: { lines: true },
  });
  if (!order) throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED", "Order unavailable", 403);
  return Promise.all(
    order.lines.map(async (line) => {
      const movements = await prisma.seeraInventoryMovement.findMany({
        where: { partyType: "SUPER_STOCKIST", partyId: superStockistId, skuId: line.skuId },
        select: { direction: true, quantity: true },
      });
      const position = inventoryPosition(movements.map((m) => ({ direction: m.direction, quantity: Number(m.quantity) })));
      return {
        lineId: line.id,
        skuId: line.skuId,
        productName: line.productNameSnapshot,
        unit: line.packSnapshot,
        ordered: Number(line.orderedQuantity),
        rate: Number(line.priceSnapshot),
        lineTotal: Number(line.lineTotal),
        available: Math.max(0, position.onHand - position.reserved),
      };
    }),
  );
}

// ACCEPT / PARTIAL collapse decide -> reserve into one call, leaving the order ALLOCATED and
// ready for the (still separate, still detailed) Dispatch screen. `lines` carries the quantity
// the S.S. is committing to for EACH line right now.
export async function acceptAndAllocateDistributorOrder(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: {
    orderId: string;
    decision: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT";
    lines: { lineId: string; quantity: number }[];
    reason?: string;
    idempotencyKey: string;
  },
) {
  if (input.decision === "REJECT") {
    if (!input.reason?.trim())
      throw new FoundationError("REJECT_REASON_REQUIRED", "A reason is required to reject an order", 400);
    return fulfilDistributorReplenishment(prisma, actorId, superStockistId, {
      orderId: input.orderId,
      accepted: [],
      action: "REJECT",
      reason: input.reason,
    });
  }
  await fulfilDistributorReplenishment(prisma, actorId, superStockistId, {
    orderId: input.orderId,
    accepted: input.lines,
    action: input.decision,
    reason: input.reason,
  });
  return allocateOrderStock(prisma, actorId, {
    partyType: "SUPER_STOCKIST",
    partyId: superStockistId,
    orderId: input.orderId,
    lines: input.lines,
    idempotencyKey: `${input.idempotencyKey}-alloc`,
  });
}

// Simple Stock page (section 11): PRODUCT/BRAND/AVAILABLE/RESERVED/INCOMING/PHYSICAL, one row per
// active SKU. Mirrors distributorStockSummary's math exactly (inventoryPosition + dispatched-minus-
// received incoming) so the two portals can never disagree about what "available" means, only the
// party the ledger is queried for differs.
export async function superStockistStockSummary(prisma: PrismaClient, actorId: string, superStockistId: string) {
  await authorize(prisma, { actorId, permission: "super_stockist_inventory:view" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const [skus, movements, incomingOrders, receivedMovements, latestReconciliation] = await Promise.all([
    prisma.seeraSku.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true, productName: true, brand: true, packSize: true, unitType: true },
      orderBy: [{ brand: "asc" }, { productName: "asc" }],
    }),
    prisma.seeraInventoryMovement.findMany({
      where: { partyType: "SUPER_STOCKIST", partyId: superStockistId },
      select: { skuId: true, direction: true, quantity: true },
    }),
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: superStockistId, type: "COMPANY_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED"] } },
      include: { lines: { select: { id: true, skuId: true, skuCodeSnapshot: true, dispatchedQuantity: true } } },
    }),
    prisma.seeraInventoryMovement.groupBy({
      by: ["sourceId", "skuId"],
      where: { partyType: "SUPER_STOCKIST", partyId: superStockistId, sourceType: "IncomingReceipt", direction: "IN" },
      _sum: { quantity: true },
    }),
    prisma.seeraStockReconciliation.findFirst({
      where: { partyType: "SUPER_STOCKIST", partyId: superStockistId, status: "APPROVED" },
      orderBy: { periodEnd: "desc" },
      include: { lines: { select: { skuId: true, physicalClosing: true } } },
    }),
  ]);
  const movementsBySku = new Map<string, { direction: "IN" | "OUT" | "RESERVE" | "RELEASE"; quantity: number }[]>();
  for (const m of movements) {
    const list = movementsBySku.get(m.skuId) ?? [];
    list.push({ direction: m.direction, quantity: Number(m.quantity) });
    movementsBySku.set(m.skuId, list);
  }
  const receivedFor = (orderId: string, skuId: string) =>
    Number(receivedMovements.find((x) => x.sourceId === orderId && x.skuId === skuId)?._sum.quantity ?? 0);
  // STAGE 12: line.dispatchedQuantity stays in the order's own commercial unit (e.g. Boxes), but
  // receivedFor(...) sums the physical stock ledger (canonical pieces, post-Stage-12 conversion) —
  // must convert the dispatched figure to pieces before comparing, or a partially-received Box/Bag
  // order shows a wrong (often negative) "incoming" figure on this Stock page.
  const incomingBySku = new Map<string, number>();
  for (const order of incomingOrders)
    for (const line of order.lines) {
      const dispatchedPieces = wholesaleOrderUnitToCanonicalPieces(line.skuCodeSnapshot, Number(line.dispatchedQuantity));
      const outstanding = dispatchedPieces - receivedFor(order.id, line.skuId);
      if (outstanding > 0) incomingBySku.set(line.skuId, (incomingBySku.get(line.skuId) ?? 0) + outstanding);
    }
  const physicalBySku = new Map(latestReconciliation?.lines.map((l) => [l.skuId, Number(l.physicalClosing)]) ?? []);
  return skus.map((sku) => {
    const position = inventoryPosition(movementsBySku.get(sku.id) ?? []);
    return {
      skuId: sku.id,
      code: sku.code,
      productName: sku.productName,
      brand: sku.brand,
      unit: `${sku.packSize.toString()} ${sku.unitType}`,
      available: Math.max(0, position.onHand - position.reserved),
      reserved: position.reserved,
      incoming: incomingBySku.get(sku.id) ?? 0,
      physical: physicalBySku.get(sku.id) ?? null,
    };
  });
}

// Actionable Dashboard (section 4): the six top cards plus a deep-linkable "what needs your
// attention today" list, computed directly from the same canonical order/claim/credit rows every
// other S.S. screen reads — no separate summary table, nothing cached.
export async function superStockistDashboardSummary(prisma: PrismaClient, actorId: string, superStockistId: string, now = new Date()) {
  await authorize(prisma, { actorId, permission: "super_stockist_orders:view" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  // PERFORMANCE: partyOutstanding below only needs superStockistId/now, not any of these query
  // results — folding it into this same Promise.all removes a full extra sequential round trip
  // from every S.S. Dashboard load.
  const [waitingOrders, dispatchReadyOrders, incomingCompanyOrders, mappedDistributors, pendingCompanyOrders, stock, ownOutstanding] = await Promise.all([
    prisma.seeraSalesOrder.findMany({
      where: { sellerPartnerId: superStockistId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] } },
      include: { buyerPartner: { select: { legalName: true, tradeName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.seeraSalesOrder.findMany({
      where: { sellerPartnerId: superStockistId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["ACCEPTED", "PARTIAL_ACCEPTED", "ALLOCATED", "DISPATCH_READY"] } },
      include: { buyerPartner: { select: { legalName: true, tradeName: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: superStockistId, type: "COMPANY_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED"] } },
      orderBy: { dispatchedAt: "asc" },
      take: 50,
    }),
    prisma.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId, lifecycle: "ACTIVE" }, select: { id: true, legalName: true, tradeName: true } }),
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: superStockistId, type: "COMPANY_REPLENISHMENT", status: "SUBMITTED" },
      include: { paymentProofs: { orderBy: { submittedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    superStockistStockSummary(prisma, actorId, superStockistId),
    // Pre-launch Pass 0E: the S.S. dashboard already surfaced its own COMPANY_REPLENISHMENT orders
    // waiting on advance proof/verification (paymentMissingProof/paymentAwaitingVerification below),
    // but never its own OVERDUE position against Company once an invoice is actually issued and past
    // due — a real gap, since a S.S. could be overdue to Company with no visible signal on its own
    // dashboard. Reuses the same partyOutstanding() ageing logic Accounts/Founder already rely on.
    partyOutstanding(prisma, "SUPER_STOCKIST", superStockistId, now).catch(() => ({ outstanding: [], outstandingTotal: 0 })),
  ]);
  const { outstanding: ownOutstandingDocs, outstandingTotal: ownOutstandingTotal } = ownOutstanding;
  const ownOverdueToCompany = ownOutstandingDocs.filter((o) => o.actualOverdue).reduce((s, o) => s + o.amount, 0);
  const creditAlerts = (
    await Promise.all(
      mappedDistributors.map(async (d) => {
        const position = await creditPositionFor(prisma, d.id, now).catch(() => null);
        return position ? { distributorId: d.id, name: d.tradeName ?? d.legalName, position } : null;
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => Boolean(x) && ["BLOCK", "HOLD", "OVERRIDE_REQUIRED"].includes(x!.position.decision?.decision ?? ""));
  const overdueDistributors = creditAlerts.length;
  const lowStock = stock.filter((s) => s.available <= 0);
  const paymentAwaitingVerification = pendingCompanyOrders.filter((o) => o.paymentProofs[0] && ["SUBMITTED", "UNDER_REVIEW"].includes(o.paymentProofs[0].status));
  const paymentMissingProof = pendingCompanyOrders.filter((o) => !o.paymentProofs.length);
  const attention: { code: string; title: string; deepLink: string }[] = [];
  if (waitingOrders.length) attention.push({ code: "ORDERS_WAITING", title: `${waitingOrders.length} Distributor order(s) waiting for decision`, deepLink: "distributor-orders" });
  if (dispatchReadyOrders.length) attention.push({ code: "DISPATCH_READY", title: `${dispatchReadyOrders.length} accepted order(s) ready for dispatch`, deepLink: "dispatch" });
  if (overdueDistributors) attention.push({ code: "CREDIT_ALERT", title: `${overdueDistributors} Distributor(s) over credit limit or overdue`, deepLink: "credit" });
  if (incomingCompanyOrders.length) attention.push({ code: "INCOMING_COMPANY", title: `${incomingCompanyOrders.length} incoming Company consignment(s) waiting for receipt`, deepLink: "receipts" });
  if (lowStock.length) attention.push({ code: "LOW_STOCK", title: `${lowStock.length} product(s) out of stock`, deepLink: "inventory" });
  if (paymentMissingProof.length) attention.push({ code: "PAYMENT_PROOF_MISSING", title: `${paymentMissingProof.length} Company order(s) waiting for advance payment proof`, deepLink: "company-orders" });
  if (paymentAwaitingVerification.length) attention.push({ code: "PAYMENT_PENDING_VERIFICATION", title: `${paymentAwaitingVerification.length} payment proof(s) waiting for Accounts verification`, deepLink: "company-orders" });
  if (ownOverdueToCompany > 0) attention.push({ code: "OWN_OVERDUE_TO_COMPANY", title: `₹${ownOverdueToCompany.toLocaleString("en-IN")} overdue from you to Company`, deepLink: "outstanding" });
  return {
    cards: {
      distributorOrdersWaiting: waitingOrders.length,
      dispatchPending: dispatchReadyOrders.length,
      incomingFromCompany: incomingCompanyOrders.length,
      lowStock: lowStock.length,
      creditAlerts: overdueDistributors,
      companyOrdersAwaitingPayment: paymentMissingProof.length + paymentAwaitingVerification.length,
      ownOverdueToCompany,
    },
    attention,
    waitingOrders: waitingOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, distributor: o.buyerPartner?.tradeName ?? o.buyerPartner?.legalName ?? "Distributor", total: Number(o.total), placedAt: o.createdAt })),
  };
}

// Founder decision (section 10): once the S.S. dispatches to a Distributor, it must be able to see
// what actually happened next — DISPATCHED / RECEIVED / RECEIVED SHORT / DISPUTED — without ever
// overwriting the Distributor's own receipt truth. There is no separate order-level "received"
// status column; this derives a display status from the same canonical rows the Distributor's
// receiveIncomingOrder writes (IncomingReceipt inventory movements + the auto-raised
// SHORT_DELIVERY claim on shortfall), so it can never disagree with what the Distributor recorded.
export async function distributorReceiptStatus(prisma: PrismaClient, actorId: string, superStockistId: string, take = 50) {
  await authorize(prisma, { actorId, permission: "super_stockist_orders:view" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const orders = await prisma.seeraSalesOrder.findMany({
    where: { sellerPartnerId: superStockistId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"] } },
    include: { lines: true, buyerPartner: { select: { legalName: true, tradeName: true } } },
    orderBy: { dispatchedAt: "desc" },
    take,
  });
  if (!orders.length) return [];
  const orderIds = orders.map((o) => o.id);
  const [received, claims] = await Promise.all([
    prisma.seeraInventoryMovement.groupBy({
      by: ["sourceId"],
      where: { partyType: "DISTRIBUTOR", sourceType: "IncomingReceipt", direction: "IN", sourceId: { in: orderIds } },
      _sum: { quantity: true },
    }),
    prisma.seeraClaim.findMany({
      where: { type: "SHORT_DELIVERY", sourceType: "SeeraSalesOrder", sourceId: { in: orderIds } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const receivedTotal = (orderId: string) => Number(received.find((r) => r.sourceId === orderId)?._sum.quantity ?? 0);
  const claimFor = (orderId: string) => claims.find((c) => c.sourceId === orderId);
  return orders.map((order) => {
    // STAGE 12: each line's dispatchedQuantity stays in its own commercial unit (e.g. Boxes) — must
    // convert to canonical pieces per line before summing, to compare correctly against receivedQty
    // (the physical stock ledger, always pieces post-Stage-12 conversion).
    const dispatchedTotal = order.lines.reduce((sum, l) => sum + wholesaleOrderUnitToCanonicalPieces(l.skuCodeSnapshot, Number(l.dispatchedQuantity)), 0);
    const receivedQty = receivedTotal(order.id);
    const claim = claimFor(order.id);
    const status: "DISPATCHED" | "RECEIVED" | "RECEIVED_SHORT" | "DISPUTED" =
      receivedQty <= 0
        ? "DISPATCHED"
        : claim && claim.status === "REJECTED"
          ? "DISPUTED"
          : receivedQty < dispatchedTotal && claim && !["RESOLVED", "CANCELLED"].includes(claim.status)
            ? "RECEIVED_SHORT"
            : "RECEIVED";
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      distributor: order.buyerPartner?.tradeName ?? order.buyerPartner?.legalName ?? "Distributor",
      dispatchedAt: order.dispatchedAt,
      dispatchedTotal,
      receivedTotal: receivedQty,
      status,
      claimId: claim?.id ?? null,
    };
  });
}
