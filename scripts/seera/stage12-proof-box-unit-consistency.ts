import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  createCompanyOrder,
  dispatchCompanyOrder,
  receiveIncomingOrder,
  createDistributorReplenishment,
  allocateOrderStock,
  dispatchAllocatedOrder,
  placeRetailerOrder,
  fulfilRetailerOrder,
} from "../../lib/sales-distribution/workflow-service";
import { acceptAndAllocateDistributorOrder } from "../../lib/sales-distribution/super-stockist-easy-mode-service";
import { submitPaymentProof, reviewPaymentProof } from "../../lib/sales-distribution/operational-service";

// STAGE 12 proof: a Distributor who received Cake Blue in BOX units (S.S.->Distributor
// priced/quantified at 1 unit = 1 Box = 40 pcs) must have the correct PHYSICAL piece quantity
// available when a Retailer order for a PIECE quantity is allocated against the same ledger. This
// script originally proved the Pass 0F audit finding as a real defect (allocation for 50 pieces
// against 80 physical pieces failed with INSUFFICIENT_AVAILABLE_STOCK); now, after the STAGE 12
// fix (wholesaleOrderUnitToCanonicalPieces conversion boundary in company-order-catalog.ts, applied
// in receiveIncomingOrder/allocateOrderStock/dispatchAllocatedOrder), it asserts the corrected
// behavior end to end, including the final remaining-stock figure. Uses before/after DELTAS against
// the shared review-fixture S.S./Distributor/SKU (not absolute ledger sums), since this script is
// safe to re-run repeatedly and earlier runs leave real, permanent history on those same rows.

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

async function position(partyType: "SUPER_STOCKIST" | "DISTRIBUTOR", partyId: string, skuId: string) {
  const [inSum, outSum, reserveSum, releaseSum] = await Promise.all([
    db.seeraInventoryMovement.aggregate({ where: { partyType, partyId, skuId, direction: "IN" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.aggregate({ where: { partyType, partyId, skuId, direction: "OUT" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.aggregate({ where: { partyType, partyId, skuId, direction: "RESERVE" }, _sum: { quantity: true } }),
    db.seeraInventoryMovement.aggregate({ where: { partyType, partyId, skuId, direction: "RELEASE" }, _sum: { quantity: true } }),
  ]);
  const onHand = Number(inSum._sum.quantity ?? 0) - Number(outSum._sum.quantity ?? 0);
  const reserved = Number(reserveSum._sum.quantity ?? 0) - Number(releaseSum._sum.quantity ?? 0);
  return { onHand, reserved, available: onHand - reserved };
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const accountsManager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id } });

  console.log(`[SETUP] cakeSku.unitsPerCase (informational only) = ${cakeSku.unitsPerCase}`);
  const ssBefore = await position("SUPER_STOCKIST", ss1.id, cakeSku.id);
  const distBefore = await position("DISTRIBUTOR", distributor1.id, cakeSku.id);

  // ---- Company -> S.S.: 2 BOXES of Cake Blue (= 80 physical pieces) ----
  const co = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s12-co-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 2 }] });
  const proof = await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: co.id, amount: Number(co.total), reference: `UTR-S12-${suffix}`, idempotencyKey: `s12-co-proof-${suffix}` });
  await reviewPaymentProof(db, accountsManager.id, { proofId: proof.id, status: "VERIFIED", reason: "Stage 12 proof — full match" });
  await dispatchCompanyOrder(db, accountsManager.id, { orderId: co.id, idempotencyKey: `s12-co-dispatch-${suffix}`, vehicleNumber: "MH-04-S12-0001" });
  await receiveIncomingOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: co.id, lines: [{ lineId: co.lines[0]!.id, quantity: 2 }], idempotencyKey: `s12-co-receive-${suffix}` });
  const ssAfterReceipt = await position("SUPER_STOCKIST", ss1.id, cakeSku.id);
  assert(ssAfterReceipt.onHand - ssBefore.onHand === 80, `expected S.S. physical onHand to increase by 80 pieces (2 Boxes x 40) after receiving order quantity=2, got delta=${ssAfterReceipt.onHand - ssBefore.onHand}`);
  console.log(`[STEP 1] OK — S.S. received Company order for quantity=2 (2 Boxes). Physical onHand increased by 80 pieces (order bookkeeping, e.g. dispatchedQuantity, stays "2")`);

  // ---- S.S. -> Distributor: distributor orders "2" (S.S.->Distributor is also Box-priced ₹315/Box) ----
  const doOrder = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `s12-do-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 2 }] });
  assert(Number(doOrder.total) === 630, `expected 2 x Box rate 315 = 630, got ${doOrder.total}`);
  await acceptAndAllocateDistributorOrder(db, ss1Owner.id, ss1.id, { orderId: doOrder.id, decision: "ACCEPT", lines: [{ lineId: doOrder.lines[0]!.id, quantity: 2 }], idempotencyKey: `s12-do-accept-${suffix}` });
  await dispatchAllocatedOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: doOrder.id, idempotencyKey: `s12-do-dispatch-${suffix}` });
  await receiveIncomingOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: doOrder.id, lines: [{ lineId: doOrder.lines[0]!.id, quantity: 2 }], idempotencyKey: `s12-do-receive-${suffix}` });
  const distAfterReceipt = await position("DISTRIBUTOR", distributor1.id, cakeSku.id);
  const ssAfterDispatch = await position("SUPER_STOCKIST", ss1.id, cakeSku.id);
  assert(distAfterReceipt.onHand - distBefore.onHand === 80, `expected Distributor physical onHand to increase by 80 pieces (2 Boxes x 40) after receiving order quantity=2, got delta=${distAfterReceipt.onHand - distBefore.onHand}`);
  assert(ssAfterDispatch.onHand - ssAfterReceipt.onHand === -80, `expected S.S. physical onHand to DECREASE by 80 pieces after dispatching 2 Boxes to the Distributor, got delta=${ssAfterDispatch.onHand - ssAfterReceipt.onHand}`);
  console.log(`[STEP 2] OK — Distributor received S.S. replenishment for quantity=2 (2 Boxes): +80 pieces in, S.S. correspondingly -80 pieces out.`);

  // ---- Retailer orders 50 individual pieces (well within 80 physical pieces on hand) ----
  const distBeforeRetail = distAfterReceipt;
  const retailOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s12-ro-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 50, rate: 12 }] },
  );
  await fulfilRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: retailOrder.id, accepted: [{ lineId: retailOrder.lines[0]!.id, quantity: 50 }], action: "ACCEPT" });
  console.log(`[STEP 3] Retailer order placed for quantity=50 individual pieces (the Distributor physically has ${distBeforeRetail.onHand} pieces on hand). Attempting allocation...`);

  await allocateOrderStock(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, lines: [{ lineId: retailOrder.lines[0]!.id, quantity: 50 }], idempotencyKey: `s12-ro-alloc-${suffix}` });
  const distAfterAllocate = await position("DISTRIBUTOR", distributor1.id, cakeSku.id);
  assert(distAfterAllocate.reserved - distBeforeRetail.reserved === 50, `expected reserved to increase by 50 pieces after allocation, got delta=${distAfterAllocate.reserved - distBeforeRetail.reserved}`);
  console.log(`[STEP 3] OK — allocation of 50 pieces SUCCEEDED against ${distBeforeRetail.onHand} physical pieces on hand (previously failed with INSUFFICIENT_AVAILABLE_STOCK before the STAGE 12 fix).`);

  await dispatchAllocatedOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, idempotencyKey: `s12-ro-dispatch-${suffix}` });
  console.log(`[STEP 4] OK — retail dispatch (RELEASE + OUT of 50 pieces) completed.`);

  const distFinal = await position("DISTRIBUTOR", distributor1.id, cakeSku.id);
  assert(distFinal.onHand - distBeforeRetail.onHand === -50, `expected onHand to decrease by exactly 50 pieces, got delta=${distFinal.onHand - distBeforeRetail.onHand}`);
  assert(distFinal.reserved === distBeforeRetail.reserved, `expected reserved to return to its pre-retail-order baseline (RESERVE 50 fully cancelled by RELEASE 50 at dispatch), got ${distFinal.reserved} vs baseline ${distBeforeRetail.reserved}`);
  assert(distFinal.available - distBeforeRetail.available === -50, `expected available to decrease by exactly 50 pieces, got delta=${distFinal.available - distBeforeRetail.available}`);
  console.log(`[STEP 5] OK — final physical stock: onHand=${distFinal.onHand}, reserved=${distFinal.reserved}, available=${distFinal.available} (exactly 50 pieces fewer than before the retail order, e.g. 80 -> 30 on a fresh fixture).`);

  console.log("\nALL STAGE 12 BOX-UNIT-CONSISTENCY PROOF CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
