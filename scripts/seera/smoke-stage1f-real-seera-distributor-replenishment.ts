import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  createDistributorReplenishment,
  fulfilDistributorReplenishment,
  allocateOrderStock,
  dispatchAllocatedOrder,
  receiveIncomingOrder,
  recordInventoryMovement,
} from "../../lib/sales-distribution/workflow-service";

// STAGE 1F smoke test — proves the RUN 2B-flagged gap is closed: a REAL Seera catalog SKU (not a
// test-only fixture) can now go through the full Distributor replenishment happy path, because
// seed-ss-to-distributor-price-list.ts has populated a real, governed SS_TO_DISTRIBUTOR price for
// every one of the 9 real Seera SKUs (₹315 fixed for cakes, base+8% for powder/Bartan).
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
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });

  // ============= Cake SKU: fixed ₹315 =============
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const cakePrice = await db.seeraPriceVersion.findFirstOrThrow({ where: { skuId: cakeSku.id, tier: "SS_TO_DISTRIBUTOR", status: "ACTIVE" } });
  assert(Number(cakePrice.amount) === 315, `expected Seera Cake Blue S.S.->Distributor rate to be exactly ₹315, got ${cakePrice.amount}`);
  assert(cakePrice.marginType === "FIXED", "expected cake pricing policy to be recorded as FIXED, not a hardcoded arithmetic expression");

  // STAGE 12: recordInventoryMovement's quantity is always canonical physical PIECES (it's the
  // manual/exception-only ledger entry point, never the commercial order unit) — a 4-Box order below
  // needs 4x40=160 physical pieces to allocate successfully post-Stage-12-fix, so opening stock must
  // be a genuine physical-piece quantity comfortably covering that, not an incidentally-larger raw
  // number that only happened to clear the pre-fix (unconverted) comparison.
  await recordInventoryMovement(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 200, sourceType: "SmokeTestOpening", sourceId: `s1f-cake-opening-${suffix}`, sourcePortal: "super-stockist", reason: "Stage 1F smoke opening stock", idempotencyKey: `s1f-cake-opening-${suffix}` });

  const cakeOrder = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `s1f-cake-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 4 }] });
  assert(Number(cakeOrder.total) === 1260, `expected 4 x ₹315 = ₹1260 for a REAL Seera catalog SKU (not a test fixture), got ${cakeOrder.total}`);
  console.log(`[F1] OK — REAL Seera Cake Blue Distributor replenishment order created (${cakeOrder.orderNumber}), total ₹${cakeOrder.total} (4 x governed ₹315), closing the RUN 2B-flagged gap`);

  const acceptedCake = await fulfilDistributorReplenishment(db, ss1Owner.id, ss1.id, { orderId: cakeOrder.id, accepted: [{ lineId: cakeOrder.lines[0]!.id, quantity: 4 }], action: "ACCEPT" });
  await allocateOrderStock(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: acceptedCake.id, lines: [{ lineId: cakeOrder.lines[0]!.id, quantity: 4 }], idempotencyKey: `s1f-cake-allocate-${suffix}` });
  await dispatchAllocatedOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: cakeOrder.id, idempotencyKey: `s1f-cake-dispatch-${suffix}`, vehicleNumber: "MH-04-GH-1111" });
  const cakeReceipt = await receiveIncomingOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: cakeOrder.id, lines: [{ lineId: cakeOrder.lines[0]!.id, quantity: 4 }], idempotencyKey: `s1f-cake-receive-${suffix}` });
  assert(cakeReceipt.shortages.length === 0, "expected full receipt with no shortage");
  const distIn = await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: cakeOrder.id, direction: "IN" }, _sum: { quantity: true } });
  // STAGE 12: the physical ledger now holds canonical PIECES (4 Boxes x 40 pcs/Box = 160), not the
  // raw commercial order-unit count — order.lines[0].dispatchedQuantity (order-unit bookkeeping)
  // still correctly reads "4", untouched; only the SeeraInventoryMovement quantity is converted.
  assert(Number(distIn._sum.quantity) === 160, `expected Distributor to have received 160 physical pieces (4 Boxes x 40) of real Seera Cake Blue, got ${distIn._sum.quantity}`);
  console.log("[F2] OK — REAL Seera Cake Blue: full Accept -> Allocate -> Dispatch -> Receive happy path complete, Distributor physical stock correctly increased by 160 pieces (4 Boxes)");

  // ============= Powder SKU: base + 8% markup =============
  const powderSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-POWDER-1KG" } });
  const powderBase = await db.seeraPriceVersion.findFirstOrThrow({ where: { skuId: powderSku.id, tier: "COMPANY_TO_SS", status: "ACTIVE" } });
  const powderDistPrice = await db.seeraPriceVersion.findFirstOrThrow({ where: { skuId: powderSku.id, tier: "SS_TO_DISTRIBUTOR", status: "ACTIVE" } });
  const expectedPowderRate = Math.round(Number(powderBase.amount) * 1.08 * 100) / 100;
  assert(Number(powderDistPrice.amount) === expectedPowderRate, `expected Seera Powder 1kg S.S.->Distributor rate to be base(₹${powderBase.amount}) + 8% = ₹${expectedPowderRate}, got ${powderDistPrice.amount}`);
  assert(powderDistPrice.marginType === "PERCENTAGE" && Number(powderDistPrice.marginValue) === 8, "expected powder pricing policy to be recorded as PERCENTAGE 8, an editable policy — not hardcoded arithmetic in workflow logic");
  console.log(`[F3] OK — REAL Seera Powder 1kg: S.S.->Distributor rate = base ₹${powderBase.amount} + 8% = ₹${powderDistPrice.amount}, recorded as an editable PERCENTAGE policy (Founder can change 8 -> another number later without a code change)`);

  console.log("\nALL STAGE 1F REAL-CATALOG SEERA DISTRIBUTOR REPLENISHMENT SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
