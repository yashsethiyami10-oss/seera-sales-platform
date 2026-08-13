import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";
import {
  managerRetailerCheckIn,
  managerRetailerCheckOut,
  managerBookRetailerOrder,
  managerPartnerCheckIn,
  managerPartnerCheckOut,
  startJointWorking,
  closeJointWorking,
  jointWorkLinkedActivity,
  createDistributorProspect,
  updateDistributorProspect,
  prospectTimeline,
  managerSalesAttribution,
  managerEndDaySummary,
  managerDashboardSummary,
} from "../../lib/sales-distribution/manager-service";
import { createBeatPlan, duplicateBeatPlan } from "../../lib/sales-distribution/operational-service";
import { submitTaClaim } from "../../lib/sales-distribution/travel-lifecycle-service";

// TEST-only, live end-to-end smoke test for the Sales Manager Founder-UAT remediation flow.
// Safe to re-run (idempotent where the underlying service functions are).

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
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const hq = await db.seeraHqConfiguration.findFirstOrThrow({ where: { name: "IV26-HQ-TEST" } });
  const hqPoint = { latitude: Number(hq.latitude), longitude: Number(hq.longitude) };
  const fieldPoint = { latitude: hqPoint.latitude + 0.004, longitude: hqPoint.longitude + 0.002 };
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 2 });
  assert(skus.length >= 2, "expected >=2 seeded SKUs");
  const distributor = await db.seeraPartner.findFirstOrThrow({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });

  // Clean up any dangling ACTIVE session/open visit/open joint-work from a prior run.
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: manager.id, status: "ACTIVE" }, checkedOutAt: null } });
  if (openVisit) await managerRetailerCheckOut(db, manager.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const openJoint = await db.seeraJointWork.findFirst({ where: { managerId: manager.id, endedAt: null } });
  if (openJoint) await closeJointWorking(db, manager.id, openJoint.id, { observations: "cleanup", coaching: "cleanup" });
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: manager.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, manager.id, dangling.id, { outcome: "COMPLETED", ...hqPoint });

  // 1) Start Day.
  const session = await startFieldDay(db, manager.id, { employeeRole: "SALES_MANAGER", workingType: "RETAILING", ...hqPoint, remarks: "Smoke test" });
  assert(session.startInsideGeofence === true, `expected startInsideGeofence=true, got ${session.startInsideGeofence}`);
  console.log("[1/12] Start Day OK");

  // 2) Beat Planner — free-text Territory/Beat/Geography, auto-created, then duplicated.
  const uniqueSuffix = Date.now();
  const plan = await createBeatPlan(db, manager.id, {
    employeeId: executive.id,
    territoryName: `Smoke Territory ${uniqueSuffix}`,
    beatName: `Smoke Beat ${uniqueSuffix}`,
    geographyType: "TOWN",
    geographyName: `Smoke Town ${uniqueSuffix}`,
    dayOfWeek: new Date().getDay(),
    effectiveFrom: new Date(Date.now() + 86_400_000),
    publish: true,
  });
  assert(plan.status === "PUBLISHED", `expected PUBLISHED, got ${plan.status}`);
  const territoryNode = await db.seeraGeographyNode.findFirst({ where: { name: `Smoke Territory ${uniqueSuffix}`, level: "TERRITORY" } });
  assert(!!territoryNode, "expected auto-created TERRITORY geography node");
  const duplicate = await duplicateBeatPlan(db, manager.id, plan.id, { effectiveFrom: new Date(Date.now() + 2 * 86_400_000) });
  assert(duplicate.status === "DRAFT", `expected duplicate to be DRAFT, got ${duplicate.status}`);
  console.log("[2/12] Beat Planner OK — auto-created geography + duplicated as draft");

  // 3) Manager Own Retailing — Add Customer on the fly.
  const shopName = `Manager Smoke Shop ${uniqueSuffix}`;
  const visit = await managerRetailerCheckIn(db, manager.id, {
    workSessionId: session.id,
    newRetailer: { businessName: shopName, address: { area: "Smoke Area" }, distributorId: distributor.id },
    ...fieldPoint,
    idempotencyKey: `mgr-checkin-${uniqueSuffix}`,
  });
  const createdRetailer = await db.seeraRetailer.findFirstOrThrow({ where: { businessName: shopName } });
  assert(createdRetailer.source === "UNPLANNED_FIELD_ADDED", "expected Manager-added retailer to be UNPLANNED_FIELD_ADDED");
  console.log("[3/12] Manager Add Customer OK — visitId:", visit.id);

  // 4) Order with CASH payment type — booking the order also closes the visit (its own checkout).
  const order = await managerBookRetailerOrder(db, manager.id, {
    visitId: visit.id,
    lines: [{ skuId: skus[0]!.id, quantity: 2 }, { skuId: skus[1]!.id, quantity: 1 }],
    commercialPaymentType: "CASH",
    photoExceptionReason: "CAMERA_ISSUE",
    ...fieldPoint,
    idempotencyKey: `mgr-order-${uniqueSuffix}`,
  });
  assert(order.sourcePortal === "sales-manager", `expected sourcePortal=sales-manager, got ${order.sourcePortal}`);
  assert(order.commercialPaymentType === "CASH", `expected CASH, got ${order.commercialPaymentType}`);
  const closedVisit = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
  assert(closedVisit.checkedOutAt != null, "expected booking the order to close the visit");
  console.log("[4/12] Manager order OK — total:", order.total, "paymentType:", order.commercialPaymentType);
  console.log("[5/12] Manager retailer checkout OK (folded into order booking)");

  // 6) Distributor/S.S. visit — add new party on the fly.
  const partnerVisit = await managerPartnerCheckIn(db, manager.id, {
    workSessionId: session.id,
    partnerType: "DISTRIBUTOR",
    newParty: { businessName: `Smoke Distributor ${uniqueSuffix}`, area: "Smoke District" },
    purpose: "STOCK_REVIEW",
    ...fieldPoint,
    idempotencyKey: `mgr-partner-checkin-${uniqueSuffix}`,
  });
  assert(!!partnerVisit.prospectId, "expected field-added party to be a prospect");
  // Photo is mandatory-by-default for a partner visit — checkout without a photo or an exception
  // reason must be refused, proving the gate actually fires (not just present in code).
  let gateFired = false;
  try {
    await managerPartnerCheckOut(db, manager.id, partnerVisit.id, { outcome: "PRODUCTIVE", ...fieldPoint });
  } catch (error) {
    gateFired = error instanceof Error && error.message.includes("Add a photo");
  }
  assert(gateFired, "expected mandatory-photo gate to refuse checkout with no photo and no exception reason");
  await managerPartnerCheckOut(db, manager.id, partnerVisit.id, { outcome: "PRODUCTIVE", notes: "Stock discussed", nextAction: "Follow up next week", photoExceptionReason: "CAMERA_ISSUE", ...fieldPoint });
  console.log("[6/12] Distributor/S.S. add-on-fly visit + mandatory-photo-exception gate OK");

  // 7) Joint Working — objective at start, no visit-picking at close, linked activity read.
  const joint = await startJointWorking(db, manager.id, { salesExecutiveId: executive.id, objective: "COACHING" });
  const linked = await jointWorkLinkedActivity(db, manager.id, joint.id);
  assert(typeof linked.shopsVisited === "number", "expected jointWorkLinkedActivity to return shopsVisited");
  const closed = await closeJointWorking(db, manager.id, joint.id, { observations: "Good energy in market", coaching: "Focus on new outlets" });
  assert(closed.creditedEmployeeId === executive.id, `expected creditedEmployeeId=${executive.id}, got ${closed.creditedEmployeeId}`);
  console.log("[7/12] Joint Working OK — no visit-picking required, linked activity read, credited to Executive");

  // 8) Distributor Search — create prospect, advance stage, verify timeline.
  const prospectMobile = `8${Date.now().toString().slice(-9)}`;
  const prospect = await createDistributorProspect(db, manager.id, {
    businessName: `Smoke Prospect ${uniqueSuffix}`,
    mobile: prospectMobile,
    geographyType: "CITY",
    existingBrands: "CompetitorX",
    expectedVolume: "500 units/month",
    sampleGiven: true,
    sampleDetails: "2 units given",
    notes: "Discussion notes from smoke test",
    profile: {},
  });
  assert(prospect.stage === "NEW", `expected stage=NEW, got ${prospect.stage}`);
  await updateDistributorProspect(db, manager.id, prospect.id, { stage: "CONTACTED", notes: "Called once" });
  const timeline = await prospectTimeline(db, manager.id, prospect.id);
  assert(timeline.events.length >= 2, `expected >=2 timeline events, got ${timeline.events.length}`);
  assert(timeline.prospect.stage === "CONTACTED", `expected stage=CONTACTED, got ${timeline.prospect.stage}`);
  console.log("[8/12] Distributor Search CRM OK — stage progression + timeline:", timeline.events.length, "events");

  // 9) Sales attribution — Manager's own order must NOT appear in Team bucket.
  const attribution = await managerSalesAttribution(db, manager.id, { dateFrom: new Date(Date.now() - 86_400_000) });
  assert(attribution.managerOwn.orderCount >= 1, `expected managerOwn.orderCount>=1, got ${attribution.managerOwn.orderCount}`);
  const territorySum = attribution.team.bookedValue + attribution.managerOwn.bookedValue;
  assert(Math.abs(attribution.territory.bookedValue - territorySum) < 0.01, "expected territory = team + managerOwn exactly");
  console.log("[9/12] Sales attribution OK — team:", attribution.team.bookedValue, "managerOwn:", attribution.managerOwn.bookedValue, "territory:", attribution.territory.bookedValue);

  await sleep(25_000);

  // 10) End Day — real GPS distance, End Day summary.
  await endFieldDay(db, manager.id, session.id, { outcome: "COMPLETED", ...hqPoint });
  const summary = await managerEndDaySummary(db, manager.id, session.id);
  assert(summary.retailerVisits >= 1, `expected retailerVisits>=1, got ${summary.retailerVisits}`);
  assert(summary.distributorVisits >= 1, `expected distributorVisits>=1, got ${summary.distributorVisits}`);
  assert(summary.executivesWorkedWith.length >= 1, "expected executivesWorkedWith to include the joint-work Executive");
  console.log("[10/12] End Day summary OK — retailerVisits:", summary.retailerVisits, "distributorVisits:", summary.distributorVisits, "distanceKm:", summary.distanceKm);

  // 11) Manager Own TA claim — GPS-derived distance, hotel stay.
  const claim = await submitTaClaim(db, manager.id, {
    workSessionId: session.id,
    vehicleType: "STANDARD_FIELD",
    claimedDistanceKm: summary.distanceKm ?? 0,
    tollAmount: 20,
    parkingAmount: 10,
    dailyAllowance: 0,
    purpose: "Field visit",
    fromLocation: "HQ",
    toLocation: "Smoke Territory",
    hotelStay: true,
    hotelName: "Smoke Hotel",
    hotelAmount: 1200,
    otherExpenseAmount: 0,
    proofFileIds: [],
    idempotencyKey: `mgr-ta-${uniqueSuffix}`,
  });
  assert(claim.hotelStay === true, "expected hotelStay=true");
  assert(Number(claim.totalClaimed) >= 1200, `expected totalClaimed to include hotel amount, got ${claim.totalClaimed}`);
  console.log("[11/12] Manager Own TA claim OK — totalClaimed:", claim.totalClaimed.toString(), "(includes ₹1200 hotel)");

  // 12) Dashboard summary computes without error.
  const dashboard = await managerDashboardSummary(db, manager.id);
  assert(typeof dashboard.today.active === "number", "expected dashboard.today.active to be a number");
  console.log("[12/12] Manager Dashboard summary OK — today:", dashboard.today, "territory:", dashboard.territory);

  console.log("\nALL MANAGER SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
