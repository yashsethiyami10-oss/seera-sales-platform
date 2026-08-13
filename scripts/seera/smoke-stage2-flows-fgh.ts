import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createQuotationDraft, issueQuotation, recordQuotationResponse, convertQuotationToOrder } from "../../lib/sales-distribution/quotation-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { submitPartnerPayment } from "../../lib/sales-distribution/operational-service";
import { verifyPayment, generateDistributorPaymentReceipt } from "../../lib/sales-distribution/financial-service";
import { createReturnRequest, decideReturnRequest } from "../../lib/sales-distribution/returns-service";
import {
  startFieldDay, endFieldDay, placeRetailerOrder, recordInventoryMovement,
} from "../../lib/sales-distribution/workflow-service";
import { executiveCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { acceptAndPrepareRetailerOrder, recordEasyDeliveryOutcome } from "../../lib/sales-distribution/distributor-easy-mode-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 2 smoke test — Flows F, G, H (the genuinely new parts; A-E/I-L already proven earlier).
//  F. Quotation -> ACCEPTED -> converted to a real DISTRIBUTOR_REPLENISHMENT order -> GST Invoice
//     issued FROM it -> Distributor pays -> Accounts verifies -> S.S. generates Receipt. One
//     continuous chain, not five isolated proofs.
//  G. Delivery REFUSED: stock correctly credited back (physically intact), refusedQuantity tracked,
//     eligible-delivered performance value correctly excludes the refused units.
//  H. Approved return (USABLE): independent-reviewer-only, inventory credited back, returnedQuantity
//     pulled onto the order line, eligible-delivered correctly excludes the returned units too.
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
// Mirrors business-rules.ts's real eligibleDelivered() exactly (Math.max(0,...) floor, ordered-cancelled cap).
function eligibleDeliveredValue(line: { orderedQuantity: unknown; cancelledQuantity: unknown; deliveredQuantity: unknown; refusedQuantity: unknown; returnedQuantity: unknown; priceSnapshot: unknown }) {
  const eligible = Math.max(0, Math.min(Number(line.deliveredQuantity), Number(line.orderedQuantity) - Number(line.cancelledQuantity)) - Number(line.refusedQuantity) - Number(line.returnedQuantity));
  return eligible * Number(line.priceSnapshot);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const accountsManager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id } });

  // ============= FLOW F: Quotation -> Order -> Invoice -> Payment -> Receipt =============
  const quote = await createQuotationDraft(db, ss1Owner.id, {
    issuerType: "SUPER_STOCKIST", issuerId: ss1.id, buyerType: "DISTRIBUTOR", buyerId: distributor1.id, sourcePortal: "super-stockist",
    lines: [{ skuId: cakeSku.id, quantity: 4, rate: 315 }], idempotencyKey: `s2f-quote-${suffix}`,
  });
  const issued = await issueQuotation(db, ss1Owner.id, quote.id);
  await recordQuotationResponse(db, ss1Owner.id, issued.id, { decision: "ACCEPTED", reason: "Distributor confirmed verbally" });
  const converted = await convertQuotationToOrder(db, ss1Owner.id, issued.id, `s2f-convert-${suffix}`);
  assert(converted.type === "DISTRIBUTOR_REPLENISHMENT" && Number(converted.total) === 1260, `expected a real DISTRIBUTOR_REPLENISHMENT order for ₹1260 converted from the quotation, got type=${converted.type} total=${converted.total}`);
  console.log(`[F1] OK — Quotation ${issued.documentNumber} accepted and converted to a REAL order (${converted.orderNumber}, ₹${converted.total})`);

  const invoiceDraft = await createBillingDraft(db, ss1Owner.id, {
    type: "TAX_INVOICE", issuerType: "SUPER_STOCKIST", issuerId: ss1.id, buyerType: "DISTRIBUTOR", buyerId: distributor1.id,
    sourcePortal: "super-stockist", orderId: converted.id, lines: [{ skuId: cakeSku.id, quantity: 4, rate: 315 }], idempotencyKey: `s2f-invoice-${suffix}`,
  });
  const invoice = await issueBillingDraft(db, ss1Owner.id, invoiceDraft.id);
  assert(invoice.status === "ISSUED" && invoice.orderId === converted.id, "expected the invoice to be issued and linked back to the converted order");
  console.log(`[F2] OK — GST Invoice ${invoice.documentNumber} issued FROM the converted order (₹${invoice.grandTotal})`);

  const payment = await submitPartnerPayment(db, distributorOwner.id, { partnerType: "DISTRIBUTOR", partnerId: distributor1.id, amount: 1260, reference: `UTR-S2F-${suffix}`, paymentMode: "BANK_TRANSFER", paymentDate: new Date(), idempotencyKey: `s2f-payment-${suffix}` });
  await verifyPayment(db, accountsManager.id, payment.id, { matchedAmount: 1260, reason: "Matched" });
  console.log(`[F3] OK — Distributor paid ₹${payment.amountClaimed}, Accounts verified it`);

  const receipt = await generateDistributorPaymentReceipt(db, ss1Owner.id, ss1.id, { paymentId: payment.id, idempotencyKey: `receipt-${payment.id}` });
  assert(receipt.status === "ISSUED", "expected the receipt to be issued");
  console.log(`[F4] OK — Receipt ${receipt.documentNumber} generated — FULL CHAIN Quotation->Order->Invoice->Payment->Receipt complete, one continuous flow`);

  // ============= FLOW G: Delivery REFUSED =============
  // Clean up any dangling session from a prior interrupted run.
  const danglingVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: executive1.id, status: "ACTIVE" } }, orderBy: { checkedInAt: "desc" } });
  if (danglingVisit && !danglingVisit.checkedOutAt) await executiveCheckOut(db, executive1.id, danglingVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const danglingSession = await db.seeraWorkSession.findFirst({ where: { employeeId: executive1.id, status: "ACTIVE" } });
  if (danglingSession) await endFieldDay(db, executive1.id, danglingSession.id, { outcome: "COMPLETED" }).catch(() => {});

  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 5, sourceType: "SmokeTestOpening", sourceId: `s2g-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 2 Flow G opening stock", idempotencyKey: `s2g-opening-${suffix}` });
  const session = await startFieldDay(db, executive1.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", remarks: `Stage 2 Flow G ${suffix}` });
  const visit = await executiveCheckIn(db, executive1.id, { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `s2g-checkin-${suffix}` });
  await executiveCheckOut(db, executive1.id, visit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  const refuseOrder = await placeRetailerOrder(db, { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id }, { retailerId: retailer.id, idempotencyKey: `s2g-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 5, rate: 60 }] });
  const { delivery: refuseDelivery } = await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: refuseOrder.id, decision: "ACCEPT", lines: [{ lineId: refuseOrder.lines[0]!.id, quantity: 5 }], idempotencyKey: `s2g-accept-${suffix}` });
  const distOutBeforeRefuse = Number((await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: refuseOrder.id, direction: "OUT" }, _sum: { quantity: true } }))._sum.quantity ?? 0);
  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: refuseDelivery!.id, outcome: "REFUSED", lines: [{ lineId: refuseOrder.lines[0]!.id, quantity: 5 }], reason: "Shopkeeper refused at doorstep — Stage 2 smoke" });
  const refusedLine = await db.seeraOrderLine.findUniqueOrThrow({ where: { id: refuseOrder.lines[0]!.id } });
  assert(Number(refusedLine.refusedQuantity) === 5, `expected refusedQuantity=5, got ${refusedLine.refusedQuantity}`);
  const distInAfterRefuse = Number((await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: refuseDelivery!.id, direction: "IN" }, _sum: { quantity: true } }))._sum.quantity ?? 0);
  assert(distInAfterRefuse === 5, `expected the refused 5 units to be credited back to Distributor stock (physically intact), got ${distInAfterRefuse}`);
  assert(eligibleDeliveredValue(refusedLine) === 0, `expected eligible-delivered performance value to be ₹0 for a fully-refused line (0 delivered, all refused), got ₹${eligibleDeliveredValue(refusedLine)}`);
  console.log(`[G1] OK — REFUSED: ${distOutBeforeRefuse} units dispatched, all 5 refused, stock correctly credited back IN (+5), refusedQuantity=5, eligible-delivered performance value correctly ₹0`);

  // ============= FLOW H: Approved return =============
  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 3, sourceType: "SmokeTestOpening", sourceId: `s2h-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 2 Flow H opening stock", idempotencyKey: `s2h-opening-${suffix}` });
  const returnOrder = await placeRetailerOrder(db, { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id }, { retailerId: retailer.id, idempotencyKey: `s2h-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 3, rate: 60 }] });
  const { delivery: returnDelivery } = await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: returnOrder.id, decision: "ACCEPT", lines: [{ lineId: returnOrder.lines[0]!.id, quantity: 3 }], idempotencyKey: `s2h-accept-${suffix}` });
  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: returnDelivery!.id, outcome: "DELIVERED", lines: [{ lineId: returnOrder.lines[0]!.id, quantity: 3 }] });

  const returnRequest = await createReturnRequest(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, retailerId: retailer.id, sourceOrderId: returnOrder.id, skuId: cakeSku.id, quantity: 2, condition: "USABLE", reason: "Retailer returned unsold stock — Stage 2 smoke", sourcePortal: "distributor", idempotencyKey: `s2h-return-${suffix}` });
  let selfReviewDenied = false;
  try {
    await decideReturnRequest(db, distributorOwner.id, returnRequest.id, { decision: "APPROVED", reason: "self review attempt" });
  } catch (error) {
    selfReviewDenied = error instanceof FoundationError && error.code === "RETURN_REQUEST_SELF_REVIEW_DENIED";
  }
  assert(selfReviewDenied, "expected the SAME actor who submitted the return to be denied approving it");
  console.log("[H1] OK — return request requires an independent reviewer (self-approval denied)");

  // Independent reviewer: a real single-owner Distributor has exactly ONE user holding
  // distributor_inventory:adjust (the Owner), who cannot review their own submission — and no
  // DISTRIBUTOR_OPERATOR holds that permission either (confirmed in rbac-catalog.ts), so there is
  // no second same-party reviewer available. Founder/Super Admin is the only currently-reachable
  // independent authority (Stage 2 fix, mirrors the existing system:super_admin bypass pattern in
  // document-service.ts) until Stage 4 gives this a dedicated Admin Approvals inbox entry.
  await decideReturnRequest(db, founder.id, returnRequest.id, { decision: "APPROVED", reason: "Verified usable stock — Stage 2 smoke" });
  const returnedLine = await db.seeraOrderLine.findUniqueOrThrow({ where: { id: returnOrder.lines[0]!.id } });
  assert(Number(returnedLine.returnedQuantity) === 2, `expected returnedQuantity=2, got ${returnedLine.returnedQuantity}`);
  const distInAfterReturn = Number((await db.seeraInventoryMovement.aggregate({ where: { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, sourceId: returnRequest.id, direction: "IN" }, _sum: { quantity: true } }))._sum.quantity ?? 0);
  assert(distInAfterReturn === 2, `expected the 2 usable returned units to be credited back to stock, got ${distInAfterReturn}`);
  const expectedEligible = (3 - 2) * 60; // 3 delivered, 2 returned -> only 1 unit's value counts
  assert(eligibleDeliveredValue(returnedLine) === expectedEligible, `expected eligible-delivered to correctly exclude the returned units (₹${expectedEligible}), got ₹${eligibleDeliveredValue(returnedLine)}`);
  console.log(`[H2] OK — return APPROVED by an independent reviewer, stock credited back (+2, usable), returnedQuantity=2, eligible-delivered performance correctly adjusted (₹${expectedEligible})`);

  await endFieldDay(db, executive1.id, session.id, { outcome: "COMPLETED" });
  console.log("\nALL STAGE 2 FLOW F/G/H SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
