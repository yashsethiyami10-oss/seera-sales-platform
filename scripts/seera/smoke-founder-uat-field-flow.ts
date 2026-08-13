import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailer, executiveCheckIn, executiveCheckOut, capturePhoto, createFollowUp, executiveDsr } from "../../lib/sales-distribution/field-portal-service";
import { createDistributorProspect } from "../../lib/sales-distribution/manager-service";
import { executiveTaDaMonthlySummary } from "../../lib/sales-distribution/field-travel-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live end-to-end smoke test for the Sales Executive Founder-UAT remediation flow:
// Start Day (inside HQ) -> Add Customer (unplanned, minimal fields) -> duplicate-name collision
// (proves the fix to safeError/FoundationError.details) -> Check-in -> multi-line CASH order ->
// Photo -> Follow-up -> Checkout -> End Day (returns to HQ) -> DSR -> monthly TA/DA read model ->
// Distributor Search prospect duplicate-save (proves the "internal error" fix still holds).
// Asserts real values, not just "did not throw". Safe to re-run (idempotent where the underlying
// service functions are; a fresh order/retailer/visit is created each run by design).

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  // Uses executive-2, not executive-1: the scale-to-90 supplement fixture leaves an orphaned open
  // visit under an already-ENDED session for executive-1 (created by a raw db.create, bypassing
  // executiveCheckOut), which the normal checkout path can never resolve — a pre-existing TEST
  // fixture quirk, not something this smoke test should paper over with a raw DB write.
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });
  const hq = await db.seeraHqConfiguration.findFirstOrThrow({ where: { name: "IV26-HQ-TEST" } });
  const hqPoint = { latitude: Number(hq.latitude), longitude: Number(hq.longitude) };
  // A field point ~550m from HQ (well inside the 500m radius's neighborhood but off-center) so
  // the GPS trail Start->CheckIn->CheckOut->End has real, non-zero segments to sum — proving
  // eligibleGpsDistanceKm sums the actual route rather than collapsing to a single point.
  const fieldPoint = { latitude: hqPoint.latitude + 0.005, longitude: hqPoint.longitude + 0.003 };
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 2 });
  assert(skus.length >= 2, "expected >=2 seeded SKUs");

  // Clean up any dangling ACTIVE session left over from a prior run of this smoke script
  // (executiveCheckIn refuses a new check-in system-wide while any visit is still open).
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" }, checkedOutAt: null } });
  if (openVisit) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke test cleanup", photoExceptionReason: "OTHER", ...hqPoint, accuracy: 8 });
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED", ...hqPoint, accuracy: 8 });

  // 1) Start Day — inside HQ geofence.
  const session = await startFieldDay(db, exec.id, {
    employeeRole: "SALES_EXECUTIVE",
    workingType: "RETAILING",
    ...hqPoint,
    accuracy: 8,
    remarks: "Smoke test",
  });
  assert(session.startInsideGeofence === true, `expected startInsideGeofence=true, got ${session.startInsideGeofence}`);
  console.log("[1/11] Start Day OK — startInsideGeofence:", session.startInsideGeofence);

  // 2) Add Customer — mandatory-only fields, immediately usable (UNPLANNED_FIELD_ADDED source).
  const shopName = `Smoke Test Shop ${Date.now()}`;
  const retailer = await createRetailer(db, exec.id, {
    businessName: shopName,
    address: { area: "Smoke Test Area" },
    idempotencyKey: `smoke-retailer-${Date.now()}`,
  });
  assert(retailer.source === "UNPLANNED_FIELD_ADDED", `expected source=UNPLANNED_FIELD_ADDED, got ${retailer.source}`);
  assert(retailer.lifecycle === "ACTIVE", `expected lifecycle=ACTIVE, got ${retailer.lifecycle}`);
  assert(!!retailer.distributorId, "expected an auto-assigned distributor so the retailer is order-ready immediately");
  console.log("[2/11] Add Customer OK — source:", retailer.source, "distributorId:", retailer.distributorId);

  // 3) Duplicate-name collision surfaces real `similar` details (the bug FieldJourney.tsx's
  //    duplicate-warning UI depends on: FoundationError.details -> safeError -> API body.error.details).
  try {
    await createRetailer(db, exec.id, {
      businessName: shopName,
      address: { area: "Smoke Test Area" },
      idempotencyKey: `smoke-retailer-dup-${Date.now()}`,
    });
    throw new Error("expected SIMILAR_RETAILER_EXISTS to be thrown");
  } catch (error) {
    assert(error instanceof FoundationError, "expected a FoundationError");
    assert((error as FoundationError).code === "SIMILAR_RETAILER_EXISTS", `expected SIMILAR_RETAILER_EXISTS, got ${(error as FoundationError).code}`);
    const details = (error as FoundationError).details as { similar?: { businessName: string }[] } | undefined;
    assert(Array.isArray(details?.similar) && details!.similar!.length > 0, "expected FoundationError.details.similar to carry the collision list");
    console.log("[3/11] Duplicate collision OK — similar count:", details!.similar!.length);
  }

  // A real ~30s gap before Check-in and before End Day so the HQ<->field segments imply a
  // plausible travel speed (~650m in 30s is ~78km/h) instead of being excluded as GPS noise by
  // eligibleGpsDistanceKm's anti-spoofing speed filter (see business-rules.ts).
  await sleep(30_000);

  // 4) Check-in.
  const visit = await executiveCheckIn(db, exec.id, {
    workSessionId: session.id,
    retailerId: retailer.id,
    ...fieldPoint,
    accuracy: 8,
    idempotencyKey: `smoke-checkin-${Date.now()}`,
  });
  console.log("[4/11] Check-in OK — visitId:", visit.id);

  // 5) Multi-line CASH order — governed pricing, not user-entered rate.
  const order = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId! },
    {
      retailerId: retailer.id,
      idempotencyKey: `smoke-order-${Date.now()}`,
      commercialPaymentType: "CASH",
      lines: [
        { skuId: skus[0]!.id, quantity: 3 },
        { skuId: skus[1]!.id, quantity: 2 },
      ],
    },
  );
  const expectedTotal = order.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  assert(Math.abs(Number(order.total) - expectedTotal) < 0.01, `order.total ${order.total} !== sum(lineTotal) ${expectedTotal}`);
  assert(order.commercialPaymentType === "CASH", `expected CASH, got ${order.commercialPaymentType}`);
  console.log("[5/11] Order OK — total:", order.total, "lines:", order.lines.length, "paymentType:", order.commercialPaymentType);

  // 6) Photo — 1x1 PNG.
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const photo = await capturePhoto(db, exec.id, {
    visitId: visit.id,
    photoType: "SHOPFRONT",
    fileBase64: pngBase64,
    mimeType: "image/png",
    originalName: "smoke.png",
    idempotencyKey: `smoke-photo-${Date.now()}`,
  });
  console.log("[6/11] Photo OK — photoId:", photo.id);

  // 7) Follow-up.
  const followUp = await createFollowUp(db, exec.id, {
    type: "RETAIL_ORDER",
    retailerId: retailer.id,
    visitId: visit.id,
    dueDate: new Date(Date.now() + 3 * 86_400_000),
    priority: "NORMAL",
    note: "Smoke test follow-up",
    idempotencyKey: `smoke-followup-${Date.now()}`,
  });
  console.log("[7/11] Follow-up OK — id:", followUp.id);

  // 8) Checkout.
  await executiveCheckOut(db, exec.id, visit.id, {
    outcome: "ORDER_BOOKED",
    notes: "Smoke test checkout",
    ...fieldPoint,
    accuracy: 8,
  });
  console.log("[8/11] Checkout OK");

  await sleep(30_000);

  // 9) End Day — returns to HQ; recomputes GPS distance.
  await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", ...hqPoint, accuracy: 8 });
  const ended = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session.id } });
  assert(ended.returnedToHq === true, `expected returnedToHq=true, got ${ended.returnedToHq}`);
  const estimate = await db.seeraTravelEstimate.findUnique({ where: { employeeId_workSessionId: { employeeId: exec.id, workSessionId: session.id } } });
  assert(!!estimate, "expected a SeeraTravelEstimate row after End Day");
  assert(Number(estimate!.distanceKm) > 0, `expected a real non-zero GPS-derived distance (HQ->field->HQ route), got ${estimate!.distanceKm}`);
  console.log("[9/11] End Day OK — returnedToHq:", ended.returnedToHq, "distanceKm:", estimate?.distanceKm.toString());

  // 10) DSR reflects the new fields.
  const dsr = await executiveDsr(db, exec.id, session.id);
  assert(dsr.unplannedAdded >= 1, `expected unplannedAdded>=1, got ${dsr.unplannedAdded}`);
  assert(dsr.distanceTravelledKm != null, "expected distanceTravelledKm to be populated");
  assert(dsr.orders >= 1, `expected orders>=1, got ${dsr.orders}`);
  console.log("[10/11] DSR OK — unplannedAdded:", dsr.unplannedAdded, "distanceTravelledKm:", dsr.distanceTravelledKm, "gps:", dsr.gps);

  // 11) Monthly TA/DA read model — governed rate, no manual claim.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const taDa = await executiveTaDaMonthlySummary(db, exec.id, exec.id, monthStart, monthEnd);
  assert(taDa.ratePerKm === 2, `expected ratePerKm=2, got ${taDa.ratePerKm}`);
  assert(taDa.dailyAllowance === 150, `expected dailyAllowance=150, got ${taDa.dailyAllowance}`);
  const row = taDa.rows.find((r) => r.sessionId === session.id);
  assert(!!row, "expected today's session in the TA/DA summary");
  assert(row!.daEligible === true, "expected today's session to be DA-eligible (ended + had activity)");
  assert(row!.taAmount > 0, `expected a non-zero taAmount, got ${row!.taAmount}`);
  assert(Math.abs(row!.taAmount - row!.gpsDistanceKm * 2) < 0.01, "expected taAmount = gpsDistanceKm * 2");
  console.log("[11/11] TA/DA summary OK — ratePerKm:", taDa.ratePerKm, "dailyAllowance:", taDa.dailyAllowance, "row.taAmount:", row!.taAmount, "row.daAmount:", row!.daAmount);

  // Bonus: Distributor Search prospect duplicate-save still returns a real 409, not "An internal error occurred".
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const prospectMobile = `9${Date.now().toString().slice(-9)}`;
  await createDistributorProspect(db, manager.id, { businessName: "Smoke Prospect Co", mobile: prospectMobile, notes: "Discussion notes from smoke test", profile: {} });
  try {
    await createDistributorProspect(db, manager.id, { businessName: "Smoke Prospect Co", mobile: prospectMobile, notes: "dup", profile: {} });
    throw new Error("expected PROSPECT_ALREADY_EXISTS to be thrown");
  } catch (error) {
    assert(error instanceof FoundationError, "expected a FoundationError");
    assert((error as FoundationError).code === "PROSPECT_ALREADY_EXISTS", `expected PROSPECT_ALREADY_EXISTS, got ${(error as FoundationError).code}`);
    console.log("[bonus] Distributor Search duplicate-prospect OK — real 409, not a generic internal error");
  }

  console.log("\nALL SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
