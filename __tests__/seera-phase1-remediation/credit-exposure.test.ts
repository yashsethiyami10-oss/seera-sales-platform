import { describe, expect, it } from "vitest";
import { evaluateDistributorCredit, netCreditExposure } from "@/lib/sales-distribution/business-rules";

const LIMIT = 10_000;

describe("canonical credit exposure", () => {
  it("unpaid order: full order value is exposure", () => {
    const exposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 0 });
    expect(exposure).toBe(10_000);
  });

  it("partial posted payment: exposure drops by exactly the posted amount", () => {
    const exposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 4_000 });
    expect(exposure).toBe(6_000);
  });

  it("fully paid order: exposure clears to zero", () => {
    const exposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 10_000 });
    expect(exposure).toBe(0);
  });

  it("unapplied/overpayment: exposure floors at zero, never goes negative", () => {
    const exposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 12_000 });
    expect(exposure).toBe(0);
  });

  it("pending/unverified payment does not reduce exposure (only POSTED entries count)", () => {
    // A SUBMITTED payment record never reaches the ledger until verifyPayment posts it,
    // so a caller that only sums status:"POSTED" SeeraFinancialEntry rows sees no credit yet.
    const exposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 0 });
    expect(exposure).toBe(10_000);
  });

  it("reversed payment: the reversal entry restores the original exposure", () => {
    // reverseLedgerEntry posts a new entry with debit/credit parties swapped relative to the
    // original, so summing only POSTED entries naturally cancels the reversed payment out.
    const beforeReversal = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 4_000 });
    expect(beforeReversal).toBe(6_000);
    const afterReversal = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 4_000, postedCredits: 4_000 });
    expect(afterReversal).toBe(10_000);
  });

  it("next order after payment: a new order's exposure check uses the updated, netted truth", () => {
    const existingExposure = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 5_000 });
    const newOrderValue = 3_000;
    const decision = evaluateDistributorCredit({
      creditEnabled: true,
      creditLimit: LIMIT,
      outstanding: existingExposure,
      orderValue: newOrderValue,
      now: new Date("2026-08-10"),
    });
    expect(existingExposure).toBe(5_000);
    expect(decision.decision).toBe("ALLOW");
  });

  it("limit decision after payment: BLOCK before payment, ALLOW after enough is posted", () => {
    const beforePayment = evaluateDistributorCredit({
      creditEnabled: true,
      creditLimit: LIMIT,
      blockThreshold: LIMIT,
      outstanding: netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 0 }),
      orderValue: 3_000,
      now: new Date("2026-08-10"),
    });
    expect(beforePayment.decision).toBe("BLOCK");
    const afterPayment = evaluateDistributorCredit({
      creditEnabled: true,
      creditLimit: LIMIT,
      blockThreshold: LIMIT,
      outstanding: netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 5_000 }),
      orderValue: 3_000,
      now: new Date("2026-08-10"),
    });
    expect(afterPayment.decision).toBe("ALLOW");
  });

  it("overdue order after partial payment: HOLD persists until grace/promise, exposure alone does not clear it", () => {
    const now = new Date("2026-08-10");
    const originalDueDate = new Date("2026-07-01");
    const outstandingAfterPartialPayment = netCreditExposure({ orderExposureTotal: 10_000, postedDebits: 0, postedCredits: 4_000 });
    const decision = evaluateDistributorCredit({
      creditEnabled: true,
      creditLimit: LIMIT,
      outstanding: outstandingAfterPartialPayment,
      orderValue: 0,
      originalDueDate,
      now,
    });
    expect(outstandingAfterPartialPayment).toBe(6_000);
    expect(decision.contractOverdue).toBe(true);
    expect(decision.decision).toBe("HOLD");
    const withPromise = evaluateDistributorCredit({
      creditEnabled: true,
      creditLimit: LIMIT,
      outstanding: outstandingAfterPartialPayment,
      orderValue: 0,
      originalDueDate,
      promisedPaymentDate: new Date("2026-08-20"),
      now,
    });
    expect(withPromise.decision).toBe("ALLOW");
  });
});
