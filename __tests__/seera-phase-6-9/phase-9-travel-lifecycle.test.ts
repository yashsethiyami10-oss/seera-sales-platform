import { describe, expect, it } from "vitest";
import { assertHardDeleteAllowed, assertPartnerCanTransact, assertTaVerifier, assertWorkingLocation, calculateDa, calculateGovernedTa, calculateTa, closureDecision } from "@/lib/sales-distribution/phase6-9-rules";

describe("Phase 9 travel and partner lifecycle", () => {
  it("calculates policy-bounded TA", () => expect(calculateTa({ estimatedKm: 100, claimedKm: 120, ratePerKm: 5, toll: 50, parking: 20, dailyAllowance: 100 })).toEqual({ payableKm: 100, travelAmount: 500, total: 670 }));
  it.each([["PER_KM", 250], ["FIXED_DAILY", 100], ["PER_KM_PLUS_FIXED", 350], ["NONE", 0]] as const)("supports governed %s policy", (policyType, total) => expect(calculateGovernedTa({ policyType, eligibleKm: 50, ratePerKm: 5, fixedAllowance: 100 }).total).toBe(total));
  it("denies TA self approval", () => expect(() => assertTaVerifier({ employeeId: "u1", verifierId: "u1", employeeRole: "SALES_EXECUTIVE" })).toThrow("TA_SELF_APPROVAL_DENIED"));
  it("requires higher approval for manager claims", () => expect(() => assertTaVerifier({ employeeId: "m1", managerId: "director1", verifierId: "director1", employeeRole: "SALES_MANAGER" })).toThrow("MANAGER_CLAIM_REQUIRES_HIGHER_APPROVER"));
  it("limits location evidence to active work context", () => expect(() => assertWorkingLocation({ workSessionActive: false, eventAt: new Date(), workStartedAt: new Date() })).toThrow("LOCATION_OUTSIDE_WORK_CONTEXT"));
  it("blocks closure with unresolved obligations", () => expect(() => closureDecision({ openOrders: 1, outstanding: 0, advances: 0, stock: 0, pendingClaims: 0, activeUsers: 0 }, false, false)).toThrow("PARTNER_OBLIGATIONS_UNRESOLVED"));
  it("requires elevated force-close authority", () => expect(() => closureDecision({ openOrders: 1, outstanding: 0, advances: 0, stock: 0, pendingClaims: 0, activeUsers: 0 }, true, false)).toThrow("FORCE_CLOSE_PERMISSION_REQUIRED"));
  it("blocks transactions for suspended partners", () => expect(() => assertPartnerCanTransact("SUSPENDED")).toThrow("PARTNER_NOT_ACTIVE"));
  it("preserves partners with business history", () => expect(() => assertHardDeleteAllowed({ businessHistoryCount: 1, lifecycle: "PROSPECT" })).toThrow("PARTNER_HARD_DELETE_DENIED"));

  // DA (Daily Allowance) — Founder final policy, 25-Aug. Separate allowance from TA; never guessed;
  // Half Day and Local HQ are always ₹0 by rule, never a policy lookup.
  describe("DA — Founder final policy (25-Aug)", () => {
    it("Local HQ is never eligible for DA, regardless of day classification or a configured amount", () => {
      expect(calculateDa({ dutyType: "LOCAL_HQ", dayClassification: null, fullDayAmount: 150 })).toEqual({ daEligible: false, daAmount: 0, daStatus: "NOT_APPLICABLE" });
      expect(calculateDa({ dutyType: "LOCAL_HQ", dayClassification: "FULL_DAY", fullDayAmount: 300 })).toEqual({ daEligible: false, daAmount: 0, daStatus: "NOT_APPLICABLE" });
    });
    it("Outstation with no day classification yet is pending, not guessed", () => {
      expect(calculateDa({ dutyType: "OUTSTATION", dayClassification: null, fullDayAmount: 150 })).toEqual({ daEligible: true, daAmount: 0, daStatus: "PENDING_DAY_CLASSIFICATION" });
    });
    it("Outstation Half Day is always DA=0, never a fabricated payable", () => {
      expect(calculateDa({ dutyType: "OUTSTATION", dayClassification: "HALF_DAY", fullDayAmount: 300 })).toEqual({ daEligible: true, daAmount: 0, daStatus: "HALF_DAY_NOT_PAYABLE" });
    });
    it("Outstation Full Day with no configured policy is honestly unconfigured, never a default amount", () => {
      expect(calculateDa({ dutyType: "OUTSTATION", dayClassification: "FULL_DAY", fullDayAmount: null })).toEqual({ daEligible: true, daAmount: 0, daStatus: "POLICY_NOT_CONFIGURED" });
    });
    it.each([
      ["Neeraj", 150],
      ["Manoj", 300],
      ["Awdhesh", 300],
    ])("%s — Outstation Full Day pays the employee's configured amount (₹%i)", (_name, amount) => {
      expect(calculateDa({ dutyType: "OUTSTATION", dayClassification: "FULL_DAY", fullDayAmount: amount })).toEqual({ daEligible: true, daAmount: amount, daStatus: "CONFIGURED" });
    });
    it("rejects a negative configured amount rather than silently accepting it", () => {
      expect(() => calculateDa({ dutyType: "OUTSTATION", dayClassification: "FULL_DAY", fullDayAmount: -10 })).toThrow("INVALID_DA_INPUT");
    });
    it("TA and DA are computed independently and sum without double counting", () => {
      const ta = calculateGovernedTa({ policyType: "PER_KM", eligibleKm: 120, ratePerKm: 2, fixedAllowance: 0 }); // Founder TA: ₹2/km
      const da = calculateDa({ dutyType: "OUTSTATION", dayClassification: "FULL_DAY", fullDayAmount: 150 }); // Neeraj full-day
      expect(ta.total).toBe(240);
      expect(da.daAmount).toBe(150);
      expect(ta.total + da.daAmount).toBe(390);
    });
  });
});
