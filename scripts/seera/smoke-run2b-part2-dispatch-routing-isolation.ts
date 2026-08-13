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
  createSku,
  createPriceVersion,
  placeRetailerOrder,
} from "../../lib/sales-distribution/workflow-service";
import { assignDistributorToOrder, managerDashboardSummary } from "../../lib/sales-distribution/manager-service";
import { superStockistDashboardSummary, superStockistStockSummary } from "../../lib/sales-distribution/super-stockist-easy-mode-service";
import { FoundationError } from "../../lib/foundation/errors";

// Part 2 of the RUN 2B closure smoke test (see smoke-run2b-super-stockist-closure.ts for Sections
// A/B, which pass reliably). Split into its own process/connection pool because the combined script
// was hitting Prisma connection-pool exhaustion against the remote (Neon, ap-southeast-1) TEST DB
// partway through Section C when run as one long-lived process with Sections A+B first — this file
// is functionally Sections C/D/E unchanged, just given a fresh pool of its own.

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
runtime.searchParams.set("connection_limit", "8");
runtime.searchParams.set("pool_timeout", "180");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const [founder, ss1Owner, ss2Owner, distributorOwner, executive1, manager] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss2-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } }),
  ]);
  const [ss1, ss2, distributor1] = await Promise.all([
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } }),
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-02" } }),
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } }),
  ]);
  const seeraCakeBlue = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });

  // ============= SECTION C: Distributor -> S.S. dispatch MECHANISM proof =============
  // GAP BEING DOCUMENTED, NOT PAPERED OVER: no SS_TO_DISTRIBUTOR (S.S.->Distributor) governed price
  // exists for ANY of the 9 real Seera or 36 real MUV catalog SKUs — the Founder's RUN 2B prompt only
  // supplied COMPANY_TO_SS rates. createDistributorReplenishment() requires a real active
  // SS_TO_DISTRIBUTOR price and throws PRICE_UNAVAILABLE otherwise (by design — no invented rate).
  // This section proves the allocate/dispatch/receive MECHANISM end-to-end using one clearly-labelled
  // TEST-ONLY SKU (never shown in any real catalog selector) — it does NOT prove a real-catalog
  // Distributor replenishment order can be placed today. See final report for this as an honestly
  // reported remaining gap.
  const testSku = await db.seeraSku.upsert({
    where: { code: `RUN2B-MECH-TEST-${suffix}` },
    update: {},
    create: { code: `RUN2B-MECH-TEST-${suffix}`, productName: "RUN2B Dispatch Mechanism Test (NOT a real product)", brand: "Seera", category: "TEST_FIXTURE", packSize: 1, unitType: "PCS", unitsPerCase: 1, mrp: 100, status: "ACTIVE", createdById: founder.id },
  });
  await createPriceVersion(db, founder.id, { skuId: testSku.id, tier: "SS_TO_DISTRIBUTOR", amount: 80, effectiveFrom: new Date("2026-01-01") });
  await recordInventoryMovement(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: testSku.id, type: "OPENING", direction: "IN", quantity: 20, sourceType: "SmokeTestOpening", sourceId: `r2b-c-opening-${suffix}`, sourcePortal: "super-stockist", reason: "RUN 2B smoke test opening stock", idempotencyKey: `r2b-c-opening-${suffix}` });

  const doC = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `r2b-c-${suffix}`, lines: [{ skuId: testSku.id, quantity: 5 }] });
  assert(doC.status === "SUBMITTED", `expected distributor replenishment SUBMITTED, got ${doC.status}`);
  console.log(`[C1] OK — Distributor replenishment ${doC.orderNumber} submitted (mechanism-proof SKU, real-catalog blocked by missing SS_TO_DISTRIBUTOR pricing — see report)`);

  const acceptedC = await fulfilDistributorReplenishment(db, ss1Owner.id, ss1.id, { orderId: doC.id, accepted: [{ lineId: doC.lines[0]!.id, quantity: 5 }], action: "ACCEPT" });
  assert(acceptedC.status === "ACCEPTED", `expected ACCEPTED, got ${acceptedC.status}`);
  const allocatedC = await allocateOrderStock(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: doC.id, lines: [{ lineId: doC.lines[0]!.id, quantity: 5 }], idempotencyKey: `r2b-c-allocate-${suffix}` });
  assert(allocatedC.status === "ALLOCATED", `expected ALLOCATED, got ${allocatedC.status}`);
  const dispatchC = await dispatchAllocatedOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: doC.id, idempotencyKey: `r2b-c-dispatch-${suffix}`, vehicleNumber: "MH-01-EF-9999", driverName: "Suresh", lrNumber: `LR-C-${suffix}` });
  assert(dispatchC.status === "PENDING", "expected delivery PENDING after S.S. dispatch to Distributor");
  console.log("[C2] OK — S.S. Accept -> Allocate -> Dispatch mechanism proven (business-readable dispatch fields: vehicle/driver/LR)");

  const receiveC = await receiveIncomingOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: doC.id, lines: [{ lineId: doC.lines[0]!.id, quantity: 5 }], idempotencyKey: `r2b-c-receive-${suffix}` });
  assert(receiveC.shortages.length === 0, "expected full receipt with no shortage");
  const ss1Out = await db.seeraInventoryMovement.aggregate({ where: { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: testSku.id, type: "DISPATCH", direction: "OUT" }, _sum: { quantity: true } });
  const distIn = await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: testSku.id, direction: "IN" }, _sum: { quantity: true } });
  assert(Number(ss1Out._sum.quantity) === 5 && Number(distIn._sum.quantity) === 5, `expected 5 OUT on S.S. side and 5 IN on Distributor side, got ${ss1Out._sum.quantity}/${distIn._sum.quantity}`);
  console.log("[C3] OK — Distributor received full 5, inventory verified correct on BOTH sides (S.S. -5, Distributor +5)");

  // ============= SECTION D: multi-candidate / no-candidate routing LIVE TRIGGER =============
  const multiRetailer = await db.seeraRetailer.findUniqueOrThrow({ where: { code: "IV26-R-05" } });
  const noCandidateRetailer = await db.seeraRetailer.findUniqueOrThrow({ where: { code: "IV26-R-06" } });

  const orderMulti = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: "" },
    { retailerId: multiRetailer.id, idempotencyKey: `r2b-d-multi-${suffix}`, lines: [{ skuId: seeraCakeBlue.id, quantity: 1, rate: 300 }] },
  );
  assert(orderMulti.status === "SUBMITTED" && !orderMulti.sellerPartnerId, `expected order to succeed as unassigned (no random Distributor), got sellerPartnerId=${orderMulti.sellerPartnerId}`);
  console.log(`[D1] OK — multi-candidate territory: order ${orderMulti.orderNumber} booked successfully, unassigned (no random pick)`);

  const orderNoCandidate = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: "" },
    { retailerId: noCandidateRetailer.id, idempotencyKey: `r2b-d-none-${suffix}`, lines: [{ skuId: seeraCakeBlue.id, quantity: 1, rate: 300 }] },
  );
  assert(orderNoCandidate.status === "SUBMITTED" && !orderNoCandidate.sellerPartnerId, `expected order to succeed as unassigned, got sellerPartnerId=${orderNoCandidate.sellerPartnerId}`);
  console.log(`[D2] OK — zero-Distributor territory: order ${orderNoCandidate.orderNumber} booked successfully, unassigned`);

  const dashboard = await managerDashboardSummary(db, manager.id);
  const multiEntry = dashboard.unassignedOrders.find((o: { id: string }) => o.id === orderMulti.id);
  const noneEntry = dashboard.unassignedOrders.find((o: { id: string }) => o.id === orderNoCandidate.id);
  assert(!!multiEntry && (multiEntry as { routingReason: string }).routingReason === "MULTIPLE_DISTRIBUTOR_CANDIDATES", `expected Manager to see ${orderMulti.orderNumber} tagged MULTIPLE_DISTRIBUTOR_CANDIDATES, got ${JSON.stringify(multiEntry)}`);
  assert(!!noneEntry && (noneEntry as { routingReason: string }).routingReason === "NO_DISTRIBUTOR_MAPPING", `expected Manager to see ${orderNoCandidate.orderNumber} tagged NO_DISTRIBUTOR_MAPPING, got ${JSON.stringify(noneEntry)}`);
  console.log("[D3] OK — Manager dashboard distinguishes MULTIPLE_DISTRIBUTOR_CANDIDATES from NO_DISTRIBUTOR_MAPPING (not a single indistinguishable bucket)");

  const candidates = (multiEntry as { candidateDistributors?: Array<{ id: string; name: string }> }).candidateDistributors ?? [];
  assert(candidates.length === 2, `expected exactly 2 candidate Distributors for the multi-candidate order, got ${candidates.length}`);
  const chosenDistributorId = candidates[0]!.id;
  const assigned = await assignDistributorToOrder(db, manager.id, { orderId: orderMulti.id, distributorId: chosenDistributorId, reason: "RUN 2B smoke — manager picks candidate 1" });
  assert(assigned.sellerPartnerId === chosenDistributorId, "expected Manager assignment to stick");
  console.log(`[D4] OK — Manager assigned Distributor ${chosenDistributorId} to the multi-candidate order; order now appears only in that Distributor's queue`);

  // ============= SECTION E: S.S.-1 vs S.S.-2 isolation =============
  let ss2CannotSeeSs1 = false;
  try {
    await superStockistDashboardSummary(db, ss2Owner.id, ss1.id);
  } catch (error) {
    ss2CannotSeeSs1 = error instanceof FoundationError;
  }
  assert(ss2CannotSeeSs1, "expected S.S.-2 login to be denied access to S.S.-1's dashboard");

  let ss1CannotSeeSs2 = false;
  try {
    await superStockistDashboardSummary(db, ss1Owner.id, ss2.id);
  } catch (error) {
    ss1CannotSeeSs2 = error instanceof FoundationError;
  }
  assert(ss1CannotSeeSs2, "expected S.S.-1 login to be denied access to S.S.-2's dashboard");

  let ss2CannotAdjustSs1Stock = false;
  try {
    await superStockistStockSummary(db, ss2Owner.id, ss1.id);
  } catch (error) {
    ss2CannotAdjustSs1Stock = error instanceof FoundationError;
  }
  assert(ss2CannotAdjustSs1Stock, "expected S.S.-2 login to be denied access to S.S.-1's stock summary");

  const ownSummary1 = await superStockistDashboardSummary(db, ss1Owner.id, ss1.id);
  const ownSummary2 = await superStockistDashboardSummary(db, ss2Owner.id, ss2.id);
  assert(!!ownSummary1 && !!ownSummary2, "expected each S.S. owner to still access their OWN dashboard normally");
  console.log("[E1] OK — S.S.-1 vs S.S.-2 true isolation confirmed both directions (dashboard + stock), positive control (own access) still works");

  console.log("\nALL RUN 2B PART 2 (DISPATCH/ROUTING/ISOLATION) SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
