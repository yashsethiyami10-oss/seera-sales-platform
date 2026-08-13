import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { recordInventoryMovement, placeRetailerOrder, fulfilRetailerOrder, allocateOrderStock, dispatchAllocatedOrder } from "../../lib/sales-distribution/workflow-service";

// Lightweight, isolated Stage 12 proof: dispatchAllocatedOrder's RETAILER_ORDER branch
// (multiplier=1, a pure no-op pass-through identical to pre-Stage-12-fix behavior) — seeds
// Distributor stock directly via recordInventoryMovement (one fast query) rather than going
// through the heavy Company->S.S.->Distributor wholesale chain, to sidestep the current Neon
// transaction-timeout flakiness seen on the heavier full-chain proof.

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
const db = new PrismaClient({ datasourceUrl: test });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id } });

  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 20, sourceType: "SmokeTestOpening", sourceId: `s12-noop-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 12 retail-dispatch no-op proof opening stock", idempotencyKey: `s12-noop-opening-${suffix}` });
  console.log("[SETUP] OK — Distributor opened with 20 physical pieces of Cake Blue");

  const retailOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s12-noop-ro-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 7, rate: 12 }] },
  );
  await fulfilRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: retailOrder.id, accepted: [{ lineId: retailOrder.lines[0]!.id, quantity: 7 }], action: "ACCEPT" });
  await allocateOrderStock(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, lines: [{ lineId: retailOrder.lines[0]!.id, quantity: 7 }], idempotencyKey: `s12-noop-alloc-${suffix}` });
  await dispatchAllocatedOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, idempotencyKey: `s12-noop-dispatch-${suffix}` });
  console.log("[STEP] OK — retail order (7 individual pieces) allocated and dispatched");

  const outSum = await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: retailOrder.id, direction: "OUT" }, _sum: { quantity: true } });
  assert(Number(outSum._sum.quantity) === 7, `expected exactly 7 physical pieces OUT for this RETAILER_ORDER dispatch (no wholesale conversion applied — multiplier must be 1 for a RETAILER_ORDER line), got ${outSum._sum.quantity}`);
  console.log(`[RESULT] OK — dispatchAllocatedOrder's RETAILER_ORDER branch correctly moved exactly 7 physical pieces (not 7 x 40 = 280) — confirms the wholesale conversion is NEVER applied to a retail line.`);

  console.log("\nALL STAGE 12 RETAIL-DISPATCH NO-OP PROOF CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
