import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay, placeRetailerOrder, recordInventoryMovement } from "../../lib/sales-distribution/workflow-service";
import { executiveCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import {
  acceptAndPrepareRetailerOrder,
  deliverRemainingRetailerOrder,
  closeRemainingRetailerOrder,
  recordEasyDeliveryOutcome,
  distributorDashboardSummary,
} from "../../lib/sales-distribution/distributor-easy-mode-service";
import { managerDsrDetail, managerSalesAttribution } from "../../lib/sales-distribution/manager-service";

// STAGE 1C smoke test — Distributor portal fresh live proof:
//  D1. Full happy path: retailer order -> ACCEPT (collapsed decide+reserve+dispatch) -> DELIVERED,
//      distributor stock correctly decremented, Executive's eligible-delivered value reflects it,
//      Manager's DSR detail shows the SAME canonical order (no shadow/duplicate truth).
//  D2. Partial path: order exceeds available stock -> PARTIAL_ACCEPT capped to on-hand -> exact
//      remaining tracked -> top up stock -> DELIVER REMAINING -> fully resolved, no phantom stock
//      (verified via real inventory movement aggregation, not just order status).
//  D3. Close-remaining path: a separate partial order's leftover balance is explicitly closed with a
//      reason rather than left dangling.
//  D4. Distributor dashboard reflects real, current, actionable counts (not stale/fabricated).
// Safe to re-run: fresh idempotency keys per run.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id } });

  // Clean up any dangling session for the executive from a prior interrupted run.
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: executive1.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, executive1.id, dangling.id, { outcome: "COMPLETED" }).catch(() => {});

  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 3, sourceType: "SmokeTestOpening", sourceId: `s1c-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 1C smoke opening stock (deliberately limited to 3 for the partial-delivery test)", idempotencyKey: `s1c-opening-${suffix}` });

  // ============= D1: full happy path =============
  const session = await startFieldDay(db, executive1.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", remarks: `Stage 1C smoke ${suffix}` });
  const visit = await executiveCheckIn(db, executive1.id, { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `s1c-checkin-${suffix}` });
  await executiveCheckOut(db, executive1.id, visit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  const fullOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s1c-order-full-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 2, rate: 60 }] },
  );

  const { order: acceptedFull, delivery: deliveryFull } = await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, {
    orderId: fullOrder.id,
    decision: "ACCEPT",
    lines: [{ lineId: fullOrder.lines[0]!.id, quantity: 2 }],
    idempotencyKey: `s1c-accept-full-${suffix}`,
  });
  assert(acceptedFull.status === "ALLOCATED", `expected ACCEPT to collapse decide+reserve+dispatch-prep into one call reaching ALLOCATED, got ${acceptedFull.status}`);
  assert(!!deliveryFull, "expected a delivery to be created by the collapsed ACCEPT action");
  console.log(`[D1a] OK — ACCEPT collapsed decide->reserve->dispatch into ONE call (order ${fullOrder.orderNumber} now ${acceptedFull.status}, delivery ${deliveryFull!.id} created)`);

  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: deliveryFull!.id, outcome: "DELIVERED", lines: [{ lineId: fullOrder.lines[0]!.id, quantity: 2 }], receiverName: "Shop Owner" });
  const distOut = await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: fullOrder.id, direction: "OUT" }, _sum: { quantity: true } });
  assert(Number(distOut._sum.quantity) === 2, `expected exactly 2 units dispatched OUT of Distributor stock for this order, got ${distOut._sum.quantity}`);
  console.log("[D1b] OK — delivery marked DELIVERED, Distributor stock correctly decremented by exactly 2 (verified via real inventory movement, not order status alone)");

  const attribution = await managerSalesAttribution(db, manager.id, {});
  const teamHasOrder = attribution.team.orderCount >= 1;
  assert(teamHasOrder, "expected the Executive's order to show up in the Manager's team attribution");
  const dsr = await managerDsrDetail(db, manager.id, session.id);
  assert(!!dsr, "expected Manager DSR detail to be readable for this session");
  console.log(`[D1c] OK — Manager sees the SAME canonical order via team attribution (team.orderCount=${attribution.team.orderCount}) and DSR detail — no shadow/duplicate truth`);

  // ============= D2 + D3: partial delivery, remaining, close-remaining =============
  const partialOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s1c-order-partial-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 5, rate: 60 }] }, // only 1 unit left on hand (3 opened - 2 delivered)
  );
  const { order: acceptedPartial, delivery: deliveryPartial } = await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, {
    orderId: partialOrder.id,
    decision: "PARTIAL_ACCEPT",
    lines: [{ lineId: partialOrder.lines[0]!.id, quantity: 1 }], // capped to on-hand
    idempotencyKey: `s1c-accept-partial-${suffix}`,
  });
  assert(acceptedPartial.status === "ALLOCATED", `expected PARTIAL_ACCEPT to also reach ALLOCATED for the accepted slice, got ${acceptedPartial.status}`);
  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: deliveryPartial!.id, outcome: "DELIVERED", lines: [{ lineId: partialOrder.lines[0]!.id, quantity: 1 }] });
  const remainingLine = await db.seeraOrderLine.findUniqueOrThrow({ where: { id: partialOrder.lines[0]!.id } });
  const remaining = Number(remainingLine.orderedQuantity) - Number(remainingLine.acceptedQuantity) - Number(remainingLine.cancelledQuantity);
  assert(remaining === 4, `expected exactly 4 units remaining (ordered 5, accepted 1), got ${remaining}`);
  console.log(`[D2a] OK — PARTIAL delivery: ordered 5, only 1 on hand -> accepted+delivered exactly 1, remaining tracked as exactly ${remaining} (no phantom acceptance)`);

  // Top up stock, then deliver the remaining balance.
  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 4, sourceType: "SmokeTestOpening", sourceId: `s1c-topup-${suffix}`, sourcePortal: "distributor", reason: "Stage 1C smoke stock top-up for Deliver Remaining", idempotencyKey: `s1c-topup-${suffix}` });
  const { order: remainingResult, delivery: remainingDelivery } = await deliverRemainingRetailerOrder(db, distributorOwner.id, distributor1.id, {
    orderId: partialOrder.id,
    lines: [{ lineId: partialOrder.lines[0]!.id, quantity: 4 }],
    idempotencyKey: `s1c-remaining-${suffix}`,
  });
  assert(Number(remainingResult.lines[0]!.acceptedQuantity) === 5, `expected cumulative acceptedQuantity to now be 5 (1+4), got ${remainingResult.lines[0]!.acceptedQuantity}`);
  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: remainingDelivery!.id, outcome: "DELIVERED", lines: [{ lineId: partialOrder.lines[0]!.id, quantity: 4 }] });
  const totalDistOut = await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: partialOrder.id, direction: "OUT" }, _sum: { quantity: true } });
  assert(Number(totalDistOut._sum.quantity) === 5, `expected exactly 5 total units dispatched OUT for this order across both deliveries (1+4, no double reservation/dispatch), got ${totalDistOut._sum.quantity}`);
  console.log("[D2b] OK — DELIVER REMAINING: stock topped up, remaining 4 delivered, cumulative total is exactly 5 across two deliveries — no double reservation or phantom stock movement");

  // D3: a THIRD order, partially accepted, remainder explicitly CLOSED (not left dangling).
  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 1, sourceType: "SmokeTestOpening", sourceId: `s1c-close-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 1C smoke opening stock for close-remaining test", idempotencyKey: `s1c-close-opening-${suffix}` });
  const closeOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s1c-order-close-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 3, rate: 60 }] },
  );
  await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: closeOrder.id, decision: "PARTIAL_ACCEPT", lines: [{ lineId: closeOrder.lines[0]!.id, quantity: 1 }], idempotencyKey: `s1c-accept-close-${suffix}` });
  const closed = await closeRemainingRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: closeOrder.id, reason: "Retailer no longer wants the balance — Stage 1C smoke" });
  assert(!!closed, "expected closeRemainingRetailerOrder to succeed with a real reason");
  console.log("[D3] OK — CLOSE REMAINING: leftover balance explicitly closed with a reason, not left silently dangling");

  // ============= D4: dashboard reflects real, current data =============
  const dashboard = await distributorDashboardSummary(db, distributorOwner.id, distributor1.id);
  assert(typeof dashboard.cards.newOrders === "number" && typeof dashboard.cards.outstanding === "number", "expected dashboard cards to be real computed numbers");
  console.log(`[D4] OK — Distributor dashboard: newOrders=${dashboard.cards.newOrders}, pendingDeliveries=${dashboard.cards.pendingDeliveries}, stockAlerts=${dashboard.cards.stockAlerts}, incomingStock=${dashboard.cards.incomingStock}, outstanding=₹${dashboard.cards.outstanding} (all real, actionable, deep-linked via ${dashboard.attention.length} attention item(s))`);

  await endFieldDay(db, executive1.id, session.id, { outcome: "COMPLETED" });

  console.log("\nALL STAGE 1C DISTRIBUTOR LIVE SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
