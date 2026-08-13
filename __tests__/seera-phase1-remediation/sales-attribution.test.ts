import { describe, it, expect } from "vitest";
import { salesAttribution, type AttributedOrder } from "@/lib/sales-distribution/business-rules";

const managerId = "manager-1";
const exec1 = "exec-1";
const exec2 = "exec-2";
const team = [exec1, exec2];

describe("salesAttribution — Team / Manager Own / Territory", () => {
  it("matches the Founder's worked example: Territory = Team + Own, never Team + Own + duplicate", () => {
    const orders: AttributedOrder[] = [
      // Executive's own booked orders, including ones booked while the Manager was doing Joint
      // Working with them — still credited to the Executive, sourcePortal stays sales-executive.
      { id: "o1", salespersonId: exec1, sourcePortal: "sales-executive", bookedValue: 680_000, eligibleDeliveredValue: 680_000 },
      { id: "o2", salespersonId: exec2, sourcePortal: "sales-executive", bookedValue: 120_000, eligibleDeliveredValue: 120_000 }, // the joint-working portion
      { id: "o3", salespersonId: managerId, sourcePortal: "sales-manager", bookedValue: 50_000, eligibleDeliveredValue: 50_000 },
    ];
    const result = salesAttribution(orders, managerId, team);
    expect(result.team.bookedValue).toBe(800_000);
    expect(result.managerOwn.bookedValue).toBe(50_000);
    expect(result.territory.bookedValue).toBe(850_000);
    expect(result.territory.bookedValue).not.toBe(970_000); // the wrong, double-counted answer
  });

  it("never double-counts even if the same order id were malformed into both buckets", () => {
    const orders: AttributedOrder[] = [
      { id: "dup", salespersonId: exec1, sourcePortal: "sales-executive", bookedValue: 100, eligibleDeliveredValue: 100 },
    ];
    // Force an impossible overlap by re-labeling the same id under the manager's own bucket too.
    const malformed: AttributedOrder[] = [...orders, { id: "dup", salespersonId: managerId, sourcePortal: "sales-manager", bookedValue: 100, eligibleDeliveredValue: 100 }];
    expect(() => salesAttribution(malformed, managerId, team)).toThrow("DOUBLE_COUNTED_ORDER");
  });

  it("ignores orders from Executives outside the Manager's team", () => {
    const orders: AttributedOrder[] = [
      { id: "o1", salespersonId: "outsider", sourcePortal: "sales-executive", bookedValue: 999, eligibleDeliveredValue: 999 },
    ];
    const result = salesAttribution(orders, managerId, team);
    expect(result.team.bookedValue).toBe(0);
    expect(result.territory.bookedValue).toBe(0);
  });

  it("ignores a Manager order booked through the wrong sourcePortal (defensive, should never happen)", () => {
    const orders: AttributedOrder[] = [
      { id: "o1", salespersonId: managerId, sourcePortal: "sales-executive", bookedValue: 500, eligibleDeliveredValue: 500 },
    ];
    const result = salesAttribution(orders, managerId, team);
    expect(result.managerOwn.bookedValue).toBe(0);
    expect(result.team.bookedValue).toBe(0);
  });

  it("handles an empty order list", () => {
    const result = salesAttribution([], managerId, team);
    expect(result).toEqual({
      team: { bookedValue: 0, eligibleDeliveredValue: 0, orderCount: 0 },
      managerOwn: { bookedValue: 0, eligibleDeliveredValue: 0, orderCount: 0 },
      territory: { bookedValue: 0, eligibleDeliveredValue: 0, orderCount: 0 },
    });
  });
});
