import { describe, expect, it } from "vitest";
import { assertHardDeleteAllowed, assertPartnerCanTransact, assertTaVerifier, assertWorkingLocation, calculateTa, closureDecision } from "@/lib/sales-distribution/phase6-9-rules";

describe("Phase 9 travel and partner lifecycle", () => {
  it("calculates policy-bounded TA", () => expect(calculateTa({ estimatedKm: 100, claimedKm: 120, ratePerKm: 5, toll: 50, parking: 20, dailyAllowance: 100 })).toEqual({ payableKm: 100, travelAmount: 500, total: 670 }));
  it("denies TA self approval", () => expect(() => assertTaVerifier({ employeeId: "u1", verifierId: "u1", employeeRole: "SALES_EXECUTIVE" })).toThrow("TA_SELF_APPROVAL_DENIED"));
  it("requires higher approval for manager claims", () => expect(() => assertTaVerifier({ employeeId: "m1", managerId: "director1", verifierId: "director1", employeeRole: "SALES_MANAGER" })).toThrow("MANAGER_CLAIM_REQUIRES_HIGHER_APPROVER"));
  it("limits location evidence to active work context", () => expect(() => assertWorkingLocation({ workSessionActive: false, eventAt: new Date(), workStartedAt: new Date() })).toThrow("LOCATION_OUTSIDE_WORK_CONTEXT"));
  it("blocks closure with unresolved obligations", () => expect(() => closureDecision({ openOrders: 1, outstanding: 0, advances: 0, stock: 0, pendingClaims: 0, activeUsers: 0 }, false, false)).toThrow("PARTNER_OBLIGATIONS_UNRESOLVED"));
  it("requires elevated force-close authority", () => expect(() => closureDecision({ openOrders: 1, outstanding: 0, advances: 0, stock: 0, pendingClaims: 0, activeUsers: 0 }, true, false)).toThrow("FORCE_CLOSE_PERMISSION_REQUIRED"));
  it("blocks transactions for suspended partners", () => expect(() => assertPartnerCanTransact("SUSPENDED")).toThrow("PARTNER_NOT_ACTIVE"));
  it("preserves partners with business history", () => expect(() => assertHardDeleteAllowed({ businessHistoryCount: 1, lifecycle: "PROSPECT" })).toThrow("PARTNER_HARD_DELETE_DENIED"));
});
