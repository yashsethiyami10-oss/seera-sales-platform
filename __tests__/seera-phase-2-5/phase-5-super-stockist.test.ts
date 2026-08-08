import { describe, expect, it } from "vitest";
import { assertAdvanceOnlyCompanyOrder, assertPromisePreservesContract, evaluateDistributorCredit } from "@/lib/sales-distribution/business-rules";

describe("Phase 5 super stockist commercial integrity", () => {
  it("prohibits Company to S.S. credit", () => expect(() => assertAdvanceOnlyCompanyOrder({ type: "COMPANY_REPLENISHMENT", creditDays: 15, paymentProofStatus: "VERIFIED" })).toThrow("COMPANY_TO_SS_CREDIT_PROHIBITED"));
  it("requires verified advance before company fulfilment", () => expect(() => assertAdvanceOnlyCompanyOrder({ type: "COMPANY_REPLENISHMENT", creditDays: 0, paymentProofStatus: "SUBMITTED" })).toThrow("ADVANCE_PAYMENT_NOT_VERIFIED"));
  it("accepts verified advance", () => expect(() => assertAdvanceOnlyCompanyOrder({ type: "COMPANY_REPLENISHMENT", creditDays: 0, paymentProofStatus: "VERIFIED" })).not.toThrow());
  it("keeps original due date while recording promise", () => expect(() => assertPromisePreservesContract({ originalDueDate: new Date("2026-08-15"), storedOriginalDueDate: new Date("2026-08-15"), promisedPaymentDate: new Date("2026-08-20") })).not.toThrow());
  it("shows underlying overdue even while promise is pending", () => expect(evaluateDistributorCredit({ creditEnabled: true, creditLimit: 100, outstanding: 25, orderValue: 10, originalDueDate: new Date("2026-08-15"), promisedPaymentDate: new Date("2026-08-20"), now: new Date("2026-08-18") })).toMatchObject({ decision: "ALLOW", contractOverdue: true, promisePending: true }));
});
