import type { PrismaClient, SeeraAttendanceStatus, SeeraLeaveStatus } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { executiveTaDaMonthlySummary } from "@/lib/sales-distribution/field-travel-service";

// Attendance Intelligence add-on. Audit finding (2026-09-14): this codebase had NO attendance
// model, no leave model, no holiday/week-off calendar, and no scheduler infrastructure beyond one
// existing precedent (`/api/outbox/dispatch` — dual-auth worker-secret/Vercel-Cron pattern, reused
// below verbatim). "Attendance" on both founder-admin and sales-manager portals was literally the
// generic SeeraWorkSession list relabeled — `correctAttendance` (manager-service.ts) edits a work
// SESSION's raw fields, it does not decide or store a business attendance STATUS. This file adds
// exactly that missing decision + record layer. It does not touch SeeraWorkSession, does not
// change the existing correctAttendance function, and does not invent a leave/holiday calendar —
// ON_LEAVE/WEEK_OFF exist in the status enum for a human to set via correctAttendanceRecord, but
// the automatic job below can only ever produce PRESENT/LATE/ABSENT, because leave/holiday data
// genuinely does not exist anywhere in this system yet. That is a real, flagged gap, not silently
// worked around — see the file-level comment on runDailyAttendanceMarking.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// The hour (IST, 0-23) before/at which a first activity counts as PRESENT; strictly after is LATE.
export const ATTENDANCE_START_CUTOFF_IST_HOUR = 10;
// The hour (IST, 0-23) at/after which the auto-absent job is allowed to run for "today". Running it
// earlier for the CURRENT business day would prematurely mark people absent who simply haven't
// started their field day yet — see Section 5's explicit "before cutoff" rule. Running it for a
// PAST business date (force/backfill) always ignores this — the cutoff has obviously already passed.
export const ATTENDANCE_END_CUTOFF_IST_HOUR = 21;

const FIELD_ATTENDANCE_ROLE_CODES = ["SALES_EXECUTIVE", "SALES_MANAGER"] as const;

/** 00:00:00 IST of the business day `at` falls in, expressed as the equivalent UTC instant — safe
 *  to store/compare directly against Postgres `timestamp` columns regardless of server TZ. */
export function istBusinessDayStart(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MS);
}

export function istBusinessDayRange(businessDayStart: Date): [Date, Date] {
  return [businessDayStart, new Date(businessDayStart.getTime() + 24 * 60 * 60 * 1000)];
}

/** The current IST wall-clock hour (0-23), used only to gate when the auto-absent job may act on
 *  "today" — never used to decide PRESENT/LATE (that uses the activity's own timestamp). */
export function currentIstHour(at: Date = new Date()): number {
  return new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** True when `businessDayStart` (an IST-midnight instant, from istBusinessDayStart) falls on an
 *  IST Sunday. */
export function isSundayIst(businessDayStart: Date): boolean {
  return new Date(businessDayStart.getTime() + IST_OFFSET_MS).getUTCDay() === 0;
}

/**
 * Pure decision function — no I/O, fully unit-testable. Implements the exact precedence the
 * Founder specified: Sunday > Holiday > Approved Leave > real work signal > cutoff. `firstActivityAt`
 * is the employee's earliest legitimate work signal (SeeraWorkSession.startedAt) for the business
 * day, or null if none exists. `context` fields default to false/null so existing callers that only
 * ever evaluated a normal working day (no Sunday/holiday/leave awareness) keep working unchanged.
 */
export function decideAttendanceStatus(
  firstActivityAt: Date | null,
  context: { isSunday?: boolean; holiday?: { name: string } | null; hasApprovedLeave?: boolean } = {},
): { status: "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "WEEK_OFF" | "HOLIDAY"; reason: string; offDayWorked?: "SUNDAY_WORKED" | "HOLIDAY_WORKED" } {
  if (context.isSunday) {
    if (firstActivityAt) {
      return {
        status: "PRESENT",
        offDayWorked: "SUNDAY_WORKED",
        reason: `Worked voluntarily on the weekly off (Sunday) — activity recorded at ${firstActivityAt.toISOString()}.`,
      };
    }
    return { status: "WEEK_OFF", reason: "Sunday — scheduled weekly off." };
  }
  if (context.holiday) {
    if (firstActivityAt) {
      return {
        status: "PRESENT",
        offDayWorked: "HOLIDAY_WORKED",
        reason: `Worked on a company holiday (${context.holiday.name}) — activity recorded at ${firstActivityAt.toISOString()}.`,
      };
    }
    return { status: "HOLIDAY", reason: `Company holiday: ${context.holiday.name}. No working activity required.` };
  }
  if (context.hasApprovedLeave) {
    return { status: "ON_LEAVE", reason: "Approved leave exists for this working day." };
  }
  if (!firstActivityAt) {
    return { status: "ABSENT", reason: "No valid attendance or working activity was recorded by the attendance cutoff." };
  }
  const hour = currentIstHour(firstActivityAt);
  if (hour <= ATTENDANCE_START_CUTOFF_IST_HOUR) {
    return { status: "PRESENT", reason: `Attendance recorded from field activity at ${firstActivityAt.toISOString()}.` };
  }
  return { status: "LATE", reason: `First valid working activity was recorded after the configured start time (${firstActivityAt.toISOString()}).` };
}

export async function eligibleAttendanceEmployees(db: PrismaClient, employeeIds?: string[]) {
  return db.user.findMany({
    where: {
      status: "ACTIVE",
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
      roleAssignments: { some: { status: "ACTIVE", role: { code: { in: [...FIELD_ATTENDANCE_ROLE_CODES] } } } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Automatic ABSENT marking. Reused by both the scheduled-job route and a Founder "run now" action.
 *
 * SCOPE, STATED PLAINLY: this can only ever assign PRESENT/LATE/ABSENT. ON_LEAVE and WEEK_OFF are
 * real statuses a Founder/Manager can set manually (correctAttendanceRecord), but this codebase has
 * no leave-request model and no weekly-off/holiday calendar anywhere — inventing one was explicitly
 * out of scope for this pass ("do not invent a new workforce calendar"). Practically: if this job
 * is ever wired to a real recurring schedule, every employee's actual weekly off day will be
 * auto-marked ABSENT unless a Founder/Manager corrects it first. That is a real limitation to close
 * before relying on this in production, not something this code silently papers over.
 *
 * Idempotent by construction: `date` is unique per employee (schema `@@unique([employeeId, date])`),
 * and an existing record for that employee+date is always left untouched (never overwritten) — a
 * human's manual correction is never silently reverted, and running this twice is a safe no-op.
 */
export async function runDailyAttendanceMarking(
  db: PrismaClient,
  input: { date?: Date; actorId?: string | null; force?: boolean } = {},
) {
  const actorId = input.actorId ?? null;
  if (actorId) await authorize(db, { actorId, permission: "network:manage" });

  const businessDayStart = istBusinessDayStart(input.date ?? new Date());
  const isPastDay = businessDayStart.getTime() < istBusinessDayStart(new Date()).getTime();
  if (!isPastDay && !input.force && currentIstHour() < ATTENDANCE_END_CUTOFF_IST_HOUR) {
    throw new FoundationError(
      "ATTENDANCE_CUTOFF_NOT_REACHED",
      `Today's attendance cutoff (${ATTENDANCE_END_CUTOFF_IST_HOUR}:00 IST) has not been reached yet.`,
      409,
    );
  }
  const [dayStart, dayEnd] = istBusinessDayRange(businessDayStart);
  const sunday = isSundayIst(businessDayStart);
  const holiday = await db.seeraHoliday.findFirst({ where: { date: businessDayStart, isActive: true } });

  const employees = await eligibleAttendanceEmployees(db);
  const results: { employeeId: string; status: string; skipped: boolean }[] = [];

  for (const employee of employees) {
    const existing = await db.seeraAttendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: businessDayStart } },
    });
    if (existing) {
      results.push({ employeeId: employee.id, status: existing.status, skipped: true });
      continue;
    }
    const firstSession = await db.seeraWorkSession.findFirst({
      where: { employeeId: employee.id, startedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startedAt: "asc" },
    });
    const lastSession = firstSession
      ? await db.seeraWorkSession.findFirst({
          where: { employeeId: employee.id, startedAt: { gte: dayStart, lt: dayEnd } },
          orderBy: { startedAt: "desc" },
        })
      : null;
    // Precedence per Founder directive: Sunday > Holiday > Approved Leave > work signal > cutoff.
    // Sunday/holiday are evaluated once above (company-wide, not per-employee); leave is per-employee.
    const approvedLeave = sunday || holiday
      ? null // Sunday/holiday already decide the outcome outright — a leave record for this same
             // date is irrelevant either way, matching the Founder's stated precedence order exactly.
      : await db.seeraLeaveRequest.findFirst({
          where: { employeeId: employee.id, status: "APPROVED", startDate: { lte: businessDayStart }, endDate: { gte: businessDayStart } },
        });
    const decision = decideAttendanceStatus(firstSession?.startedAt ?? null, {
      isSunday: sunday,
      holiday: holiday ? { name: holiday.name } : null,
      hasApprovedLeave: Boolean(approvedLeave),
    });
    const record = await db.seeraAttendanceRecord.create({
      data: {
        employeeId: employee.id,
        date: businessDayStart,
        status: decision.status as SeeraAttendanceStatus,
        source: "SYSTEM",
        reason: decision.reason,
        offDayWorked: decision.offDayWorked,
        firstActivityAt: firstSession?.startedAt,
        lastActivityAt: lastSession?.endedAt ?? lastSession?.startedAt,
      },
    });
    await recordAudit(db, {
      actorId,
      action: `attendance.auto_mark_${decision.status.toLowerCase()}`,
      entityType: "SeeraAttendanceRecord",
      entityId: record.id,
      afterState: { status: record.status, reason: record.reason, employeeId: employee.id, date: businessDayStart.toISOString() },
    });
    results.push({ employeeId: employee.id, status: decision.status, skipped: false });
  }

  return {
    businessDate: businessDayStart.toISOString(),
    evaluated: employees.length,
    created: results.filter((r) => !r.skipped).length,
    alreadyDecided: results.filter((r) => r.skipped).length,
    results,
  };
}

/** Governed manual correction — the ONLY writer, other than the auto-mark job above, that ever
 *  touches a SeeraAttendanceRecord's status. Never deletes/overwrites history: recordAudit captures
 *  the before/after status on every call, so an auto-generated ABSENT followed by a Founder
 *  correction to PRESENT leaves both facts in the audit trail (see attendanceRecordDetail). */
export async function correctAttendanceRecord(
  db: PrismaClient,
  actorId: string,
  input: { employeeId: string; date: Date; status: Exclude<SeeraAttendanceStatus, never>; reason: string },
) {
  await authorize(db, { actorId, permission: "network:manage" });
  if (!input.reason.trim()) throw new FoundationError("ATTENDANCE_REASON_REQUIRED", "A correction reason is required", 400);
  const businessDayStart = istBusinessDayStart(input.date);
  const before = await db.seeraAttendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: input.employeeId, date: businessDayStart } },
  });
  const record = await db.seeraAttendanceRecord.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: businessDayStart } },
    create: {
      employeeId: input.employeeId,
      date: businessDayStart,
      status: input.status,
      source: "MANUAL",
      reason: input.reason,
      decidedById: actorId,
    },
    update: { status: input.status, source: "MANUAL", reason: input.reason, decidedById: actorId },
  });
  await recordAudit(db, {
    actorId,
    action: "attendance.manual_correction",
    entityType: "SeeraAttendanceRecord",
    entityId: record.id,
    beforeState: before ? { status: before.status, reason: before.reason, source: before.source } : undefined,
    afterState: { status: record.status, reason: record.reason, source: record.source },
  });
  return record;
}

const ROLE_LABEL: Record<string, string> = { SALES_EXECUTIVE: "Sales Executive", SALES_MANAGER: "Sales Manager" };

/** Cheap month-to-date KPI counts for the Founder Today dashboard (Section 14's "MONTH" block) —
 *  ONE groupBy query, not a per-employee/per-day loop like the full monthly grid needs. Counts
 *  every eligible employee's stored record for the month so far; days not yet evaluated are simply
 *  absent from every bucket (never guessed into one). */
export async function founderAttendanceMonthKpis(db: PrismaClient, actorId: string, date: Date = new Date(), employeeIds?: string[]) {
  await authorize(db, { actorId, permission: "network:manage" });
  const businessDayStart = istBusinessDayStart(date);
  const [monthStart] = monthRangeIst(businessDayStart.getUTCFullYear(), businessDayStart.getUTCMonth() + 1);
  const employees = employeeIds ?? (await eligibleAttendanceEmployees(db)).map((e) => e.id);
  const grouped = await db.seeraAttendanceRecord.groupBy({
    by: ["status"],
    where: { employeeId: { in: employees }, date: { gte: monthStart, lte: businessDayStart } },
    _count: true,
  });
  const sundayWorked = await db.seeraAttendanceRecord.count({
    where: { employeeId: { in: employees }, date: { gte: monthStart, lte: businessDayStart }, offDayWorked: "SUNDAY_WORKED" },
  });
  const countFor = (status: SeeraAttendanceStatus) => grouped.find((g) => g.status === status)?._count ?? 0;
  return {
    present: countFor("PRESENT"),
    absent: countFor("ABSENT"),
    late: countFor("LATE"),
    onLeave: countFor("ON_LEAVE"),
    weekOff: countFor("WEEK_OFF"),
    holiday: countFor("HOLIDAY"),
    sundayWorked,
  };
}

/** Founder-wide attendance summary for one business day — KPI counts + one row per eligible
 *  employee, with a record if the auto-mark job or a manual correction has already produced one
 *  ("Reason unavailable — review required." when the day simply hasn't been evaluated yet, never a
 *  fabricated status). */
export async function founderAttendanceSummary(db: PrismaClient, actorId: string, date: Date = new Date(), employeeIds?: string[]) {
  await authorize(db, { actorId, permission: "network:manage" });
  const businessDayStart = istBusinessDayStart(date);
  const employees = await eligibleAttendanceEmployees(db, employeeIds);
  const roleByEmployee = new Map(
    (
      await db.userRoleAssignment.findMany({
        where: { userId: { in: employees.map((e) => e.id) }, status: "ACTIVE", role: { code: { in: [...FIELD_ATTENDANCE_ROLE_CODES] } } },
        select: { userId: true, role: { select: { code: true } } },
      })
    ).map((a) => [a.userId, a.role.code]),
  );
  const records = await db.seeraAttendanceRecord.findMany({ where: { date: businessDayStart, employeeId: { in: employees.map((e) => e.id) } } });
  const recordByEmployee = new Map(records.map((r) => [r.employeeId, r]));

  const rows = employees.map((employee) => {
    const record = recordByEmployee.get(employee.id) ?? null;
    return {
      employeeId: employee.id,
      name: employee.name ?? employee.email,
      roleLabel: ROLE_LABEL[roleByEmployee.get(employee.id) ?? ""] ?? "Employee",
      status: record?.status ?? null,
      reason: record?.reason ?? "Not yet evaluated for this business day.",
      source: record?.source ?? null,
      offDayWorked: record?.offDayWorked ?? null,
      firstActivityAt: record?.firstActivityAt ?? null,
      lastActivityAt: record?.lastActivityAt ?? null,
    };
  });
  const kpis = {
    total: rows.length,
    present: rows.filter((r) => r.status === "PRESENT").length,
    late: rows.filter((r) => r.status === "LATE").length,
    absent: rows.filter((r) => r.status === "ABSENT").length,
    onLeave: rows.filter((r) => r.status === "ON_LEAVE").length,
    weekOff: rows.filter((r) => r.status === "WEEK_OFF").length,
    holiday: rows.filter((r) => r.status === "HOLIDAY").length,
    exception: rows.filter((r) => r.status === "EXCEPTION").length,
    notEvaluated: rows.filter((r) => r.status === null).length,
  };
  const attention = rows.filter((r) => r.status === "ABSENT" || r.status === "EXCEPTION");
  return { businessDate: businessDayStart.toISOString(), kpis, rows, attention };
}

/** Employee-level detail for one business day — used by the Founder attendance detail view.
 *  Correlates the decided attendance record with the SAME real signals it was derived from (field
 *  sessions, visits, orders) and the full audit history, never a second copy of that data. */
export async function attendanceRecordDetail(db: PrismaClient, actorId: string, employeeId: string, date: Date) {
  await authorize(db, { actorId, permission: "network:manage" });
  const businessDayStart = istBusinessDayStart(date);
  const [dayStart, dayEnd] = istBusinessDayRange(businessDayStart);
  const [employee, record] = await Promise.all([
    db.user.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true } }),
    db.seeraAttendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: businessDayStart } } }),
  ]);
  if (!employee) throw new FoundationError("USER_NOT_FOUND", "That employee could not be found.", 404);
  const [sessions, auditHistory] = await Promise.all([
    db.seeraWorkSession.findMany({
      where: { employeeId, startedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startedAt: "asc" },
      include: { _count: { select: { visits: true } } },
    }),
    db.auditLog.findMany({
      where: { entityType: "SeeraAttendanceRecord", entityId: record?.id ?? "__none__" },
      orderBy: { occurredAt: "asc" },
    }),
  ]);
  const sessionIds = sessions.map((s) => s.id);
  const [visitCount, orderAgg] = sessionIds.length
    ? await Promise.all([
        db.seeraVisit.count({ where: { workSessionId: { in: sessionIds } } }),
        db.seeraSalesOrder.aggregate({ where: { salespersonId: employeeId, createdAt: { gte: dayStart, lt: dayEnd } }, _count: true, _sum: { total: true } }),
      ])
    : [0, { _count: 0, _sum: { total: null } }];
  const actorIds = [...new Set(auditHistory.map((a) => a.actorId).filter((v): v is string => Boolean(v)))];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name ?? a.email]));

  return {
    employee: { id: employee.id, name: employee.name ?? employee.email },
    businessDate: businessDayStart.toISOString(),
    status: record?.status ?? null,
    reason: record?.reason ?? "Reason unavailable — review required.",
    source: record?.source ?? null,
    offDayWorked: record?.offDayWorked ?? null,
    firstActivityAt: record?.firstActivityAt ?? null,
    lastActivityAt: record?.lastActivityAt ?? null,
    sessions: sessions.map((s) => ({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, workingType: s.workingType, visitCount: s._count.visits })),
    visitCount,
    orderCount: orderAgg._count,
    orderValue: Number(orderAgg._sum.total ?? 0),
    auditHistory: auditHistory.map((a) => ({
      id: a.id,
      occurredAt: a.occurredAt,
      actorName: a.actorId ? (actorName.get(a.actorId) ?? "System") : "System",
      isSystem: a.actorId === null,
      action: a.action,
      beforeState: a.beforeState,
      afterState: a.afterState,
    })),
  };
}

// ================================================================================================
// Holiday calendar — minimal, per Founder directive ("Do NOT create a full HRMS"). One row per
// company holiday date. Only the attendance engine (runDailyAttendanceMarking) reads this.
// ================================================================================================

export async function createHoliday(db: PrismaClient, actorId: string, input: { date: Date; name: string; description?: string }) {
  await authorize(db, { actorId, permission: "network:manage" });
  if (!input.name.trim()) throw new FoundationError("HOLIDAY_NAME_REQUIRED", "A holiday name is required", 400);
  const date = istBusinessDayStart(input.date);
  const holiday = await db.seeraHoliday.upsert({
    where: { date },
    create: { date, name: input.name, description: input.description, isActive: true, createdById: actorId },
    update: { name: input.name, description: input.description, isActive: true },
  });
  await recordAudit(db, { actorId, action: "attendance.holiday_created", entityType: "SeeraHoliday", entityId: holiday.id, afterState: { date: date.toISOString(), name: holiday.name } });
  return holiday;
}

export async function listHolidays(db: PrismaClient, actorId: string, input: { year: number; month: number } = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }) {
  await authorize(db, { actorId, permission: "network:manage" });
  const monthStart = istBusinessDayStart(new Date(Date.UTC(input.year, input.month - 1, 1)));
  const monthEnd = istBusinessDayStart(new Date(Date.UTC(input.year, input.month, 1)));
  return db.seeraHoliday.findMany({ where: { date: { gte: monthStart, lt: monthEnd } }, orderBy: { date: "asc" } });
}

export async function setHolidayActive(db: PrismaClient, actorId: string, id: string, isActive: boolean) {
  await authorize(db, { actorId, permission: "network:manage" });
  const holiday = await db.seeraHoliday.update({ where: { id }, data: { isActive } });
  await recordAudit(db, { actorId, action: isActive ? "attendance.holiday_activated" : "attendance.holiday_deactivated", entityType: "SeeraHoliday", entityId: holiday.id });
  return holiday;
}

// ================================================================================================
// Leave — minimal governed structure, per Founder directive ("do not overbuild HR functionality").
// No leave types, no balances/accrual. A PENDING or REJECTED row never affects attendance — only
// runDailyAttendanceMarking's APPROVED-only lookup ever reads this table for the auto-mark decision.
// ================================================================================================

export async function createLeaveRequest(
  db: PrismaClient,
  actorId: string,
  input: { employeeId: string; startDate: Date; endDate: Date; reason: string },
) {
  await authorize(db, { actorId, permission: "network:manage" });
  if (!input.reason.trim()) throw new FoundationError("LEAVE_REASON_REQUIRED", "A reason is required", 400);
  const startDate = istBusinessDayStart(input.startDate);
  const endDate = istBusinessDayStart(input.endDate);
  if (endDate.getTime() < startDate.getTime()) throw new FoundationError("LEAVE_RANGE_INVALID", "End date cannot be before start date", 400);
  const leave = await db.seeraLeaveRequest.create({
    data: { employeeId: input.employeeId, startDate, endDate, reason: input.reason, status: "PENDING", createdById: actorId },
  });
  await recordAudit(db, { actorId, action: "attendance.leave_requested", entityType: "SeeraLeaveRequest", entityId: leave.id, afterState: { employeeId: input.employeeId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), status: "PENDING" } });
  return leave;
}

export async function decideLeaveRequest(db: PrismaClient, actorId: string, input: { id: string; status: Extract<SeeraLeaveStatus, "APPROVED" | "REJECTED"> }) {
  await authorize(db, { actorId, permission: "network:manage" });
  const before = await db.seeraLeaveRequest.findUnique({ where: { id: input.id } });
  if (!before) throw new FoundationError("LEAVE_NOT_FOUND", "That leave request could not be found.", 404);
  const leave = await db.seeraLeaveRequest.update({
    where: { id: input.id },
    data: { status: input.status, approvedById: actorId, approvedAt: new Date() },
  });
  await recordAudit(db, {
    actorId,
    action: "attendance.leave_decided",
    entityType: "SeeraLeaveRequest",
    entityId: leave.id,
    beforeState: { status: before.status },
    afterState: { status: leave.status, approvedById: actorId },
  });
  return leave;
}

export async function listLeaveRequests(db: PrismaClient, actorId: string, input: { employeeId?: string; employeeIds?: string[]; status?: SeeraLeaveStatus } = {}) {
  await authorize(db, { actorId, permission: "network:manage" });
  return db.seeraLeaveRequest.findMany({
    where: {
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.employeeIds ? { employeeId: { in: input.employeeIds } } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { startDate: "desc" },
    take: 200,
  });
}

// ================================================================================================
// Monthly reporting — Founder's "one screen" month-end use case. Reads ONLY already-decided
// SeeraAttendanceRecord rows for the attendance grid (a day with no stored record shows as
// "not evaluated", never a computed guess) and separately aggregates real canonical
// visit/order/photo data for the performance layer — deliberately two different queries, per
// Section 8's explicit attendance-vs-performance separation.
// ================================================================================================

const DAY_CODE: Partial<Record<SeeraAttendanceStatus, string>> = {
  PRESENT: "P", LATE: "L", ABSENT: "A", ON_LEAVE: "LV", WEEK_OFF: "WO", HOLIDAY: "H", EXCEPTION: "EX",
};

function monthRangeIst(year: number, month: number): [Date, Date, number] {
  const monthStart = istBusinessDayStart(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = istBusinessDayStart(new Date(Date.UTC(year, month, 1)));
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
  return [monthStart, monthEnd, daysInMonth];
}

export async function founderMonthlyAttendanceSheet(
  db: PrismaClient,
  actorId: string,
  input: { year: number; month: number; employeeIds?: string[]; statusFilter?: SeeraAttendanceStatus },
) {
  await authorize(db, { actorId, permission: "network:manage" });
  const [monthStart, monthEnd, daysInMonth] = monthRangeIst(input.year, input.month);
  const employees = await eligibleAttendanceEmployees(db, input.employeeIds);
  const roleByEmployee = new Map(
    (
      await db.userRoleAssignment.findMany({
        where: { userId: { in: employees.map((e) => e.id) }, status: "ACTIVE", role: { code: { in: [...FIELD_ATTENDANCE_ROLE_CODES] } } },
        select: { userId: true, role: { select: { code: true } } },
      })
    ).map((a) => [a.userId, a.role.code]),
  );
  const records = await db.seeraAttendanceRecord.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: monthStart, lt: monthEnd } },
  });
  const recordKey = (employeeId: string, dayIndex: number) => `${employeeId}#${dayIndex}`;
  const recordByDay = new Map(
    records.map((r) => [recordKey(r.employeeId, Math.round((r.date.getTime() - monthStart.getTime()) / 86_400_000)), r]),
  );

  const rows = employees
    .map((employee) => {
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const record = recordByDay.get(recordKey(employee.id, i));
        return {
          day: i + 1,
          status: record?.status ?? null,
          code: record ? (DAY_CODE[record.status] ?? "?") : "—",
          offDayWorked: record?.offDayWorked ?? null,
          reason: record?.reason ?? null,
        };
      });
      const totals = {
        present: days.filter((d) => d.status === "PRESENT").length,
        late: days.filter((d) => d.status === "LATE").length,
        absent: days.filter((d) => d.status === "ABSENT").length,
        onLeave: days.filter((d) => d.status === "ON_LEAVE").length,
        weekOff: days.filter((d) => d.status === "WEEK_OFF").length,
        holiday: days.filter((d) => d.status === "HOLIDAY").length,
        exception: days.filter((d) => d.status === "EXCEPTION").length,
        sundayWorked: days.filter((d) => d.offDayWorked === "SUNDAY_WORKED").length,
        holidayWorked: days.filter((d) => d.offDayWorked === "HOLIDAY_WORKED").length,
        notEvaluated: days.filter((d) => d.status === null).length,
      };
      return {
        employeeId: employee.id,
        name: employee.name ?? employee.email,
        roleLabel: ROLE_LABEL[roleByEmployee.get(employee.id) ?? ""] ?? "Employee",
        days,
        totals,
      };
    })
    .filter((row) => !input.statusFilter || row.days.some((d) => d.status === input.statusFilter));

  return { year: input.year, month: input.month, daysInMonth, rows };
}

/** Real, canonical performance aggregation for one employee over one month — deliberately separate
 *  from attendance (Section 8). Every field is either a real query result or explicitly "Not
 *  available"; nothing here is estimated or invented. */
function buildEmployeePerformance(
  sessions: { startedAt: Date }[],
  visits: { outcome: string | null }[],
  orderAgg: { _count: number; _sum: { total: unknown } } | undefined,
  newCustomers: number,
  photoCount: number,
  monthStart: Date,
) {
  const fieldWorkingDays = new Set(sessions.map((s) => Math.floor((istBusinessDayStart(s.startedAt).getTime() - monthStart.getTime()) / 86_400_000))).size;
  return {
    fieldWorkingDays,
    customerVisits: visits.length,
    productiveVisits: visits.filter((v) => v.outcome === "PRODUCTIVE").length,
    noOrderVisits: visits.filter((v) => v.outcome === "NO_ORDER").length,
    orders: orderAgg?._count ?? 0,
    salesValue: Number(orderAgg?._sum.total ?? 0),
    newCustomers,
    // No `isReorder`/order-origin flag exists anywhere on SeeraSalesOrder — stating this plainly
    // instead of guessing from order count or notes text, which would be a fabricated metric.
    reorders: null as number | null,
    photos: photoCount,
    workingSessions: sessions.length,
  };
}

/** Same metrics as employeeMonthlyPerformance, for many employees in ONE round of queries instead
 *  of one round PER employee — the export route's real N+1 (a `for` loop awaiting one employee at
 *  a time). employeeMonthlyPerformance below delegates to this with a single-element array so the
 *  two callers can never compute different numbers for the same employee/month. */
export async function bulkEmployeeMonthlyPerformance(db: PrismaClient, actorId: string, employeeIds: string[], year: number, month: number) {
  await authorize(db, { actorId, permission: "network:manage" });
  const [monthStart, monthEnd] = monthRangeIst(year, month);
  if (employeeIds.length === 0) return new Map<string, ReturnType<typeof buildEmployeePerformance>>();
  const [sessions, visits, orderAgg, newCustomerAgg, photoAgg] = await Promise.all([
    db.seeraWorkSession.findMany({ where: { employeeId: { in: employeeIds }, startedAt: { gte: monthStart, lt: monthEnd } }, select: { employeeId: true, startedAt: true } }),
    db.seeraVisit.findMany({
      where: { workSession: { employeeId: { in: employeeIds }, startedAt: { gte: monthStart, lt: monthEnd } } },
      select: { outcome: true, workSession: { select: { employeeId: true } } },
    }),
    db.seeraSalesOrder.groupBy({ by: ["salespersonId"], where: { salespersonId: { in: employeeIds }, createdAt: { gte: monthStart, lt: monthEnd } }, _count: true, _sum: { total: true } }),
    db.seeraRetailer.groupBy({ by: ["salespersonId"], where: { salespersonId: { in: employeeIds }, source: "UNPLANNED_FIELD_ADDED", createdAt: { gte: monthStart, lt: monthEnd } }, _count: true }),
    db.seeraVisitPhoto.groupBy({ by: ["actorId"], where: { actorId: { in: employeeIds }, capturedAt: { gte: monthStart, lt: monthEnd }, deletedAt: null }, _count: true }),
  ]);

  const sessionsByEmployee = new Map<string, { startedAt: Date }[]>();
  for (const s of sessions) sessionsByEmployee.set(s.employeeId, [...(sessionsByEmployee.get(s.employeeId) ?? []), s]);
  const visitsByEmployee = new Map<string, { outcome: string | null }[]>();
  for (const v of visits) {
    const empId = v.workSession.employeeId;
    visitsByEmployee.set(empId, [...(visitsByEmployee.get(empId) ?? []), { outcome: v.outcome }]);
  }
  const orderByEmployee = new Map(orderAgg.map((o) => [o.salespersonId, o]));
  const newCustomersByEmployee = new Map(newCustomerAgg.map((n) => [n.salespersonId, n._count]));
  const photosByEmployee = new Map(photoAgg.map((p) => [p.actorId, p._count]));

  const result = new Map<string, ReturnType<typeof buildEmployeePerformance>>();
  for (const employeeId of employeeIds) {
    result.set(
      employeeId,
      buildEmployeePerformance(
        sessionsByEmployee.get(employeeId) ?? [],
        visitsByEmployee.get(employeeId) ?? [],
        orderByEmployee.get(employeeId),
        newCustomersByEmployee.get(employeeId) ?? 0,
        photosByEmployee.get(employeeId) ?? 0,
        monthStart,
      ),
    );
  }
  return result;
}

export async function employeeMonthlyPerformance(db: PrismaClient, actorId: string, employeeId: string, year: number, month: number) {
  const bulk = await bulkEmployeeMonthlyPerformance(db, actorId, [employeeId], year, month);
  return bulk.get(employeeId) ?? buildEmployeePerformance([], [], undefined, 0, 0, monthRangeIst(year, month)[0]);
}

/** One employee's full month-end view — attendance totals (from the monthly sheet's own row, so
 *  the two screens can never disagree) + real performance + the SAME canonical TA/DA function the
 *  Executive's own "My Travel" screen uses (executiveTaDaMonthlySummary, field-travel-service.ts) —
 *  not a second TA/DA calculation. */
export async function employeeMonthlySummary(db: PrismaClient, actorId: string, employeeId: string, year: number, month: number) {
  await authorize(db, { actorId, permission: "network:manage" });
  const [monthStart, monthEnd] = monthRangeIst(year, month);
  const [employee, sheet, performance, taDa] = await Promise.all([
    db.user.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true } }),
    founderMonthlyAttendanceSheet(db, actorId, { year, month, employeeIds: [employeeId] }),
    employeeMonthlyPerformance(db, actorId, employeeId, year, month),
    executiveTaDaMonthlySummary(db, actorId, employeeId, monthStart, monthEnd).catch(() => null),
  ]);
  if (!employee) throw new FoundationError("USER_NOT_FOUND", "That employee could not be found.", 404);
  const attendanceRow = sheet.rows[0] ?? null;
  return {
    employee: { id: employee.id, name: employee.name ?? employee.email },
    year,
    month,
    roleLabel: attendanceRow?.roleLabel ?? "Employee",
    attendance: attendanceRow?.totals ?? null,
    days: attendanceRow?.days ?? [],
    performance,
    taDa: taDa
      ? {
          totalKm: taDa.rows.reduce((sum, r) => sum + r.gpsDistanceKm, 0),
          totalTa: taDa.totals.taAmount,
          totalDa: taDa.totals.daAmount,
          totalTaDa: taDa.totals.totalTaDa,
        }
      : null, // "Not available" at the render layer when TA policy isn't configured / call failed
  };
}

type TimelineSession = { startedAt: Date; endedAt: Date | null; workingType: string };
type TimelineVisit = { checkedInAt: Date; checkedOutAt: Date | null; outcome: string | null; retailer?: { businessName: string } | null };
type TimelineOrder = { orderNumber: string; total: unknown; createdAt: Date };
type TimelinePhoto = { photoType: string; capturedAt: Date };

function buildTimelineEvents(sessions: TimelineSession[], visits: TimelineVisit[], orders: TimelineOrder[], photos: TimelinePhoto[]) {
  type Event = { at: Date; label: string };
  const events: Event[] = [];
  for (const s of sessions) {
    events.push({ at: s.startedAt, label: `Field session started (${s.workingType.replaceAll("_", " ")})` });
    if (s.endedAt) events.push({ at: s.endedAt, label: "Field session ended" });
  }
  for (const v of visits) {
    events.push({ at: v.checkedInAt, label: `Checked in — ${v.retailer?.businessName ?? "Retailer"}` });
    if (v.checkedOutAt) events.push({ at: v.checkedOutAt, label: `Visit completed — ${v.outcome ?? "outcome recorded"}` });
  }
  for (const o of orders) events.push({ at: o.createdAt, label: `Order saved — ${o.orderNumber} (₹${Number(o.total).toLocaleString("en-IN")})` });
  for (const p of photos) events.push({ at: p.capturedAt, label: `Photo captured — ${p.photoType.replaceAll("_", " ")}` });
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    hasAnyData: events.length > 0,
    events: events.map((e) => ({ at: e.at.toISOString(), label: e.label })),
  };
}

/** Real event timeline for one employee/day — session start/end, visit check-in/out, orders,
 *  photos, all with their OWN real timestamps, merged and sorted. Never invents an event; a day
 *  with only a session and nothing else just shows that one event. */
export async function dailyActivityTimeline(db: PrismaClient, actorId: string, employeeId: string, date: Date) {
  // Self-view (Executive checking their OWN day, e.g. the Post-End-Day summary) uses the same
  // field_reports:view_self permission every other self-read in this codebase already relies on
  // (executiveTaDaMonthlySummary, field-portal-service.ts's self-scoped reads) — not a governance
  // weakening, since a Founder/Manager viewing someone ELSE's day still requires network:manage.
  const self = actorId === employeeId;
  await authorize(db, { actorId, permission: self ? "field_reports:view_self" : "network:manage" });
  const businessDayStart = istBusinessDayStart(date);
  const [dayStart, dayEnd] = istBusinessDayRange(businessDayStart);
  const sessions = await db.seeraWorkSession.findMany({ where: { employeeId, startedAt: { gte: dayStart, lt: dayEnd } }, orderBy: { startedAt: "asc" } });
  const sessionIds = sessions.map((s) => s.id);
  const [visits, orders, photos] = await Promise.all([
    sessionIds.length
      ? db.seeraVisit.findMany({ where: { workSessionId: { in: sessionIds } }, include: { retailer: { select: { businessName: true } } } })
      : Promise.resolve([]),
    db.seeraSalesOrder.findMany({ where: { salespersonId: employeeId, createdAt: { gte: dayStart, lt: dayEnd } }, select: { id: true, orderNumber: true, total: true, createdAt: true } }),
    db.seeraVisitPhoto.findMany({ where: { actorId: employeeId, capturedAt: { gte: dayStart, lt: dayEnd }, deletedAt: null }, select: { id: true, photoType: true, capturedAt: true } }),
  ]);

  const built = buildTimelineEvents(sessions, visits, orders, photos);
  return { businessDate: businessDayStart.toISOString(), ...built };
}

/** Same timeline events as dailyActivityTimeline, for every employee across a whole month in ONE
 *  round of queries — the export route's Daily Activity Detail sheet previously called
 *  dailyActivityTimeline once per employee PER day-with-data (up to employees × days round trips).
 *  Shares buildTimelineEvents with the single-day function above so the two can never disagree on
 *  what counts as an event or how it's labeled — only the data-fetching shape differs. */
export async function bulkMonthlyActivityTimelines(db: PrismaClient, actorId: string, employeeIds: string[], year: number, month: number) {
  await authorize(db, { actorId, permission: "network:manage" });
  const [monthStart, monthEnd] = monthRangeIst(year, month);
  const result = new Map<string, { hasAnyData: boolean; events: { at: string; label: string }[] }>();
  if (employeeIds.length === 0) return result;

  const sessions = await db.seeraWorkSession.findMany({
    where: { employeeId: { in: employeeIds }, startedAt: { gte: monthStart, lt: monthEnd } },
    select: { id: true, employeeId: true, startedAt: true, endedAt: true, workingType: true },
    orderBy: { startedAt: "asc" },
  });
  const sessionIds = sessions.map((s) => s.id);
  const [visits, orders, photos] = await Promise.all([
    sessionIds.length
      ? db.seeraVisit.findMany({
          where: { workSessionId: { in: sessionIds } },
          select: { checkedInAt: true, checkedOutAt: true, outcome: true, workSessionId: true, retailer: { select: { businessName: true } } },
        })
      : Promise.resolve([]),
    db.seeraSalesOrder.findMany({
      where: { salespersonId: { in: employeeIds }, createdAt: { gte: monthStart, lt: monthEnd } },
      select: { salespersonId: true, orderNumber: true, total: true, createdAt: true },
    }),
    db.seeraVisitPhoto.findMany({
      where: { actorId: { in: employeeIds }, capturedAt: { gte: monthStart, lt: monthEnd }, deletedAt: null },
      select: { actorId: true, photoType: true, capturedAt: true },
    }),
  ]);

  const employeeIdBySessionId = new Map(sessions.map((s) => [s.id, s.employeeId]));
  const dayKey = (employeeId: string, at: Date) => `${employeeId}|${Math.floor((istBusinessDayStart(at).getTime() - monthStart.getTime()) / 86_400_000) + 1}`;

  const sessionsByKey = new Map<string, TimelineSession[]>();
  for (const s of sessions) {
    const key = dayKey(s.employeeId, s.startedAt);
    sessionsByKey.set(key, [...(sessionsByKey.get(key) ?? []), s]);
  }
  const visitsByKey = new Map<string, TimelineVisit[]>();
  for (const v of visits) {
    const employeeId = employeeIdBySessionId.get(v.workSessionId);
    if (!employeeId) continue;
    const key = dayKey(employeeId, v.checkedInAt);
    visitsByKey.set(key, [...(visitsByKey.get(key) ?? []), v]);
  }
  const ordersByKey = new Map<string, TimelineOrder[]>();
  for (const o of orders) {
    // salespersonId is nullable on SeeraSalesOrder in general, but this query's own where clause
    // (`salespersonId: { in: employeeIds }`) guarantees every row here has one — narrow for TS.
    if (!o.salespersonId) continue;
    const key = dayKey(o.salespersonId, o.createdAt);
    ordersByKey.set(key, [...(ordersByKey.get(key) ?? []), o]);
  }
  const photosByKey = new Map<string, TimelinePhoto[]>();
  for (const p of photos) {
    const key = dayKey(p.actorId, p.capturedAt);
    photosByKey.set(key, [...(photosByKey.get(key) ?? []), p]);
  }

  const allKeys = new Set([...sessionsByKey.keys(), ...visitsByKey.keys(), ...ordersByKey.keys(), ...photosByKey.keys()]);
  for (const key of allKeys) {
    result.set(key, buildTimelineEvents(sessionsByKey.get(key) ?? [], visitsByKey.get(key) ?? [], ordersByKey.get(key) ?? [], photosByKey.get(key) ?? []));
  }
  return result;
}
