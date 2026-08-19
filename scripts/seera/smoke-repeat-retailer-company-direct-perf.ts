import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { executiveCheckIn, executiveCheckOut, createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { assignRetailerCommercialParty } from "../../lib/sales-distribution/manager-service";
import { createCompanyDirectPartner } from "../../lib/sales-distribution/distributor-management-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live end-to-end smoke test for the "Repeat Retailer / Manoj Hybrid Territory / P0
// Performance" upgrade. Exercises real service functions against a real TEST database — never
// production, never a mocked DB. Safe to re-run (fresh retailer/order/idempotency keys each run).

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
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 2 });
  assert(skus.length >= 2, "expected >=2 seeded SKUs");

  // Clean up any dangling ACTIVE session left over from a prior run.
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" } }, orderBy: { checkedInAt: "desc" } });
  if (openVisit && !openVisit.checkedOutAt) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) {
    const { endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED" }).catch(() => {});
  }
  const { startFieldDay } = await import("../../lib/sales-distribution/workflow-service");
  const authorizedForStart = await executiveAuthorizedDistributors(db, exec.id);
  assert(authorizedForStart.length > 0, "expected the exec fixture to have at least one authorized working distributor");
  const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorizedForStart[0]!.id, remarks: `Repeat-retailer smoke ${suffix}` });
  console.log("[0/9] Start Day OK");

  // ============= 1) createRetailerAndCheckIn — combined Add-Customer action =============
  const combinedKey = `smoke-combined-${suffix}`;
  const checkInKey = `smoke-combined-checkin-${suffix}`;
  const combined1 = await createRetailerAndCheckIn(db, exec.id, {
    businessName: `Repeat Smoke Shop ${suffix}`,
    address: { area: "Smoke Test Area" },
    // A mobile number is required for the WhatsApp outbox assertions below (no mobile ->
    // MOBILE_UNAVAILABLE outbox row with no order number, not a real product defect).
    mobile: `98${String(suffix).slice(-8)}`,
    workSessionId: session.id,
    idempotencyKey: combinedKey,
    checkInIdempotencyKey: checkInKey,
  });
  assert(combined1.retailer.lifecycle === "ACTIVE", "expected combined-create retailer ACTIVE");
  assert(combined1.visit.retailerId === combined1.retailer.id, "expected combined visit to link the new retailer");
  // A genuine retry (e.g. after a network timeout) re-submits with confirmDuplicate:true, exactly
  // like FieldJourney.tsx's submitAddCustomer does on its second call after the duplicate-warning
  // banner — the businessName-based duplicate check runs before the idempotencyKey short-circuit
  // (pre-existing ordering, unchanged from createRetailer), so a same-name retry without it would
  // hit SIMILAR_RETAILER_EXISTS against itself rather than the idempotency path.
  const combined2 = await createRetailerAndCheckIn(db, exec.id, {
    businessName: `Repeat Smoke Shop ${suffix}`,
    address: { area: "Smoke Test Area" },
    workSessionId: session.id,
    idempotencyKey: combinedKey,
    checkInIdempotencyKey: checkInKey,
    confirmDuplicate: true,
  });
  assert(combined2.retailer.id === combined1.retailer.id, "expected retry with same idempotencyKey to return the SAME retailer, not a duplicate");
  assert(combined2.visit.id === combined1.visit.id, "expected retry with same checkInIdempotencyKey to return the SAME visit, not a duplicate");
  const retailer = combined1.retailer;
  console.log("[1/9] createRetailerAndCheckIn OK — one round trip, idempotent on retry:", retailer.id, combined1.visit.id);

  // ============= 2) Revisit — Check In Again produces a SECOND independent SeeraVisit =============
  await executiveCheckOut(db, exec.id, combined1.visit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke: first visit closed", photoExceptionReason: "OTHER" });
  const firstVisitAfterClose = await db.seeraVisit.findUniqueOrThrow({ where: { id: combined1.visit.id } });
  assert(firstVisitAfterClose.outcome === "NO_ORDER", "expected first visit outcome preserved as NO_ORDER");
  const revisit = await executiveCheckIn(db, exec.id, {
    workSessionId: session.id,
    retailerId: retailer.id,
    idempotencyKey: `smoke-revisit-${suffix}`,
  });
  assert(revisit.id !== combined1.visit.id, "expected a brand-new SeeraVisit id for the revisit");
  const firstVisitStillIntact = await db.seeraVisit.findUniqueOrThrow({ where: { id: combined1.visit.id } });
  assert(firstVisitStillIntact.outcome === "NO_ORDER" && firstVisitStillIntact.checkedOutAt !== null, "expected the FIRST visit to remain untouched by the revisit");
  console.log("[2/9] Revisit OK — 2 independent visits:", combined1.visit.id, "(untouched) and", revisit.id);

  // ============= 3) Multiple independent orders same retailer, mixed sources =============
  const orderA = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
    { retailerId: retailer.id, idempotencyKey: `smoke-order-fieldvisit-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 2, rate: 60 }], source: "FIELD_VISIT", visitId: revisit.id },
  );
  assert(orderA.source === "FIELD_VISIT" && orderA.visitId === revisit.id, "expected order A to be FIELD_VISIT with the revisit linked");

  const orderB = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
    { retailerId: retailer.id, idempotencyKey: `smoke-order-phone-${suffix}`, lines: [{ skuId: skus[1]!.id, quantity: 1, rate: 45 }], source: "PHONE_CALL" },
  );
  assert(orderB.visitId === null, "expected the phone order to have NO visitId — no fake visit");
  assert(orderB.source === "PHONE_CALL", "expected order B source=PHONE_CALL");
  assert(orderB.id !== orderA.id && orderB.orderNumber !== orderA.orderNumber, "expected independent order ids/numbers");
  console.log("[3/9] Multiple independent orders OK — A:", orderA.orderNumber, "(FIELD_VISIT, visit-linked) B:", orderB.orderNumber, "(PHONE_CALL, no visit)");

  // Close the revisit before moving on — leaving it open would dangle past this script's own
  // exit (OPEN_VISIT_EXISTS is scoped by employee, not session, so a leftover open visit here
  // would block this employee's NEXT check-in for a DIFFERENT retailer in any later run).
  await executiveCheckOut(db, exec.id, revisit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });

  // ============= 4) Independent WhatsApp outbox per order, referencing its OWN order number =============
  const outboxRowsForRetailer = await db.outboxEvent.findMany({ where: { eventType: "ORDER_RECORDED", aggregateType: "SeeraRetailer", aggregateId: retailer.id }, orderBy: { createdAt: "asc" } });
  assert(outboxRowsForRetailer.length >= 2, `expected >=2 ORDER_RECORDED outbox rows for this retailer (one per order), got ${outboxRowsForRetailer.length}`);
  const payloadA = outboxRowsForRetailer.find((r) => JSON.stringify(r.payload).includes(orderA.orderNumber));
  const payloadB = outboxRowsForRetailer.find((r) => JSON.stringify(r.payload).includes(orderB.orderNumber));
  assert(Boolean(payloadA), "expected an outbox row referencing order A's own order number");
  assert(Boolean(payloadB), "expected an outbox row referencing order B's own order number (not a stale 'most recent order' guess)");
  console.log("[4/9] Independent WhatsApp outbox OK —", outboxRowsForRetailer.length, "rows, each referencing its own order");

  // ============= 5) No duplicate ORDER_RECORDED on checkout after an order was already placed =============
  const secondVisit = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `smoke-revisit2-${suffix}` });
  await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
    { retailerId: retailer.id, idempotencyKey: `smoke-order-fieldvisit2-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 1, rate: 60 }], source: "FIELD_VISIT", visitId: secondVisit.id },
  );
  const countBeforeCheckout = await db.outboxEvent.count({ where: { eventType: "ORDER_RECORDED", aggregateType: "SeeraRetailer", aggregateId: retailer.id } });
  await executiveCheckOut(db, exec.id, secondVisit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  const countAfterCheckout = await db.outboxEvent.count({ where: { eventType: "ORDER_RECORDED", aggregateType: "SeeraRetailer", aggregateId: retailer.id } });
  assert(countAfterCheckout === countBeforeCheckout, `expected checkout with outcome=ORDER_BOOKED to NOT queue a second ORDER_RECORDED (trigger moved to placeRetailerOrder) — before=${countBeforeCheckout} after=${countAfterCheckout}`);
  console.log("[5/9] No duplicate WhatsApp on checkout OK — count unchanged at", countAfterCheckout);

  // ============= 6) Forged/foreign visitId rejected =============
  let rejected = false;
  try {
    await placeRetailerOrder(
      db,
      { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
      { retailerId: retailer.id, idempotencyKey: `smoke-order-forged-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 1, rate: 60 }], source: "FIELD_VISIT", visitId: "nonexistent-visit-id" },
    );
  } catch (error) {
    rejected = error instanceof FoundationError && error.code === "VISIT_SCOPE_DENIED";
  }
  assert(rejected, "expected a forged/nonexistent visitId to be rejected with VISIT_SCOPE_DENIED");
  console.log("[6/9] Forged visitId rejected OK");

  // ============= 7) Company Direct singleton creation =============
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const cd1 = await createCompanyDirectPartner(db, founder.id, { address: { line: "HQ", city: "Test City", state: "Test State" }, idempotencyKey: `smoke-cd-${suffix}` });
  const cd2 = await createCompanyDirectPartner(db, founder.id, { address: { line: "HQ", city: "Test City", state: "Test State" }, idempotencyKey: `smoke-cd-second-call-${suffix}` });
  assert(cd1.id === cd2.id, "expected createCompanyDirectPartner to be a true singleton — second call must return the SAME row");
  assert(cd1.type === "COMPANY_DIRECT", "expected type=COMPANY_DIRECT");
  console.log("[7/9] Company Direct singleton OK —", cd1.id, cd1.legalName);

  // ============= 8) assignRetailerCommercialParty + Company Direct order routing/reporting split =============
  const reassigned = await assignRetailerCommercialParty(db, manager.id, { retailerId: retailer.id, partnerId: cd1.id, reason: "Smoke test: hybrid territory Company Direct assignment" });
  assert(reassigned.distributorId === cd1.id, "expected retailer.distributorId to now point at the Company Direct partner");
  const thirdVisit = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `smoke-revisit3-${suffix}` });
  const companyDirectOrder = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: cd1.id },
    { retailerId: retailer.id, idempotencyKey: `smoke-order-companydirect-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 3, rate: 60 }], source: "FIELD_VISIT", visitId: thirdVisit.id },
  );
  assert(companyDirectOrder.sellerPartnerId === cd1.id, "expected the order to route to the Company Direct partner (explicit distributorId always wins over territory auto-match)");
  await executiveCheckOut(db, exec.id, thirdVisit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  const { executiveDashboard } = await import("../../lib/sales-distribution/field-portal-service");
  const dashboard = await executiveDashboard(db, exec.id);
  assert(dashboard.today.companyDirectValue >= Number(companyDirectOrder.total), `expected today.companyDirectValue to include the Company Direct order's value, got ${dashboard.today.companyDirectValue}`);
  console.log("[8/9] Company Direct assignment + routing + reporting split OK — order routed to", companyDirectOrder.sellerPartnerId, "dashboard companyDirectValue:", dashboard.today.companyDirectValue);

  // ============= 9) Cleanup =============
  const { endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
  await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED" });
  console.log("[9/9] End Day OK — smoke test complete, all assertions passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
