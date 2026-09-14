// Attendance Intelligence add-on — live proof of Sunday/Holiday/Leave rules + monthly reporting
// against TEST DB. Safe to re-run: creates its own throwaway employee + fixtures per run.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  runDailyAttendanceMarking,
  createHoliday,
  createLeaveRequest,
  decideLeaveRequest,
  founderMonthlyAttendanceSheet,
  employeeMonthlySummary,
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

  // A real, fixed test month: September 2026. Sept 6, 13, 20, 27 are IST Sundays.
  const YEAR = 2026, MONTH = 9;

  console.log("=== Fixture: employee who works a Sunday (real Start Day, not just a login) ===");
  const sundayWorker = await db.user.create({ data: { email: `attn-sunday-${suffix}@seera.test`, normalizedEmail: `attn-sunday-${suffix}@seera.test`, name: "Sunday Worker Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: sundayWorker.id, roleId: role.id, status: "ACTIVE" } });
  const sunday13 = istBusinessDayStart(new Date("2026-09-13T00:00:00.000Z"));
  await db.seeraWorkSession.create({ data: { employeeId: sundayWorker.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(sunday13.getTime() + 4 * 3600_000), status: "ENDED", endedAt: new Date(sunday13.getTime() + 10 * 3600_000) } });

  console.log("=== Fixture: employee who does NOT work a Sunday ===");
  const sundayOff = await db.user.create({ data: { email: `attn-sundayoff-${suffix}@seera.test`, normalizedEmail: `attn-sundayoff-${suffix}@seera.test`, name: "Sunday Off Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: sundayOff.id, roleId: role.id, status: "ACTIVE" } });

  console.log("=== Fixture: a company holiday (Sept 19, 2026 — not a Sunday) ===");
  const holidayDate = istBusinessDayStart(new Date("2026-09-19T00:00:00.000Z"));
  await createHoliday(db, founder.id, { date: holidayDate, name: "Founder Test Holiday" });
  const holidayWorker = await db.user.create({ data: { email: `attn-holiday-worked-${suffix}@seera.test`, normalizedEmail: `attn-holiday-worked-${suffix}@seera.test`, name: "Holiday Worked Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: holidayWorker.id, roleId: role.id, status: "ACTIVE" } });
  await db.seeraWorkSession.create({ data: { employeeId: holidayWorker.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(holidayDate.getTime() + 5 * 3600_000), status: "ENDED", endedAt: new Date(holidayDate.getTime() + 9 * 3600_000) } });
  const holidayOff = await db.user.create({ data: { email: `attn-holiday-off-${suffix}@seera.test`, normalizedEmail: `attn-holiday-off-${suffix}@seera.test`, name: "Holiday Off Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: holidayOff.id, roleId: role.id, status: "ACTIVE" } });

  console.log("=== Fixture: approved leave on Sept 21, 2026 (a Monday) ===");
  const leaveDate = istBusinessDayStart(new Date("2026-09-21T00:00:00.000Z"));
  const onLeaveEmp = await db.user.create({ data: { email: `attn-leave-${suffix}@seera.test`, normalizedEmail: `attn-leave-${suffix}@seera.test`, name: "Leave Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: onLeaveEmp.id, roleId: role.id, status: "ACTIVE" } });
  const leaveReq = await createLeaveRequest(db, founder.id, { employeeId: onLeaveEmp.id, startDate: leaveDate, endDate: leaveDate, reason: "Family function" });
  await decideLeaveRequest(db, founder.id, { id: leaveReq.id, status: "APPROVED" });

  console.log("=== Fixture: PENDING leave (must NOT auto-become ON_LEAVE) on Sept 22, 2026 ===");
  const pendingLeaveDate = istBusinessDayStart(new Date("2026-09-22T00:00:00.000Z"));
  const pendingLeaveEmp = await db.user.create({ data: { email: `attn-pending-leave-${suffix}@seera.test`, normalizedEmail: `attn-pending-leave-${suffix}@seera.test`, name: "Pending Leave Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: pendingLeaveEmp.id, roleId: role.id, status: "ACTIVE" } });
  await createLeaveRequest(db, founder.id, { employeeId: pendingLeaveEmp.id, startDate: pendingLeaveDate, endDate: pendingLeaveDate, reason: "Requested but not yet decided" });

  const allFixtureIds = [sundayWorker.id, sundayOff.id, holidayWorker.id, holidayOff.id, onLeaveEmp.id, pendingLeaveEmp.id];

  console.log("\n=== Run marking for each relevant date ===");
  for (const date of [sunday13, holidayDate, leaveDate, pendingLeaveDate]) {
    await runDailyAttendanceMarking(db, { date, force: true });
  }

  const recAt = async (empId: string, date: Date) => db.seeraAttendanceRecord.findUnique({ where: { employeeId_date: { employeeId: empId, date } } });

  assert((await recAt(sundayWorker.id, sunday13))?.status === "PRESENT", "Sunday + real Start Day -> PRESENT");
  assert((await recAt(sundayWorker.id, sunday13))?.offDayWorked === "SUNDAY_WORKED", "...flagged as SUNDAY_WORKED");
  assert((await recAt(sundayOff.id, sunday13))?.status === "WEEK_OFF", "Sunday + no activity -> WEEK_OFF (never ABSENT)");

  assert((await recAt(holidayWorker.id, holidayDate))?.status === "PRESENT", "Holiday + approved work -> PRESENT");
  assert((await recAt(holidayWorker.id, holidayDate))?.offDayWorked === "HOLIDAY_WORKED", "...flagged as HOLIDAY_WORKED");
  const holidayOffRecord = await recAt(holidayOff.id, holidayDate);
  assert(holidayOffRecord?.status === "HOLIDAY", `Holiday + no work -> HOLIDAY, never ABSENT (got ${holidayOffRecord?.status})`);
  assert(Boolean(holidayOffRecord?.reason.includes("Founder Test Holiday")), "holiday classification (name) is preserved in the reason, not silently destroyed");

  const leaveRecord = await recAt(onLeaveEmp.id, leaveDate);
  assert(leaveRecord?.status === "ON_LEAVE", `Approved leave -> ON_LEAVE (got ${leaveRecord?.status})`);
  const pendingRecord = await recAt(pendingLeaveEmp.id, pendingLeaveDate);
  assert(pendingRecord?.status === "ABSENT", `PENDING leave does NOT become ON_LEAVE — falls through to normal ABSENT logic (got ${pendingRecord?.status})`);

  console.log("\n=== Idempotency: re-run all four dates again ===");
  // Every eligible employee is evaluated on EVERY date the job runs for (eligibility isn't
  // date-specific) — so 6 fixtures x 4 dates = 24 total records is the CORRECT first-pass count,
  // not a bug. The real idempotency check is: does a SECOND run for the SAME dates add any more.
  const countBeforeRerun = await db.seeraAttendanceRecord.count({ where: { employeeId: { in: allFixtureIds } } });
  for (const date of [sunday13, holidayDate, leaveDate, pendingLeaveDate]) {
    await runDailyAttendanceMarking(db, { date, force: true });
  }
  const countAfterRerun = await db.seeraAttendanceRecord.count({ where: { employeeId: { in: allFixtureIds } } });
  assert(countAfterRerun === countBeforeRerun, `re-running the same 4 dates adds ZERO new records (before=${countBeforeRerun}, after=${countAfterRerun})`);

  console.log("\n=== Monthly sheet aggregation matches daily records ===");
  const sheet = await founderMonthlyAttendanceSheet(db, founder.id, { year: YEAR, month: MONTH, employeeIds: allFixtureIds });
  const sundayWorkerRow = sheet.rows.find((r) => r.employeeId === sundayWorker.id)!;
  assert(sundayWorkerRow.totals.sundayWorked === 1, `monthly sheet shows exactly 1 Sunday-Worked day for the Sunday-working fixture (got ${sundayWorkerRow.totals.sundayWorked})`);
  assert(sundayWorkerRow.totals.present === 1, "that same day counts toward Present, not a separate bucket");
  const day13 = sundayWorkerRow.days.find((d) => d.day === 13);
  assert(day13?.code === "P", `day-13 cell code is 'P' (marked with * for Sunday-worked at render time), got ${day13?.code}`);

  const holidayOffRow = sheet.rows.find((r) => r.employeeId === holidayOff.id)!;
  assert(holidayOffRow.totals.holiday === 1, "monthly sheet's Holiday column reflects the HOLIDAY-status day");

  console.log("\n=== Employee monthly summary: performance is a SEPARATE layer from attendance ===");
  const summary = await employeeMonthlySummary(db, founder.id, sundayWorker.id, YEAR, MONTH);
  assert(summary.attendance !== null, "attendance totals present in the summary");
  assert(typeof summary.performance.customerVisits === "number", "performance metrics present and numeric, not fabricated strings");
  assert(summary.performance.reorders === null, "an undeterminable metric (reorders) is explicitly null/'Not available', never guessed");

  console.log("\nALL MONTHLY/HOLIDAY/LEAVE ATTENDANCE ASSERTIONS PASSED.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
