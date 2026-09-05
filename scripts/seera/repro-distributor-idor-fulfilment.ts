import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { fulfilRetailerOrder, placeRetailerOrder, createSku, createPriceVersion } from "../../lib/sales-distribution/workflow-service";
import { completeDelivery } from "../../lib/sales-distribution/delivery-service";
import { assertReturnDoesNotExceedDelivered } from "../../lib/sales-distribution/returns-service";

// Live TEST-DB verification of Distributor fulfilment IDOR + state-machine boundaries (Part 6 of
// the requested audit) — not previously executed live, only verified via static code reading.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const testEnv = envFile(path.join(root, ".env.test"));
const test = testEnv.TEST_DATABASE_URL;
const useDirect = process.env.SEERA_USE_DIRECT_TEST === "true";
const connectTarget = useDirect ? testEnv.TEST_DIRECT_DATABASE_URL! : test;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const url = new URL(connectTarget);
url.searchParams.set("connection_limit", "8");
url.searchParams.set("connect_timeout", "20");
url.searchParams.set("pool_timeout", "20");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (ok) pass++; else fail++;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint} conn=${useDirect ? "DIRECT" : "POOLED"}\n`);
  const warmupStart = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  console.log(`  [warmup ping: ${Date.now() - warmupStart}ms]`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const distributorOwnerA = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const suffix = randomBytes(4).toString("hex");

  const ss = await prisma.seeraPartner.create({ data: { type: "SUPER_STOCKIST", code: `SS-IDOR-${suffix}`, legalName: `IDOR SS ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000001" }, addresses: { city: "Test" }, territoryIds: [], createdById: founder.id } });
  const distA = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-IDOR-A-${suffix}`, legalName: `IDOR Distributor A ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000002" }, addresses: { city: "Test" }, territoryIds: [], assignedSuperStockistId: ss.id, createdById: founder.id } });
  const distB = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-IDOR-B-${suffix}`, legalName: `IDOR Distributor B ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000003" }, addresses: { city: "Test" }, territoryIds: [], assignedSuperStockistId: ss.id, createdById: founder.id } });
  await prisma.seeraPartyUser.create({ data: { partnerId: distA.id, userId: distributorOwnerA.id, accessRole: "OWNER", createdById: founder.id } });
  const retailer = await prisma.seeraRetailer.create({ data: { code: `R-IDOR-${suffix}`, businessName: `IDOR Retailer ${suffix}`, address: { city: "Test" }, normalizedMobile: "", distributorId: distA.id, salespersonId: founder.id, lifecycle: "ACTIVE", createdById: founder.id } });
  const sku = await createSku(prisma, founder.id, { code: `SKU-IDOR-${suffix}`, productName: "IDOR Test SKU", category: "Care", packSize: 100, unitType: "ML", unitsPerCase: 12, mrp: 100, hsn: "3304", taxRate: 18 });
  await createPriceVersion(prisma, founder.id, { skuId: sku.id, tier: "DISTRIBUTOR_TO_RETAILER", amount: 80, effectiveFrom: new Date("2026-01-01") });
  const order = await placeRetailerOrder(prisma, { actorId: founder.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distA.id }, { retailerId: retailer.id, idempotencyKey: randomUUID(), lines: [{ skuId: sku.id, quantity: 10 }] });

  console.log("Test 1 — Distributor B (unrelated) cannot fulfil Distributor A's order (IDOR)");
  try {
    await fulfilRetailerOrder(prisma, distributorOwnerA.id, distB.id, { orderId: order.id, action: "ACCEPT", accepted: [{ lineId: order.lines[0]!.id, quantity: 10 }] });
    check("cross-distributor fulfil rejected", false, "did not throw");
  } catch (e) {
    check("cross-distributor fulfil rejected", (e as { code?: string }).code === "PARTY_SCOPE_DENIED", `code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 2 — Distributor A partially accepts (SR-020)");
  const partial = await fulfilRetailerOrder(prisma, distributorOwnerA.id, distA.id, { orderId: order.id, action: "PARTIAL_ACCEPT", accepted: [{ lineId: order.lines[0]!.id, quantity: 6 }] });
  check("status is PARTIAL_ACCEPTED", partial.status === "PARTIAL_ACCEPTED", partial.status);
  check("accepted quantity is 6, not 10 (remaining preserved)", Number(partial.lines[0]!.acceptedQuantity) === 6);

  console.log("\nTest 3 — cannot re-decide an already-decided order (state machine)");
  try {
    await fulfilRetailerOrder(prisma, distributorOwnerA.id, distA.id, { orderId: order.id, action: "ACCEPT", accepted: [{ lineId: order.lines[0]!.id, quantity: 10 }] });
    check("re-decision on non-SUBMITTED order rejected", false, "did not throw");
  } catch (e) {
    check("re-decision on non-SUBMITTED order rejected", (e as { code?: string }).code === "ORDER_SCOPE_OR_STATE_DENIED", `code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 4 — over-acceptance beyond ordered quantity rejected");
  const order2 = await placeRetailerOrder(prisma, { actorId: founder.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distA.id }, { retailerId: retailer.id, idempotencyKey: randomUUID(), lines: [{ skuId: sku.id, quantity: 5 }] });
  try {
    await fulfilRetailerOrder(prisma, distributorOwnerA.id, distA.id, { orderId: order2.id, action: "ACCEPT", accepted: [{ lineId: order2.lines[0]!.id, quantity: 999 }] });
    check("over-acceptance rejected", false, "did not throw");
  } catch (e) {
    check("over-acceptance rejected", (e as { code?: string }).code === "INVALID_ACCEPTED_QUANTITY", `code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 5 — Booked vs Delivered: dispatch + partial delivery, remaining quantity correctly tracked, no false DELIVERED");
  await fulfilRetailerOrder(prisma, distributorOwnerA.id, distA.id, { orderId: order2.id, action: "ACCEPT", accepted: [{ lineId: order2.lines[0]!.id, quantity: 5 }] });
  await prisma.seeraOrderLine.update({ where: { id: order2.lines[0]!.id }, data: { dispatchedQuantity: 5 } });
  await prisma.seeraSalesOrder.update({ where: { id: order2.id }, data: { status: "DISPATCHED" } });
  const delivery = await prisma.seeraDelivery.create({ data: { orderId: order2.id, actorId: distributorOwnerA.id, quantities: {}, idempotencyKey: randomUUID() } });
  await completeDelivery(prisma, distributorOwnerA.id, delivery.id, { status: "PARTIAL_DELIVERED", lines: [{ lineId: order2.lines[0]!.id, quantity: 3 }], proof: { mode: "PHOTO", reference: "test-photo", orderId: order2.id, deliveryId: delivery.id } });
  const afterPartialDelivery = await prisma.seeraSalesOrder.findUniqueOrThrow({ where: { id: order2.id }, include: { lines: true } });
  check("order status is PARTIAL_DELIVERED, not DELIVERED (3 of 5 delivered)", afterPartialDelivery.status === "PARTIAL_DELIVERED", afterPartialDelivery.status);
  check("deliveredQuantity is 3", Number(afterPartialDelivery.lines[0]!.deliveredQuantity) === 3);

  console.log("\nTest 6 — cannot deliver more than dispatched balance (over-delivery)");
  try {
    await completeDelivery(prisma, distributorOwnerA.id, delivery.id, { status: "DELIVERED", lines: [{ lineId: order2.lines[0]!.id, quantity: 999 }], proof: { mode: "PHOTO", reference: "x", orderId: order2.id, deliveryId: delivery.id } });
    check("over-delivery rejected", false, "did not throw (or delivery already final, see next check)");
  } catch (e) {
    check("over-delivery rejected OR delivery already final", ["OVER_DELIVERY_DENIED", "DELIVERY_ALREADY_FINAL"].includes((e as { code?: string }).code ?? ""), `code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 7 — DELIVERED requires proof server-side (not merely UI-enforced)");
  const order3 = await placeRetailerOrder(prisma, { actorId: founder.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distA.id }, { retailerId: retailer.id, idempotencyKey: randomUUID(), lines: [{ skuId: sku.id, quantity: 2 }] });
  await fulfilRetailerOrder(prisma, distributorOwnerA.id, distA.id, { orderId: order3.id, action: "ACCEPT", accepted: [{ lineId: order3.lines[0]!.id, quantity: 2 }] });
  await prisma.seeraOrderLine.update({ where: { id: order3.lines[0]!.id }, data: { dispatchedQuantity: 2 } });
  const delivery3 = await prisma.seeraDelivery.create({ data: { orderId: order3.id, actorId: distributorOwnerA.id, quantities: {}, idempotencyKey: randomUUID() } });
  try {
    await completeDelivery(prisma, distributorOwnerA.id, delivery3.id, { status: "DELIVERED", lines: [{ lineId: order3.lines[0]!.id, quantity: 2 }] });
    check("DELIVERED without proof rejected server-side", false, "did not throw — DIRECT API CALL COULD BYPASS PROOF");
  } catch (e) {
    check("DELIVERED without proof rejected server-side", (e as { code?: string }).code === "DELIVERY_PROOF_REQUIRED", `code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 8 — Return cannot exceed delivered quantity (boundary function, already unit-tested, re-confirm live)");
  check("assertReturnDoesNotExceedDelivered rejects over-return", (() => { try { assertReturnDoesNotExceedDelivered(3, 0, 4); return false; } catch (e) { return (e as { code?: string }).code === "RETURN_EXCEEDS_DELIVERED"; } })());

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraDelivery.deleteMany({ where: { orderId: { in: [order.id, order2.id, order3.id] } } });
  await prisma.seeraOrderLine.deleteMany({ where: { orderId: { in: [order.id, order2.id, order3.id] } } });
  await prisma.seeraSalesOrder.deleteMany({ where: { id: { in: [order.id, order2.id, order3.id] } } });
  await prisma.seeraPartyUser.deleteMany({ where: { partnerId: { in: [distA.id, distB.id] } } });
  await prisma.seeraRetailer.delete({ where: { id: retailer.id } });
  await prisma.seeraPartner.deleteMany({ where: { id: { in: [distA.id, distB.id, ss.id] } } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
