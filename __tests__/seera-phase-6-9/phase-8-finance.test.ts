import { describe, expect, it } from "vitest";
import { ageingBucket, allocatePayment, assertFormalExtension, reversalEntry } from "@/lib/sales-distribution/phase6-9-rules";
import { localizedPortal } from "@/lib/sales-distribution/localization";

describe("Phase 8 financial control", () => {
  it("allocates payments partially without overstating settlement", () => expect(allocatePayment({ paymentAmount: 1000, alreadyAllocated: 200, requested: 300 })).toEqual({ allocated: 300, unapplied: 500 }));
  it("blocks over-allocation", () => expect(() => allocatePayment({ paymentAmount: 100, alreadyAllocated: 80, requested: 21 })).toThrow("PAYMENT_OVER_ALLOCATION"));
  it("classifies ageing from original due date", () => expect(ageingBucket(new Date("2026-05-01"), new Date("2026-08-08"))).toBe("90_PLUS"));
  it("keeps formal extensions explicit", () => expect(assertFormalExtension({ originalDueDate: new Date("2026-08-01"), extensionUntil: new Date("2026-08-15"), promisedDate: new Date("2026-08-10"), graceUntil: new Date("2026-08-12") }).extensionUntil).toEqual(new Date("2026-08-15")));
  it("reverses instead of deleting financial history", () => expect(reversalEntry({ originalEntryId: "e1", amount: 20, debitPartyId: "a", creditPartyId: "b" })).toMatchObject({ type: "REVERSAL", debitPartyId: "b", creditPartyId: "a" }));
  it("provides a separate bilingual accounts portal", () => { expect(localizedPortal("EN", "accounts").navigation).toContain("Payment Verification"); expect(localizedPortal("HI", "accounts").navigation).toContain("भुगतान सत्यापन"); });
});
