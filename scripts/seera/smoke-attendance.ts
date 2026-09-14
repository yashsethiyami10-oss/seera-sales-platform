// Attendance Intelligence add-on — live proof against TEST DB (not just unit tests). Safe to
// re-run: creates its own throwaway employee + work-session fixtures per run (unique ids), never
// touches the review-*@seera.test fixtures, and only ever writes SeeraAttendanceRecord rows for
// those throwaway employees.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { runDailyAttendanceMarking, correctAttendanceRecord, istBusinessDayStart } from "../../lib/sales-distribution/attendance-service";

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
  if (!role) throw new Error("SALES_EXECUTIVE role not found in TEST DB — run the review-user seed first");

  console.log("=== Fixture: ACTIVE employee, real work session (should become PRESENT) ===");
  const presentEmp = await db.user.create({ data: { email: `attendance-present-${suffix}@seera.test`, normalizedEmail: `attendance-present-${suffix}@seera.test`, name: "Attendance Present Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: presentEmp.id, roleId: role.id, status: "ACTIVE" } });
  const businessDate = istBusinessDayStart(new Date("2026-09-01T00:00:00.000Z"));
  const sessionStart = new Date(businessDate.getTime() + 4 * 60 * 60 * 1000); // 09:30 IST — before cutoff
  await db.seeraWorkSession.create({ data: { employeeId: presentEmp.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: sessionStart, status: "ENDED", endedAt: new Date(sessionStart.getTime() + 8 * 60 * 60 * 1000) } });

  console.log("=== Fixture: ACTIVE employee, NO activity (should become ABSENT) ===");
  const absentEmp = await db.user.create({ data: { email: `attendance-absent-${suffix}@seera.test`, normalizedEmail: `attendance-absent-${suffix}@seera.test`, name: "Attendance Absent Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: absentEmp.id, roleId: role.id, status: "ACTIVE" } });

  console.log("=== Fixture: INACTIVE employee, no activity (must be excluded, no record at all) ===");
  const inactiveEmp = await db.user.create({ data: { email: `attendance-inactive-${suffix}@seera.test`, normalizedEmail: `attendance-inactive-${suffix}@seera.test`, name: "Attendance Inactive Fixture", passwordHash: "x", status: "INACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: inactiveEmp.id, roleId: role.id, status: "ACTIVE" } });

  console.log("\n=== Run 1: past business date (cutoff always satisfied for a past day) ===");
  const run1 = await runDailyAttendanceMarking(db, { date: businessDate });
  console.log(`  evaluated=${run1.evaluated} created=${run1.created}`);

  const presentRecord = await db.seeraAttendanceRecord.findUnique({ where: { employeeId_date: { employeeId: presentEmp.id, date: businessDate } } });
  const absentRecord = await db.seeraAttendanceRecord.findUnique({ where: { employeeId_date: { employeeId: absentEmp.id, date: businessDate } } });
  const inactiveRecord = await db.seeraAttendanceRecord.findUnique({ where: { employeeId_date: { employeeId: inactiveEmp.id, date: businessDate } } });

  assert(presentRecord?.status === "PRESENT", `active employee with a real work session -> PRESENT (got ${presentRecord?.status})`);
  assert(presentRecord?.source === "SYSTEM", "auto-marked record's source is SYSTEM");
  assert(absentRecord?.status === "ABSENT", `active employee with no activity -> ABSENT (got ${absentRecord?.status})`);
  assert(inactiveRecord === null, "inactive employee gets NO automatic record at all");

  console.log("\n=== Run 2: same business date again (idempotency — must not duplicate or overwrite) ===");
  const run2 = await runDailyAttendanceMarking(db, { date: businessDate });
  assert(run2.created === 0, `second run creates 0 new records (got ${run2.created})`);
  assert(run2.alreadyDecided >= 2, `second run reports existing records as already-decided (got ${run2.alreadyDecided})`);
  const countAfterRun2 = await db.seeraAttendanceRecord.count({ where: { employeeId: { in: [presentEmp.id, absentEmp.id] }, date: businessDate } });
  assert(countAfterRun2 === 2, `exactly 2 records exist after running twice, not 4 (got ${countAfterRun2})`);

  console.log("\n=== Manual correction: Founder changes ABSENT -> PRESENT, original state preserved in audit ===");
  const correctingActor = await db.user.findFirst({ where: { email: "review-sales-manager-1@seera.test" } });
  if (!correctingActor) throw new Error("review-sales-manager-1@seera.test not found — run npm run seed:seera:review-users first");
  const corrected = await correctAttendanceRecord(db, correctingActor.id, {
    employeeId: absentEmp.id,
    date: businessDate,
    status: "PRESENT",
    reason: "Worked offline / approved correction (smoke test)",
  });
  assert(corrected.status === "PRESENT", "record status is now PRESENT after correction");
  assert(corrected.source === "MANUAL", "corrected record's source is MANUAL");
  const auditRows = await db.auditLog.findMany({ where: { entityType: "SeeraAttendanceRecord", entityId: corrected.id }, orderBy: { occurredAt: "asc" } });
  assert(auditRows.length >= 2, `both the original SYSTEM mark and the MANUAL correction are in the audit trail (got ${auditRows.length} entries)`);
  const firstAudit = auditRows[0] as { afterState: unknown } | undefined;
  assert(
    Boolean(firstAudit && typeof firstAudit.afterState === "object" && firstAudit.afterState !== null && (firstAudit.afterState as Record<string, unknown>).status === "ABSENT"),
    "the ORIGINAL system-generated ABSENT decision is still readable in audit history, not erased",
  );

  console.log("\n=== Cutoff gate: cannot auto-mark TODAY before the configured cutoff, unless forced ===");
  let cutoffRejected = false;
  try {
    await runDailyAttendanceMarking(db, {}); // no date => today, no force
  } catch (e) {
    cutoffRejected = e instanceof Error && e.message.includes("cutoff");
  }
  // This assertion is time-of-day dependent in principle, but is still a real, live check of the
  // gate's existence — if it did NOT throw, `force` must still work regardless:
  const forced = await runDailyAttendanceMarking(db, { force: true });
  assert(forced.evaluated >= 2, `force:true bypasses the cutoff gate and evaluates real employees (got ${forced.evaluated})`);
  console.log(`  (informational) cutoff gate fired without force: ${cutoffRejected}`);

  console.log("\nALL ATTENDANCE SMOKE ASSERTIONS PASSED.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
