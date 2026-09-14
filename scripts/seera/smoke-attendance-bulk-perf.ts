// Attendance export N+1 fix — proves the new bulk functions (bulkEmployeeMonthlyPerformance,
// bulkMonthlyActivityTimelines) return IDENTICAL data to the original per-employee functions they
// now share logic with, and measures the wall-clock win for a multi-employee month. Safe to re-run:
// creates its own throwaway employees + fixtures per run, against TEST DB only.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  employeeMonthlyPerformance,
  bulkEmployeeMonthlyPerformance,
  dailyActivityTimeline,
  bulkMonthlyActivityTimelines,
  istBusinessDayStart,
} from "../../lib/sales-distribution/attendance-service";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const production = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓", msg);
}

async function main() {
  const suffix = Date.now().toString(36);
  const role = await db.role.findUnique({ where: { code: "SALES_EXECUTIVE" } });
  if (!role) throw new Error("SALES_EXECUTIVE role not found — run the review-user seed first");
  const founder = await db.user.findFirst({ where: { email: "review-founder@seera.test" } });
  if (!founder) throw new Error("review-founder@seera.test not found — run npm run seed:seera:review-users first");

  const YEAR = 2026, MONTH = 8; // A month distinct from the Sept 2026 fixture month used elsewhere.
  const dayIst = (day: number) => istBusinessDayStart(new Date(Date.UTC(YEAR, MONTH - 1, day, 6)));

  console.log("=== Fixtures: 3 employees with real sessions/visits/orders/photos across the month ===");
  const employeeIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const emp = await db.user.create({ data: { email: `attn-bulk-${suffix}-${i}@seera.test`, normalizedEmail: `attn-bulk-${suffix}-${i}@seera.test`, name: `Bulk Fixture ${i}`, passwordHash: "x", status: "ACTIVE" } });
    await db.userRoleAssignment.create({ data: { userId: emp.id, roleId: role.id, status: "ACTIVE" } });
    employeeIds.push(emp.id);
    const workDays = [3 + i, 10 + i, 17 + i];
    for (const day of workDays) {
      const dayStart = dayIst(day);
      const session = await db.seeraWorkSession.create({
        data: { employeeId: emp.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(dayStart.getTime() + 4 * 3600_000), status: "ENDED", endedAt: new Date(dayStart.getTime() + 9 * 3600_000) },
      });
      const retailer = await db.seeraRetailer.create({
        data: { code: `BULK-${suffix}-${i}-${day}`, address: {}, businessName: `Bulk Retailer ${suffix}-${i}-${day}`, salespersonId: emp.id, createdById: founder.id, lifecycle: "ACTIVE", source: "UNPLANNED_FIELD_ADDED", createdAt: dayStart },
      });
      await db.seeraVisit.create({
        data: { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `bulk-visit-${suffix}-${i}-${day}`, checkedInAt: new Date(dayStart.getTime() + 4.5 * 3600_000), checkedOutAt: new Date(dayStart.getTime() + 5 * 3600_000), outcome: "PRODUCTIVE" },
      });
      await db.seeraSalesOrder.create({
        data: {
          orderNumber: `BULK-${suffix}-${i}-${day}`,
          idempotencyKey: `bulk-idem-${suffix}-${i}-${day}`,
          type: "RETAILER_ORDER",
          salespersonId: emp.id,
          retailerId: retailer.id,
          actorId: emp.id,
          commercialPartyType: "RETAILER",
          commercialPartyId: retailer.id,
          sourcePortal: "sales-executive",
          subtotal: 1000 + day,
          discountTotal: 0,
          taxTotal: 0,
          total: 1000 + day,
          createdAt: new Date(dayStart.getTime() + 4.7 * 3600_000),
        },
      });
      const visitForPhoto = await db.seeraVisit.findFirstOrThrow({ where: { workSessionId: session.id } });
      await db.seeraVisitPhoto.create({
        data: { actorId: emp.id, visitId: visitForPhoto.id, photoType: "SHOP_FRONT", capturedAt: new Date(dayStart.getTime() + 4.6 * 3600_000), secureUrl: "https://example.test/x.jpg" },
      });
    }
  }

  console.log("\n=== bulkEmployeeMonthlyPerformance matches employeeMonthlyPerformance per employee ===");
  const t1 = Date.now();
  for (const empId of employeeIds) await employeeMonthlyPerformance(db, founder.id, empId, YEAR, MONTH);
  const sequentialPerfMs = Date.now() - t1;

  const t2 = Date.now();
  const bulkPerf = await bulkEmployeeMonthlyPerformance(db, founder.id, employeeIds, YEAR, MONTH);
  const bulkPerfMs = Date.now() - t2;

  for (const empId of employeeIds) {
    const single = await employeeMonthlyPerformance(db, founder.id, empId, YEAR, MONTH);
    const bulk = bulkPerf.get(empId);
    assert(JSON.stringify(single) === JSON.stringify(bulk), `employee ${empId}: bulk performance matches single-employee performance exactly`);
    assert(single.customerVisits === 3, `employee ${empId} has exactly 3 recorded visits (fixture invariant)`);
  }
  console.log(`  (sequential single-employee calls: ${sequentialPerfMs}ms for ${employeeIds.length} employees, bulk: ${bulkPerfMs}ms)`);

  console.log("\n=== bulkMonthlyActivityTimelines matches dailyActivityTimeline per employee/day ===");
  const bulkTimelines = await bulkMonthlyActivityTimelines(db, founder.id, employeeIds, YEAR, MONTH);
  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]!;
    const workDays = [3 + i, 10 + i, 17 + i];
    for (const day of workDays) {
      const single = await dailyActivityTimeline(db, founder.id, empId, dayIst(day));
      const bulk = bulkTimelines.get(`${empId}|${day}`);
      assert(Boolean(bulk), `employee ${empId} day ${day}: bulk timeline entry exists`);
      assert(JSON.stringify(single.events) === JSON.stringify(bulk?.events), `employee ${empId} day ${day}: bulk events match single-day events exactly`);
      assert(single.hasAnyData === true && bulk?.hasAnyData === true, `employee ${empId} day ${day}: both report real activity`);
    }
  }

  console.log("\n=== A day with no activity is absent from the bulk map (never a fabricated empty entry) ===");
  const emptyKey = `${employeeIds[0]}|1`;
  assert(!bulkTimelines.has(emptyKey) || bulkTimelines.get(emptyKey)?.hasAnyData === false, "no-activity day is either absent or explicitly hasAnyData:false");

  console.log("\nALL BULK-VS-SINGLE EQUIVALENCE ASSERTIONS PASSED.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
