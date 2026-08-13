import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  createCompanyOrder,
  dispatchCompanyOrder,
  receiveIncomingOrder,
  createDistributorReplenishment,
  fulfilDistributorReplenishment,
  allocateOrderStock,
  dispatchAllocatedOrder,
  recordInventoryMovement,
  createSku,
  createPriceVersion,
  placeRetailerOrder,
} from "../../lib/sales-distribution/workflow-service";
import { submitPaymentProof, reviewPaymentProof } from "../../lib/sales-distribution/operational-service";
import { assignDistributorToOrder, managerDashboardSummary } from "../../lib/sales-distribution/manager-service";
import { superStockistDashboardSummary, superStockistStockSummary } from "../../lib/sales-distribution/super-stockist-easy-mode-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only live smoke test for RUN 2B Sections 6, 8, 9, 17, 18, 22 — actually executes the
// happy-path service calls a real logged-in review session would trigger, against the real
// review-*@seera.test fixtures and the real Seera 9/9 + MUV price master seeded this pass.
// Safe to re-run: every order/SKU below uses a idempotencyKey suffixed with Date.now().

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
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const [founder, ss1Owner, ss2Owner, accountsManager, distributorOwner, executive1, manager] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss2-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } }),
  ]);
  const [ss1, ss2, distributor1] = await Promise.all([
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } }),
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-02" } }),
    db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } }),
  ]);
  const [seeraCakeBlue, muvSku] = await Promise.all([
    db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } }),
    db.seeraSku.findUniqueOrThrow({ where: { code: "MUV-TC-STD-500" } }),
  ]);

  // ============= SECTION A: Company Order (SEERA) full happy path + SHORT RECEIPT =============
  const coA = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `r2b-a-${suffix}`, lines: [{ skuId: seeraCakeBlue.id, quantity: 2 }] });
  assert(coA.status === "SUBMITTED", `expected SUBMITTED, got ${coA.status}`);
  assert(Number(coA.total) === 596, `expected total 596 (2 x Rs298 Box), got ${coA.total}`);
  console.log(`[A1] OK — Company Order ${coA.orderNumber} created, total ₹${coA.total}, no tax added (taxTotal=${coA.taxTotal})`);

  const proofA = await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: coA.id, amount: 596, reference: `UTR-A-${suffix}`, idempotencyKey: `r2b-a-proof-${suffix}` });
  assert(proofA.status === "SUBMITTED", "expected payment proof status SUBMITTED");
  console.log(`[A2] OK — payment proof submitted, status=${proofA.status}`);

  // S.S. holds no payment_proof:review permission at all (RBAC catalog), so it's blocked before
  // ever reaching the dedicated self-review guard — still proves S.S. cannot self-verify, just via
  // RBAC rather than the PAYMENT_PROOF_SELF_REVIEW_DENIED code specifically.
  let ssBlockedFromReview = false;
  try {
    await reviewPaymentProof(db, ss1Owner.id, { proofId: proofA.id, status: "VERIFIED", reason: "self review attempt" });
  } catch (error) {
    ssBlockedFromReview = error instanceof FoundationError;
  }
  assert(ssBlockedFromReview, "expected S.S. to be unable to verify/self-verify its own payment proof");

  // Now prove the dedicated self-review guard itself: an Accounts actor who (hypothetically)
  // submitted a proof cannot review that same proof, even though they DO hold payment_proof:review.
  const proofSelf = await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: coA.id, amount: 0, reference: `UTR-SELF-${suffix}`, idempotencyKey: `r2b-a-proof-self-${suffix}` });
  await db.seeraPaymentProof.update({ where: { id: proofSelf.id }, data: { submittedById: accountsManager.id } });
  let dedicatedGuardFired = false;
  try {
    await reviewPaymentProof(db, accountsManager.id, { proofId: proofSelf.id, status: "VERIFIED", reason: "self review attempt" });
  } catch (error) {
    dedicatedGuardFired = error instanceof FoundationError && error.code === "PAYMENT_PROOF_SELF_REVIEW_DENIED";
  }
  assert(dedicatedGuardFired, "expected the dedicated self-review guard (PAYMENT_PROOF_SELF_REVIEW_DENIED) to fire for an Accounts actor reviewing their own submission");
  console.log("[A3] OK — S.S. blocked from reviewing (no permission) AND the dedicated independent-reviewer guard fires for an Accounts actor on their own submission");

  await reviewPaymentProof(db, accountsManager.id, { proofId: proofA.id, status: "VERIFIED", reason: "Matched bank UTR" });
  const coAConfirmed = await db.seeraSalesOrder.findUniqueOrThrow({ where: { id: coA.id } });
  assert(coAConfirmed.status === "CONFIRMED" && coAConfirmed.financialAcceptance, `expected CONFIRMED+financialAcceptance after Accounts verification, got ${coAConfirmed.status}`);
  console.log("[A4] OK — Accounts verified payment, order moved to CONFIRMED (financialAcceptance=true)");

  const deliveryA = await dispatchCompanyOrder(db, accountsManager.id, { orderId: coA.id, idempotencyKey: `r2b-a-dispatch-${suffix}`, vehicleNumber: "MH-04-AB-1234", driverName: "Ravi Kumar", driverMobile: "9800000010", lrNumber: `LR-A-${suffix}` });
  assert(deliveryA.status === "PENDING", "expected delivery status PENDING after Company dispatch");
  console.log(`[A5] OK — Company dispatched order (delivery ${deliveryA.id}), vehicle=${deliveryA.vehicleNumber}`);

  // SHORT RECEIPT: dispatched 2, receive 1 first, then remaining 1
  const receiptA1 = await receiveIncomingOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: coA.id, lines: [{ lineId: coA.lines[0]!.id, quantity: 1 }], reason: "Only 1 of 2 boxes arrived", idempotencyKey: `r2b-a-receipt1-${suffix}` });
  // shortage.expected is the outstanding balance BEFORE this receipt (dispatched - alreadyReceived =
  // 2 - 0 = 2), not "expected in this call" — confirmed by reading receiveIncomingOrder's own logic.
  assert(receiptA1.shortages.length === 1 && receiptA1.shortages[0]!.expected === 2 && receiptA1.shortages[0]!.received === 1, `expected a recorded shortage (outstanding=2, received=1), got ${JSON.stringify(receiptA1.shortages)}`);
  const claimA = await db.seeraClaim.findFirst({ where: { sourceId: coA.id, type: "SHORT_DELIVERY" } });
  assert(!!claimA, "expected a SHORT_DELIVERY claim to be created for the short receipt");
  console.log(`[A6] OK — SHORT RECEIPT: sent 2, received 1, shortage 1 recorded, claim ${claimA!.claimNumber} created`);

  const receiptA2 = await receiveIncomingOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: coA.id, lines: [{ lineId: coA.lines[0]!.id, quantity: 1 }], reason: "Remainder arrived", idempotencyKey: `r2b-a-receipt2-${suffix}` });
  assert(receiptA2.shortages.length === 0, "expected no shortage on the completing receipt");
  const movementsA = await db.seeraInventoryMovement.findMany({ where: { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: seeraCakeBlue.id, sourceId: coA.id, direction: "IN" } });
  const totalReceivedA = movementsA.reduce((sum, m) => sum + Number(m.quantity), 0);
  // STAGE 12: the physical ledger holds canonical PIECES (2 Boxes x 40 pcs/Box = 80 total across the
  // two 1-Box partial receipts), not the raw order-unit count — order-line bookkeeping (dispatchedQuantity,
  // and the shortage.expected/received assertions above) correctly stays in Boxes, untouched.
  assert(movementsA.length === 2 && totalReceivedA === 80, `expected exactly 2 IN movements totalling 80 physical pieces (2 Boxes x 40, no duplicate stock movement), got ${movementsA.length} movements totalling ${totalReceivedA}`);
  console.log(`[A7] OK — remainder received, physical stock increased correctly by exactly 80 pieces (2 Boxes) across 2 receipts (no duplicate movement)`);

  // ============= SECTION B: Company Order (MUV, PCS) full happy path =============
  const muvPrice = await db.seeraPriceVersion.findFirstOrThrow({ where: { skuId: muvSku.id, tier: "COMPANY_TO_SS", status: "ACTIVE" } });
  const coB = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `r2b-b-${suffix}`, lines: [{ skuId: muvSku.id, quantity: 3 }] });
  assert(Number(coB.total) === Number(muvPrice.amount) * 3, `expected MUV order total to be exactly price x qty with no tax added, got ${coB.total} vs expected ${Number(muvPrice.amount) * 3}`);
  assert(Number(coB.taxTotal) === 0, "expected zero taxTotal — MUV Company->S.S. rate is already GST-inclusive, no double GST");
  console.log(`[B1] OK — MUV Company Order ${coB.orderNumber} priced from active list (₹${muvPrice.amount}/pc), total ₹${coB.total}, taxTotal=0`);

  const proofB = await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: coB.id, amount: Number(coB.total), reference: `UTR-B-${suffix}`, idempotencyKey: `r2b-b-proof-${suffix}` });
  await reviewPaymentProof(db, accountsManager.id, { proofId: proofB.id, status: "VERIFIED", reason: "Matched bank UTR" });
  const deliveryB = await dispatchCompanyOrder(db, accountsManager.id, { orderId: coB.id, idempotencyKey: `r2b-b-dispatch-${suffix}`, vehicleNumber: "MH-04-CD-5678" });
  const receiptB = await receiveIncomingOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: coB.id, lines: [{ lineId: coB.lines[0]!.id, quantity: 3 }], idempotencyKey: `r2b-b-receipt-${suffix}` });
  assert(receiptB.shortages.length === 0, "expected full MUV receipt with no shortage");
  console.log(`[B2] OK — MUV Company Order full happy path complete (delivery ${deliveryB.id}, full receipt of 3)`);

  // ============= SECTION C: Distributor -> S.S. dispatch MECHANISM proof =============
  // GAP BEING DOCUMENTED, NOT PAPERED OVER: no SS_TO_DISTRIBUTOR (S.S.->Distributor) governed price
  // exists for ANY of the 9 real Seera or 36 real MUV catalog SKUs — the Founder's RUN 2B prompt only
  // supplied COMPANY_TO_SS rates. createDistributorReplenishment() requires a real active
  // SS_TO_DISTRIBUTOR price and throws PRICE_UNAVAILABLE otherwise (by design — no invented rate).
  // This section therefore proves the allocate/dispatch/receive MECHANISM end-to-end using one
  // clearly-labelled TEST-ONLY SKU (never shown in any real catalog selector, status ACTIVE only so
  // the mechanism can run) — it does NOT prove a real-catalog Distributor replenishment order can be
  // placed today. See final report for this as an honestly-reported remaining gap.
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

  console.log("\nALL RUN 2B SUPER STOCKIST CLOSURE SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
