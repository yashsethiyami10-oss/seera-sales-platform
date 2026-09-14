import { describe, expect, it } from "vitest";
import {
  decideAttendanceStatus,
  istBusinessDayStart,
  istBusinessDayRange,
  currentIstHour,
  isSundayIst,
  ATTENDANCE_START_CUTOFF_IST_HOUR,
} from "@/lib/sales-distribution/attendance-service";

// 2026-09-13 is an IST Sunday; 2026-09-14 is an IST Monday. Used throughout below.
const SUNDAY = istBusinessDayStart(new Date("2026-09-13T06:00:00.000Z"));
const MONDAY = istBusinessDayStart(new Date("2026-09-14T06:00:00.000Z"));

describe("attendance — pure decision logic (no DB)", () => {
  it("no activity at all -> ABSENT with an honest, non-fabricated reason", () => {
    const decision = decideAttendanceStatus(null);
    expect(decision.status).toBe("ABSENT");
    expect(decision.reason).toContain("No valid attendance or working activity");
  });

  it("activity at/before the start cutoff -> PRESENT", () => {
    // 2026-09-14T04:00:00Z = 09:30 IST — before the 10:00 IST cutoff.
    const decision = decideAttendanceStatus(new Date("2026-09-14T04:00:00.000Z"));
    expect(decision.status).toBe("PRESENT");
  });

  it("activity exactly at the cutoff hour -> still PRESENT (inclusive boundary)", () => {
    // 2026-09-14T04:59:00Z = 10:29 IST — hour component is 10, the cutoff hour, still counted PRESENT.
    const decision = decideAttendanceStatus(new Date("2026-09-14T04:59:00.000Z"));
    expect(currentIstHour(new Date("2026-09-14T04:59:00.000Z"))).toBe(ATTENDANCE_START_CUTOFF_IST_HOUR);
    expect(decision.status).toBe("PRESENT");
  });

  it("activity after the start cutoff -> LATE, never ABSENT (a late start is not an absence)", () => {
    // 2026-09-14T10:00:00Z = 15:30 IST — well after the 10:00 IST cutoff.
    const decision = decideAttendanceStatus(new Date("2026-09-14T10:00:00.000Z"));
    expect(decision.status).toBe("LATE");
    expect(decision.reason).toContain("after the configured start time");
  });
});

describe("attendance — IST business-day boundaries (timezone-aware, not naive UTC)", () => {
  it("a UTC instant just after IST midnight resolves to the SAME business day, not the previous UTC day", () => {
    // 2026-09-13T19:00:00Z = 2026-09-14T00:30 IST — just past midnight IST, but still 2026-09-13 in UTC.
    const at = new Date("2026-09-13T19:00:00.000Z");
    const businessDay = istBusinessDayStart(at);
    // Business day start, converted back to IST wall-clock date, must be 2026-09-14, not 2026-09-13 —
    // this is exactly the bug class GuidedMoneyIn.tsx's own comment warns about for a naive .toISOString()/
    // server-local-midnight approach.
    const istWallClock = new Date(businessDay.getTime() + 5.5 * 60 * 60 * 1000);
    expect(istWallClock.getUTCDate()).toBe(14);
    expect(istWallClock.getUTCHours()).toBe(0);
  });

  it("two instants on the same IST calendar day map to the identical business-day start (dedup key)", () => {
    const morning = istBusinessDayStart(new Date("2026-09-14T02:00:00.000Z")); // 07:30 IST
    const evening = istBusinessDayStart(new Date("2026-09-14T15:00:00.000Z")); // 20:30 IST
    expect(morning.getTime()).toBe(evening.getTime());
  });

  it("istBusinessDayRange spans exactly 24 hours from the business-day start", () => {
    const start = istBusinessDayStart(new Date("2026-09-14T08:00:00.000Z"));
    const [rangeStart, rangeEnd] = istBusinessDayRange(start);
    expect(rangeStart.getTime()).toBe(start.getTime());
    expect(rangeEnd.getTime() - rangeStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("correctly identifies an IST Sunday vs an IST Monday", () => {
    expect(isSundayIst(SUNDAY)).toBe(true);
    expect(isSundayIst(MONDAY)).toBe(false);
  });
});

describe("attendance — Sunday / Holiday / Leave precedence (Founder business rule)", () => {
  it("Monday with real activity -> PRESENT (unaffected by Sunday/holiday context)", () => {
    const decision = decideAttendanceStatus(new Date(MONDAY.getTime() + 4 * 60 * 60 * 1000), { isSunday: false });
    expect(decision.status).toBe("PRESENT");
  });

  it("Monday with no activity, after cutoff -> ABSENT", () => {
    const decision = decideAttendanceStatus(null, { isSunday: false });
    expect(decision.status).toBe("ABSENT");
  });

  it("Sunday with no activity -> WEEK_OFF, never ABSENT", () => {
    const decision = decideAttendanceStatus(null, { isSunday: true });
    expect(decision.status).toBe("WEEK_OFF");
    expect(decision.offDayWorked).toBeUndefined();
  });

  it("Sunday with a genuine Start Day / work signal -> PRESENT + SUNDAY_WORKED, not just from a login", () => {
    const decision = decideAttendanceStatus(new Date(SUNDAY.getTime() + 3 * 60 * 60 * 1000), { isSunday: true });
    expect(decision.status).toBe("PRESENT");
    expect(decision.offDayWorked).toBe("SUNDAY_WORKED");
    expect(decision.reason).toContain("Sunday");
  });

  it("Holiday with no work -> HOLIDAY, never ABSENT", () => {
    const decision = decideAttendanceStatus(null, { isSunday: false, holiday: { name: "Diwali" } });
    expect(decision.status).toBe("HOLIDAY");
    expect(decision.reason).toContain("Diwali");
  });

  it("Holiday with approved work -> PRESENT + HOLIDAY_WORKED, holiday classification preserved in the reason", () => {
    const decision = decideAttendanceStatus(new Date(MONDAY.getTime() + 3 * 60 * 60 * 1000), { isSunday: false, holiday: { name: "Diwali" } });
    expect(decision.status).toBe("PRESENT");
    expect(decision.offDayWorked).toBe("HOLIDAY_WORKED");
    expect(decision.reason).toContain("Diwali");
  });

  it("Approved leave (non-Sunday, non-holiday) -> ON_LEAVE regardless of activity", () => {
    const decision = decideAttendanceStatus(null, { isSunday: false, holiday: null, hasApprovedLeave: true });
    expect(decision.status).toBe("ON_LEAVE");
  });

  it("Precedence: Sunday wins over an approved-leave flag for the same date", () => {
    // A leave record spanning a Sunday is moot — Sunday's own WEEK_OFF/PRESENT logic decides it,
    // exactly matching the Founder's stated pseudocode order (Sunday checked before Leave).
    const decision = decideAttendanceStatus(null, { isSunday: true, hasApprovedLeave: true });
    expect(decision.status).toBe("WEEK_OFF");
  });

  it("Precedence: Holiday wins over an approved-leave flag for the same date", () => {
    const decision = decideAttendanceStatus(null, { isSunday: false, holiday: { name: "Republic Day" }, hasApprovedLeave: true });
    expect(decision.status).toBe("HOLIDAY");
  });
});
