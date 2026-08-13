import type { DeliveryStatus, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";
import { inventoryPosition } from "./business-rules";
import {
  fulfilRetailerOrder,
  allocateOrderStock,
  dispatchAllocatedOrder,
  fulfilRemainingOrderQuantity,
  closeRemainingOrderQuantity,
} from "./workflow-service";
import { completeDelivery } from "./delivery-service";
import { creditPositionFor } from "./credit-service";
import { wholesaleOrderUnitToCanonicalPieces } from "./company-order-catalog";

// Distributor Easy Mode (Founder decision): the Distributor presses ACCEPT/PARTIAL/REJECT and,
// later, a delivery outcome — nothing else. Every function below is a thin ORCHESTRATION layer
// over the existing, unmodified, enterprise-grade functions (fulfilRetailerOrder/allocateOrderStock/
// dispatchAllocatedOrder/fulfilRemainingOrderQuantity/closeRemainingOrderQuantity/completeDelivery)
// — no business rule, audit trail, idempotency key, or stock-ledger behavior is reimplemented or
// weakened here. This file only removes the requirement that a human click through each step on a
// separate screen.

// Shown on the order card BEFORE the Distributor decides, so "Ordered 10 / Available 6" is known
// up front rather than discovered as a failure after pressing Accept.
export async function retailerOrderLineAvailability(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  orderId: string,
) {
  await authorize(prisma, { actorId, permission: "distributor_orders:fulfil" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  const order = await prisma.seeraSalesOrder.findFirst({
    where: { id: orderId, sellerPartnerId: distributorId, type: "RETAILER_ORDER" },
    include: { lines: true },
  });
  if (!order) throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED", "Order unavailable", 403);
  return Promise.all(
    order.lines.map(async (line) => {
      const movements = await prisma.seeraInventoryMovement.findMany({
        where: { partyType: "DISTRIBUTOR", partyId: distributorId, skuId: line.skuId },
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

// ACCEPT / PARTIAL collapse decide -> reserve -> dispatch into one call. `lines` must carry the
// quantity the Distributor is committing to for EACH line right now (full ordered qty for a plain
// ACCEPT, a capped qty per line for PARTIAL) — the UI is expected to have already shown Available
// so this should not normally hit a stock shortfall; if it still does (a race), the order is left
// correctly ACCEPTED-but-not-allocated and this same action is safely retryable.
export async function acceptAndPrepareRetailerOrder(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
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
    const order = await fulfilRetailerOrder(prisma, actorId, distributorId, {
      orderId: input.orderId,
      accepted: [],
      action: "REJECT",
      reason: input.reason,
    });
    return { order, delivery: null };
  }
  const order = await fulfilRetailerOrder(prisma, actorId, distributorId, {
    orderId: input.orderId,
    accepted: input.lines,
    action: input.decision,
    reason: input.reason,
  });
  const allocated = await allocateOrderStock(prisma, actorId, {
    partyType: "DISTRIBUTOR",
    partyId: distributorId,
    orderId: input.orderId,
    lines: input.lines,
    idempotencyKey: `${input.idempotencyKey}-alloc`,
  });
  const delivery = await dispatchAllocatedOrder(prisma, actorId, {
    partyType: "DISTRIBUTOR",
    partyId: distributorId,
    orderId: input.orderId,
    idempotencyKey: `${input.idempotencyKey}-dispatch`,
  });
  return { order: allocated, delivery };
}

// "DELIVER REMAINING" (section 7) — fulfils the next slice of a partial order's unaccepted balance
// and immediately reserves + dispatches it too, producing a new Delivery for that slice. Ordered/
// already-delivered totals are never rewritten; this only ever adds to what's outstanding.
export async function deliverRemainingRetailerOrder(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: { orderId: string; lines: { lineId: string; quantity: number }[]; reason?: string; idempotencyKey: string },
) {
  await fulfilRemainingOrderQuantity(prisma, actorId, {
    partyType: "DISTRIBUTOR",
    partyId: distributorId,
    orderId: input.orderId,
    lines: input.lines,
    reason: input.reason,
  });
  // allocateOrderStock sets (not increments) allocatedQuantity per line, so the request here must
  // be each line's full cumulative acceptedQuantity-to-date, not just this round's delta — the
  // function itself derives the correct dispatch-delta from allocated-minus-already-dispatched.
  const refreshed = await prisma.seeraSalesOrder.findUniqueOrThrow({ where: { id: input.orderId }, include: { lines: true } });
  const allocated = await allocateOrderStock(prisma, actorId, {
    partyType: "DISTRIBUTOR",
    partyId: distributorId,
    orderId: input.orderId,
    lines: refreshed.lines.map((l) => ({ lineId: l.id, quantity: Number(l.acceptedQuantity) })),
    idempotencyKey: `${input.idempotencyKey}-alloc`,
  });
  const delivery = await dispatchAllocatedOrder(prisma, actorId, {
    partyType: "DISTRIBUTOR",
    partyId: distributorId,
    orderId: input.orderId,
    idempotencyKey: `${input.idempotencyKey}-dispatch`,
  });
  return { order: allocated, delivery };
}

export async function closeRemainingRetailerOrder(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: { orderId: string; reason: string },
) {
  return closeRemainingOrderQuantity(prisma, actorId, { partyType: "DISTRIBUTOR", partyId: distributorId, orderId: input.orderId, reason: input.reason });
}

// Plain-language delivery outcomes (section 8) mapped onto the existing governed DeliveryStatus
// enum — the Distributor never sees the backend's internal status names.
const EASY_DELIVERY_OUTCOMES: Record<string, DeliveryStatus> = {
  DELIVERED: "DELIVERED",
  PARTIALLY_DELIVERED: "PARTIAL_DELIVERED",
  NOT_DELIVERED: "RESCHEDULED",
  REFUSED: "REFUSED",
  UNABLE_TO_DELIVER: "OTHER",
  DELIVER_LATER: "RESCHEDULED",
};

// Simple Stock page (section 8): PRODUCT / AVAILABLE / RESERVED / INCOMING / PHYSICAL, one row per
// active SKU. "Available"/"Reserved" reuse the same inventoryPosition() ledger math as every other
// stock screen in the app — never a separate Distributor-only calculation. "Incoming" is the
// dispatched-but-not-yet-receipted balance of DISTRIBUTOR_REPLENISHMENT orders, the same
// dispatched-minus-received math the existing Incoming Stock screen (OperationalWorkspace.tsx) uses.
// "Physical" is the most recent APPROVED reconciliation's physicalClosing for that SKU, or null if
// this SKU has never been reconciled — never fabricated as zero.
export async function distributorStockSummary(prisma: PrismaClient, actorId: string, distributorId: string) {
  await authorize(prisma, { actorId, permission: "distributor_inventory:adjust" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  const [skus, movements, incomingOrders, receivedMovements, latestReconciliation] = await Promise.all([
    prisma.seeraSku.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true, productName: true, brand: true, packSize: true, unitType: true },
      orderBy: [{ brand: "asc" }, { productName: "asc" }],
    }),
    prisma.seeraInventoryMovement.findMany({
      where: { partyType: "DISTRIBUTOR", partyId: distributorId },
      select: { skuId: true, direction: true, quantity: true },
    }),
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: distributorId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED"] } },
      include: { lines: { select: { id: true, skuId: true, skuCodeSnapshot: true, dispatchedQuantity: true } } },
    }),
    prisma.seeraInventoryMovement.groupBy({
      by: ["sourceId", "skuId"],
      where: { partyType: "DISTRIBUTOR", partyId: distributorId, sourceType: "IncomingReceipt", direction: "IN" },
      _sum: { quantity: true },
    }),
    prisma.seeraStockReconciliation.findFirst({
      where: { partyType: "DISTRIBUTOR", partyId: distributorId, status: "APPROVED" },
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

// Actionable Dashboard (Founder section 16): six cards plus a deep-linkable "what needs your
// attention today" list, all computed directly off the same canonical rows every other Distributor
// screen reads — no separate summary table.
export async function distributorDashboardSummary(prisma: PrismaClient, actorId: string, distributorId: string, now = new Date()) {
  await authorize(prisma, { actorId, permission: "distributor_orders:view" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  const [newOrders, pendingDeliveries, incomingSsOrders, ssOrdersRequested, position, stock] = await Promise.all([
    prisma.seeraSalesOrder.findMany({
      where: { sellerPartnerId: distributorId, type: "RETAILER_ORDER", status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] } },
      include: { retailer: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.seeraDelivery.findMany({
      where: { status: { in: ["PENDING", "RESCHEDULED"] }, order: { sellerPartnerId: distributorId, type: "RETAILER_ORDER" } },
      select: { id: true },
    }),
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: distributorId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED"] } },
      select: { id: true },
    }),
    prisma.seeraSalesOrder.count({
      where: { buyerPartnerId: distributorId, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] } },
    }),
    creditPositionFor(prisma, distributorId, now).catch(() => null),
    distributorStockSummary(prisma, actorId, distributorId).catch(() => []),
  ]);
  const lowStock = stock.filter((s) => s.available <= 0);
  const creditBlocked = position?.decision ? ["BLOCK", "HOLD", "OVERRIDE_REQUIRED"].includes(position.decision.decision) : false;
  const attention: { code: string; title: string; deepLink: string }[] = [];
  if (newOrders.length) attention.push({ code: "ORDERS_WAITING", title: `${newOrders.length} retailer order(s) waiting for decision`, deepLink: "fulfilment" });
  if (pendingDeliveries.length) attention.push({ code: "DELIVERIES_PENDING", title: `${pendingDeliveries.length} delivery(ies) pending`, deepLink: "fulfilment" });
  if (lowStock.length) attention.push({ code: "LOW_STOCK", title: `${lowStock.length} product(s) out of stock`, deepLink: "inventory" });
  if (incomingSsOrders.length) attention.push({ code: "INCOMING_STOCK", title: `${incomingSsOrders.length} incoming S.S. consignment(s) waiting for receipt`, deepLink: "incoming-stock" });
  if (creditBlocked) attention.push({ code: "CREDIT_ALERT", title: `Your account is on a credit hold (${position?.decision?.decision})`, deepLink: "credit" });
  else if (position && position.overdue > 0) attention.push({ code: "OVERDUE", title: `₹${position.overdue.toLocaleString("en-IN")} overdue`, deepLink: "outstanding" });
  // Final UI reachability audit fix: a payment Accounts already verified had no in-app signal for
  // the Distributor at all — surfaced here only while the receipt is still outstanding (once issued
  // it's visible on the Money screen itself with no ongoing action needed, see DistributorMoneyPanel).
  const latestPayment = await prisma.seeraPaymentRecord.findFirst({
    where: { payerType: "DISTRIBUTOR", payerId: distributorId },
    orderBy: { paymentDate: "desc" },
  });
  if (latestPayment && (["VERIFIED", "PARTIALLY_MATCHED"] as string[]).includes(latestPayment.status)) {
    const receipt = await prisma.seeraCommercialDocument.findFirst({ where: { idempotencyKey: `receipt-${latestPayment.id}` }, select: { id: true } });
    if (!receipt)
      attention.push({ code: "PAYMENT_VERIFIED_AWAITING_RECEIPT", title: `Your payment of ₹${Number(latestPayment.amountClaimed).toLocaleString("en-IN")} was verified — receipt pending`, deepLink: "credit" });
  }
  return {
    cards: {
      newOrders: newOrders.length,
      pendingDeliveries: pendingDeliveries.length,
      stockAlerts: lowStock.length,
      incomingStock: incomingSsOrders.length,
      outstanding: position?.outstanding ?? 0,
      ssOrdersRequested,
    },
    attention,
    newOrdersList: newOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, retailer: o.retailer?.businessName ?? "Retailer", total: Number(o.total), placedAt: o.createdAt })),
  };
}

export async function recordEasyDeliveryOutcome(
  prisma: PrismaClient,
  actorId: string,
  input: {
    deliveryId: string;
    outcome: keyof typeof EASY_DELIVERY_OUTCOMES;
    lines: { lineId: string; quantity: number }[];
    reason?: string;
    receiverName?: string;
    proof?: Record<string, unknown>;
  },
) {
  const status = EASY_DELIVERY_OUTCOMES[input.outcome];
  if (!status) throw new FoundationError("INVALID_DELIVERY_OUTCOME", "Unknown delivery outcome", 400);
  return completeDelivery(prisma, actorId, input.deliveryId, {
    status,
    lines: input.lines,
    receiverName: input.receiverName,
    reason: input.reason,
    proof: input.proof,
  });
}
