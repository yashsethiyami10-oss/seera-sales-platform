import { describe, expect, it } from "vitest";
import { evaluateDistributorCredit, reminderDates } from "@/lib/sales-distribution/business-rules";

describe("Phase 2 master and network commercial foundations", () => {
  it("keeps configurable credit and threshold decisions deterministic", () => {
    const result = evaluateDistributorCredit({ creditEnabled: true, creditLimit: 100000, outstanding: 70000, orderValue: 15000, warningThreshold: 80000, now: new Date("2026-08-08") });
    expect(result.decision).toBe("WARNING");
    expect(result.availableCredit).toBe(30000);
  });
  it("blocks disabled distributor credit", () => expect(evaluateDistributorCredit({ creditEnabled: false, creditLimit: 0, outstanding: 0, orderValue: 1, now: new Date() }).decision).toBe("BLOCK"));
  it("builds relative reminders for any configured term", () => {
    const dates = reminderDates(new Date("2026-08-15T00:00:00Z"), [-3, -1, 0, 1]);
    expect(dates.map((item) => item.scheduledAt.toISOString().slice(0, 10))).toEqual(["2026-08-12", "2026-08-14", "2026-08-15", "2026-08-16"]);
  });
});
