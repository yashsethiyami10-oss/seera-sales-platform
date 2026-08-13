import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailer, executiveCheckIn, executiveCheckOut, executiveDsrHistory } from "../../lib/sales-distribution/field-portal-service";
import { listRetailerCommunications } from "../../lib/sales-distribution/retailer-communication-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only live smoke test for SEERA Sales Executive Closure Pass #2:
//  - Scenario B: End Day double-submit is now rejected cleanly (not "corrupted"), proving the
//    server-side guard still holds even though the real fix (busy-state race) is client-side.
//  - Scenario C: Day-1 -> Day-2 rollover — Day 2 starts clean, Day 1 history stays intact.
//  - Scenario E: editable Rate — a client-submitted rate overrides the catalog price; omitting it
//    still falls back to the catalog price (back-compat for other callers).
//  - Scenario G: WhatsApp outbox — ORDER_RECORDED queued on an order-booked checkout with a
//    mobile-enabled retailer; REFUSED_OR_UNABLE recorded as MOBILE_UNAVAILABLE (not queued, but
//    audited) for a no-mobile retailer, and checkout still succeeds either way.
// Safe to re-run — every retailer/order/session below is freshly created per run.

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
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const uniqueSuffix = Date.now();

  // Clean up any dangling open visit/session from a prior run.
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" }, checkedOutAt: null } });
  if (openVisit) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED" });

  // ---------------- Scenario E: editable Rate ----------------
  const seeraSku = await db.seeraSku.findFirstOrThrow({ where: { brand: "Seera", status: "ACTIVE" } });
  const muvSku = await db.seeraSku.findFirstOrThrow({ where: { brand: "MUV", status: "ACTIVE" }, include: { prices: { where: { tier: "DISTRIBUTOR_TO_RETAILER", status: "ACTIVE" } } } });
  assert(muvSku.prices.length > 0, "expected the seeded MUV SKU to have a real approved DISTRIBUTOR_TO_RETAILER price");
  console.log(`[Catalog] OK — Seera SKU "${seeraSku.productName}" (no forced price) + MUV SKU "${muvSku.productName}" (approved rate ₹${muvSku.prices[0].amount})`);

  const session1 = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", remarks: "Closure pass 2 smoke — Day 1" });
  // mobile suffixed with the run-unique timestamp (last 7 digits) — a fixed mobile number here
  // previously tripped the app's own (correctly working) similar-retailer duplicate detection on a
  // second run, contradicting this file's own "safe to re-run" claim. Test-script fix, not an
  // application fix — createRetailer's duplicate detection is behaving correctly.
  const retailerE = await createRetailer(db, exec.id, { businessName: `Closure2 Shop E ${uniqueSuffix}`, address: { area: "Area E" }, mobile: `98${String(uniqueSuffix).slice(-8)}`, idempotencyKey: `c2-e-${uniqueSuffix}` });
  const visitE = await executiveCheckIn(db, exec.id, { workSessionId: session1.id, retailerId: retailerE.id, idempotencyKey: `c2-e-checkin-${uniqueSuffix}` });
  const customRate = 77.5;
  const orderE = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailerE.distributorId! },
    { retailerId: retailerE.id, idempotencyKey: `c2-e-order-${uniqueSuffix}`, lines: [{ skuId: seeraSku.id, quantity: 3, rate: customRate }] },
  );
  assert(Number(orderE.lines[0].priceSnapshot) === customRate, `expected priceSnapshot to be the submitted rate ${customRate}, got ${orderE.lines[0].priceSnapshot}`);
  assert(Number(orderE.total) === customRate * 3, `expected order total ${customRate * 3}, got ${orderE.total}`);
  console.log(`[Test E, part 1] OK — client-submitted rate ₹${customRate} used verbatim, order total ₹${orderE.total}`);

  const orderE2 = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailerE.distributorId! },
    { retailerId: retailerE.id, idempotencyKey: `c2-e-order2-${uniqueSuffix}`, lines: [{ skuId: muvSku.id, quantity: 2 }] },
  );
  assert(Number(orderE2.lines[0].priceSnapshot) === Number(muvSku.prices[0].amount), "expected omitted-rate order to fall back to the catalog price");
  console.log(`[Test E, part 2] OK — omitted rate correctly fell back to catalog price ₹${orderE2.lines[0].priceSnapshot}`);

  // ---------------- Scenario G: WhatsApp outbox ----------------
  await executiveCheckOut(db, exec.id, visitE.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  const commsE = await listRetailerCommunications(db, { retailerId: retailerE.id });
  const orderRecorded = commsE.find((c) => c.eventType === "ORDER_RECORDED");
  assert(orderRecorded, "expected an ORDER_RECORDED outbox event after an order-booked checkout with a mobile-enabled retailer");
  assert(orderRecorded!.status === "PENDING", `expected ORDER_RECORDED to be PENDING (queued, not sent), got ${orderRecorded!.status}`);
  console.log(`[Test G, part 1] OK — ORDER_RECORDED queued PENDING (no provider called), id=${orderRecorded!.id}`);

  const retailerNoMobile = await createRetailer(db, exec.id, { businessName: `Closure2 Shop G2 ${uniqueSuffix}`, address: { area: "Area G2" }, idempotencyKey: `c2-g2-${uniqueSuffix}` });
  const visitG2 = await executiveCheckIn(db, exec.id, { workSessionId: session1.id, retailerId: retailerNoMobile.id, idempotencyKey: `c2-g2-checkin-${uniqueSuffix}` });
  await executiveCheckOut(db, exec.id, visitG2.id, { outcome: "NO_ORDER", noOrderReason: "Closed", photoExceptionReason: "OTHER" });
  const commsG2 = await listRetailerCommunications(db, { retailerId: retailerNoMobile.id });
  assert(commsG2.length === 1 && commsG2[0].status === "FAILED" && commsG2[0].lastErrorCode === "MOBILE_UNAVAILABLE", "expected a MOBILE_UNAVAILABLE-audited, not-queued event for a no-mobile retailer");
  console.log("[Test G, part 2] OK — no-mobile retailer: checkout succeeded, event audited as MOBILE_UNAVAILABLE (not queued, not dropped silently)");

  // ---------------- Scenario B: End Day double-submit rejected cleanly ----------------
  let secondEndDayRejectedCleanly = false;
  await endFieldDay(db, exec.id, session1.id, { outcome: "COMPLETED" });
  try {
    await endFieldDay(db, exec.id, session1.id, { outcome: "COMPLETED" });
  } catch (error) {
    secondEndDayRejectedCleanly = error instanceof FoundationError && error.code === "WORKDAY_NOT_ACTIVE";
  }
  assert(secondEndDayRejectedCleanly, "expected a second End Day call on an already-ended session to fail cleanly with WORKDAY_NOT_ACTIVE, not crash");
  console.log("[Test B] OK — double End Day rejected cleanly with WORKDAY_NOT_ACTIVE (client-side fix stops the race from firing; this proves the server-side floor also holds)");

  // ---------------- Scenario C: Day-1 -> Day-2 rollover ----------------
  const day1Order = await db.seeraSalesOrder.count({ where: { idempotencyKey: { in: [`c2-e-order-${uniqueSuffix}`, `c2-e-order2-${uniqueSuffix}`] } } });
  assert(day1Order === 2, "expected Day 1's 2 orders to exist as historical records");

  const session2 = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", remarks: "Closure pass 2 smoke — Day 2" });
  assert(session2.id !== session1.id, "expected Day 2 to be a genuinely distinct work session");
  const retailerC = await createRetailer(db, exec.id, { businessName: `Closure2 Shop C ${uniqueSuffix}`, address: { area: "Area C" }, idempotencyKey: `c2-c-${uniqueSuffix}` });
  const visitC = await executiveCheckIn(db, exec.id, { workSessionId: session2.id, retailerId: retailerC.id, idempotencyKey: `c2-c-checkin-${uniqueSuffix}` });
  await executiveCheckOut(db, exec.id, visitC.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER" });
  await endFieldDay(db, exec.id, session2.id, { outcome: "COMPLETED" });

  const history = await executiveDsrHistory(db, exec.id, { take: 5 });
  const day1Entry = history.find((h) => h.session.id === session1.id);
  const day2Entry = history.find((h) => h.session.id === session2.id);
  assert(day1Entry && day2Entry, "expected both Day 1 and Day 2 sessions to appear in work history");
  assert(day1Entry!.visited === 2, `expected Day 1 history to still show its own 2 visits, got ${day1Entry!.visited}`);
  assert(day2Entry!.visited === 1, `expected Day 2 history to show only its own 1 visit (no Day 1 bleed), got ${day2Entry!.visited}`);
  console.log(`[Test C] OK — Day 1 history intact (visited=${day1Entry!.visited}), Day 2 started clean (visited=${day2Entry!.visited}), distinct sessions`);

  console.log("\nALL CLOSURE-PASS-2 SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
