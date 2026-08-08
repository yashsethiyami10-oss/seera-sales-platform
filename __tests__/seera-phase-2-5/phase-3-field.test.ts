import { describe, expect, it } from "vitest";
import { assertJointWorkAttribution, deliveredPerformance } from "@/lib/sales-distribution/business-rules";

describe("Phase 3 field attribution", () => {
  it("credits only net eligible delivered quantity", () => expect(deliveredPerformance([{ ordered: 10, delivered: 8, refused: 1, approvedReturn: 2, unitValue: 99 }])).toEqual({ quantity: 5, value: 495 }));
  it("does not credit booked but undelivered quantity", () => expect(deliveredPerformance([{ ordered: 40, delivered: 0, unitValue: 50 }]).value).toBe(0));
  it("uses one attribution key during joint work", () => expect(assertJointWorkAttribution({ visitId: "visit-1", orderId: "order-1", primarySalesExecutiveId: "exec-1", participants: ["manager-1", "exec-1"] })).toEqual({ visitCreditKey: "visit-1", orderCreditKey: "order-1", creditedEmployeeId: "exec-1" }));
});
