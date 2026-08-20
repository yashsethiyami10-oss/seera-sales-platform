import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only validation of the EXACT transaction mechanics the production cleanup script
// (cleanup-test-retailer-data-production.ts) will run — proves the detach/cancel/dead-letter/delete
// sequence works against real FK constraints before it is ever pointed at production. Creates its
// own disposable retailer/visit/order/outbox fixtures, cleans them up, and verifies the end state.

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

let pass = 0, fail = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (cond) { pass++; console.log(`  PASS: ${message}`); } else { fail++; console.error(`  FAIL: ${message}`); }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const run = Date.now().toString(36);

  // --- Setup: a fresh, disposable "test retailer" fixture matching the production shape ---
  // Close any dangling open visit from a previous (interrupted) run of this exact script first —
  // this script deliberately leaves ITS OWN visit open to exercise the "close the one open visit"
  // branch, so a prior partial run needs explicit cleanup before a fresh one can start.
  const openFromPriorRun = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id }, checkedOutAt: null } });
  if (openFromPriorRun) {
    // The visit's own work session may have already been ended by a prior run's endFieldDay call
    // (orphaned-session case) — executiveCheckOut requires workSession.status==="ACTIVE" and would
    // throw VISIT_SCOPE_DENIED here, so fall back to a direct close for this TEST-fixture-only repair.
    await executiveCheckOut(db, exec.id, openFromPriorRun.id, { outcome: "NO_ORDER", noOrderReason: "Smoke re-run cleanup", photoExceptionReason: "OTHER" }).catch(() =>
      db.seeraVisit.update({ where: { id: openFromPriorRun.id }, data: { checkedOutAt: new Date(), outcome: "NO_ORDER" } }),
    );
  }
  const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED" }).catch(() => {});
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 1 });
  const authorized = await (await import("../../lib/sales-distribution/scope")).executiveAuthorizedDistributors(db, exec.id);
  const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]?.id, remarks: "Cleanup mechanics smoke" });
  const created = await createRetailerAndCheckIn(db, exec.id, {
    businessName: `Cleanup Mechanics Test Shop ${run}`,
    address: { area: "Smoke" },
    mobile: `93${String(Date.now()).slice(-8)}`,
    workSessionId: session.id,
    idempotencyKey: `cleanup-mech-retailer-${run}`,
    checkInIdempotencyKey: `cleanup-mech-checkin-${run}`,
  });
  const retailerId = created.retailer.id;
  const order = await placeRetailerOrder(
    db,
    { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: created.retailer.distributorId ?? "" },
    { retailerId, idempotencyKey: `cleanup-mech-order-${run}`, lines: [{ skuId: skus[0]!.id, quantity: 1, rate: 60 }], source: "FIELD_VISIT", visitId: created.visit.id },
  );
  // Leave the visit OPEN deliberately (don't check out) — this fixture must exercise the
  // "close the one open visit" branch, matching the real production scenario (Awdhesh kirana).
  const outboxBefore = await db.outboxEvent.findMany({ where: { aggregateType: "SeeraRetailer", aggregateId: retailerId } });
  console.log(`[setup] retailer=${retailerId} order=${order.id} openVisit=${created.visit.id} outboxRows=${outboxBefore.length}`);

  // --- Run the EXACT same transaction shape the production script uses ---
  const openVisits = await db.seeraVisit.findMany({ where: { retailerId, checkedOutAt: null } });
  const outboxPendingFailed = await db.outboxEvent.findMany({ where: { aggregateType: "SeeraRetailer", aggregateId: retailerId, status: { in: ["PENDING", "FAILED"] } } });

  const result = await db.$transaction(async (tx) => {
    const closedVisits = await tx.seeraVisit.updateMany({
      where: { id: { in: openVisits.map((v) => v.id) } },
      data: { checkedOutAt: new Date(), outcome: "NO_ORDER", noOrderReason: "Administrative cleanup smoke test", photoExceptionReason: "OTHER" },
    });
    const detachedVisits = await tx.seeraVisit.updateMany({ where: { retailerId }, data: { retailerId: null } });
    const detachedPhotos = await tx.seeraVisitPhoto.updateMany({ where: { retailerId }, data: { retailerId: null } });
    const cancelledOrders = await tx.seeraSalesOrder.updateMany({ where: { retailerId }, data: { retailerId: null, status: "CANCELLED" } });
    const deadLetteredOutbox = await tx.outboxEvent.updateMany({ where: { id: { in: outboxPendingFailed.map((o) => o.id) } }, data: { status: "DEAD_LETTER", lastErrorCode: "CANCELLED_TEST_RETAILER_CLEANUP" } });
    const deletedRetailers = await tx.seeraRetailer.deleteMany({ where: { id: retailerId } });
    return { closedVisits: closedVisits.count, detachedVisits: detachedVisits.count, detachedPhotos: detachedPhotos.count, cancelledOrders: cancelledOrders.count, deadLetteredOutbox: deadLetteredOutbox.count, deletedRetailers: deletedRetailers.count };
  });
  console.log("[transaction result]", JSON.stringify(result));

  console.log("\n=== Verify end state ===");
  assert(result.closedVisits === 1, "the one open visit was closed");
  assert(result.deletedRetailers === 1, "retailer row was deleted");
  const retailerAfter = await db.seeraRetailer.findUnique({ where: { id: retailerId } });
  assert(retailerAfter === null, "retailer no longer exists");
  const visitAfter = await db.seeraVisit.findUniqueOrThrow({ where: { id: created.visit.id } });
  assert(visitAfter.retailerId === null, "visit still exists but is detached (retailerId null) — preserved as history");
  assert(!!visitAfter.checkedOutAt, "visit is closed (checkedOutAt set)");
  const orderAfter = await db.seeraSalesOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(orderAfter.retailerId === null && orderAfter.status === "CANCELLED", "order still exists but is detached + CANCELLED — preserved as history");
  const outboxAfter = await db.outboxEvent.findMany({ where: { id: { in: outboxPendingFailed.map((o) => o.id) } } });
  assert(outboxAfter.every((o) => o.status === "DEAD_LETTER"), "all pending/failed outbox rows for this retailer are now DEAD_LETTER");

  // Confirm the retailer is genuinely unfindable by name search post-cleanup (the actual Founder-
  // visible requirement) even though the order/visit rows still physically exist.
  const searchHit = await db.seeraRetailer.findFirst({ where: { businessName: { contains: `Cleanup Mechanics Test Shop ${run}` } } });
  assert(searchHit === null, "retailer name is no longer findable via retailer search");

  console.log(`\n\n========== RESULT: ${pass} passed, ${fail} failed ==========`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
