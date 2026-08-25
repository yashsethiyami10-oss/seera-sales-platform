import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, recordAudit, postLedgerEntry } = vi.hoisted(() => ({ authorize: vi.fn(), recordAudit: vi.fn(), postLedgerEntry: vi.fn() }));
vi.mock("@/lib/foundation/authorization-service", () => ({ authorize }));
vi.mock("@/lib/foundation/audit-service", () => ({ recordAudit }));
vi.mock("@/lib/sales-distribution/financial-service", () => ({ postLedgerEntry }));

import { accountsTravelClaims, approveDailyTravel, classifyDailyAllowanceDayType, classifyDailyTravelDuty, decideDailyTravel, finalizeDailyTravelClaim, payDailyTravel, travelReport } from "@/lib/sales-distribution/travel-claim-service";

const decimal = (value: number) => ({ toString: () => String(value), valueOf: () => value });

describe("final GPS/TA lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("auto-generates one no-policy daily claim and preserves policy-not-configured", async () => {
    const upsert = vi.fn().mockImplementation(({ create }) => ({ id: "claim-1", ...create }));
    const db = {
      seeraWorkSession: { findFirstOrThrow: vi.fn().mockResolvedValue({ id: "session-1", employeeId: "exec-1", employeeRole: "SALES_EXECUTIVE", status: "ENDED", endedAt: new Date("2026-08-23T12:00:00Z"), visits: [{ id: "v1" }] }) },
      seeraTravelEstimate: { findUnique: vi.fn().mockResolvedValue({ id: "estimate-1", workSessionId: "session-1", distanceKm: 12.5, calculationVersion: "v3", sourceEvents: { method: "CHECKPOINT_HAVERSINE_ESTIMATE", reviewRequired: false } }) },
      seeraAssignment: { findFirst: vi.fn().mockResolvedValue({ targetId: "manager-1" }) },
      seeraEmployeeHeadquarters: { findFirst: vi.fn().mockResolvedValue(null) },
      seeraTravelPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
      seeraTaClaim: { findUnique: vi.fn().mockResolvedValue(null), upsert },
    };
    const first = await finalizeDailyTravelClaim(db as never, "exec-1", "session-1");
    const second = await finalizeDailyTravelClaim(db as never, "exec-1", "session-1");
    expect(first?.status).toBe("READY_FOR_REVIEW");
    expect(first?.policyStatus).toBe("POLICY_NOT_CONFIGURED");
    expect(first?.totalClaimed).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]![0].where).toEqual({ travelEstimateId: "estimate-1" });
    expect(upsert.mock.calls[1]![0].where).toEqual({ travelEstimateId: "estimate-1" });
    expect(second?.idempotencyKey).toBe("auto-travel:session-1");
  });

  it("routes suspicious GPS to travel review", async () => {
    const db = { seeraWorkSession: { findFirstOrThrow: vi.fn().mockResolvedValue({ employeeRole: "SALES_EXECUTIVE", status: "ENDED", endedAt: new Date(), visits: [] }) }, seeraTravelEstimate: { findUnique: vi.fn().mockResolvedValue({ id: "e1", distanceKm: 0, calculationVersion: "v3", sourceEvents: { reviewRequired: true, warnings: ["IMPOSSIBLE_SPEED"] } }) }, seeraAssignment: { findFirst: vi.fn().mockResolvedValue({ targetId: "m1" }) }, seeraEmployeeHeadquarters: { findFirst: vi.fn().mockResolvedValue(null) }, seeraTravelPolicy: { findFirst: vi.fn().mockResolvedValue(null) }, seeraTaClaim: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockImplementation(({ create }) => ({ id: "c1", ...create })) } };
    expect((await finalizeDailyTravelClaim(db as never, "e1", "s1"))?.status).toBe("TRAVEL_REVIEW_REQUIRED");
  });

  it("does not recalculate an approved policy snapshot on End Day retry", async () => {
    const paid = { id: "c-paid", status: "PAID", rateSnapshot: { policyId: "historic", ratePerKm: "5" } };
    const upsert = vi.fn();
    const db = { seeraWorkSession: { findFirstOrThrow: vi.fn().mockResolvedValue({ employeeRole: "SALES_EXECUTIVE", status: "ENDED", endedAt: new Date(), visits: [] }) }, seeraTravelEstimate: { findUnique: vi.fn().mockResolvedValue({ id: "est-paid", distanceKm: 10, calculationVersion: "v3", sourceEvents: {} }) }, seeraAssignment: { findFirst: vi.fn().mockResolvedValue({ targetId: "m1" }) }, seeraEmployeeHeadquarters: { findFirst: vi.fn().mockResolvedValue(null) }, seeraTravelPolicy: { findFirst: vi.fn().mockResolvedValue({ id: "new-policy" }) }, seeraTaClaim: { findUnique: vi.fn().mockResolvedValue(paid), upsert } };
    expect(await finalizeDailyTravelClaim(db as never, "e1", "s1")).toBe(paid);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("Manager approval sends to Accounts without marking paid", async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({ id: "c1", employeeId: "e1", ...data }));
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "LOCAL_HQ", originalDistanceKm: decimal(10), claimedDistanceKm: decimal(10), rateSnapshot: { policyType: "PER_KM", ratePerKm: "5" }, policyStatus: "CONFIGURED", remarks: null }), update } };
    const result = await approveDailyTravel(db as never, "m1", "c1", { eligibleDistanceKm: 9, reason: "Verified route" });
    expect(result.status).toBe("SENT_TO_ACCOUNTS");
    expect(result.totalApproved).toBe(45);
    expect(result.paidAt).toBeUndefined();
    expect(postLedgerEntry).not.toHaveBeenCalled();
  });

  it("blocks self approval but permits the assigned higher authority", async () => {
    const claim = { id: "c1", employeeId: "manager-1", managerId: "founder-1", status: "READY_FOR_REVIEW", dutyType: "LOCAL_HQ", originalDistanceKm: decimal(5), claimedDistanceKm: decimal(5), rateSnapshot: { policyType: "NONE" }, policyStatus: "CONFIGURED", remarks: null };
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update: vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data })) } };
    await expect(approveDailyTravel(db as never, "manager-1", "c1", { eligibleDistanceKm: 5, reason: "self" })).rejects.toMatchObject({ code: "TA_SELF_APPROVAL_DENIED" });
    await expect(approveDailyTravel(db as never, "founder-1", "c1", { eligibleDistanceKm: 5, reason: "higher approval" })).resolves.toMatchObject({ status: "SENT_TO_ACCOUNTS" });
  });

  it("blocks approval of an Outstation claim until Half Day / Full Day is classified", async () => {
    const claim = { id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION", dayClassification: null, originalDistanceKm: decimal(10), claimedDistanceKm: decimal(10), rateSnapshot: { policyType: "PER_KM", ratePerKm: "2" }, policyStatus: "CONFIGURED", remarks: null };
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim) } };
    await expect(approveDailyTravel(db as never, "m1", "c1", { eligibleDistanceKm: 10, reason: "ok" })).rejects.toMatchObject({ code: "TA_DAY_CLASSIFICATION_REQUIRED" });
  });

  it("Full Day Outstation approval sums TA + the employee's configured DA into totalApproved (Neeraj: ₹2/km + ₹150)", async () => {
    const claim = { id: "c1", employeeId: "neeraj-1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION", dayClassification: "FULL_DAY", originalDistanceKm: decimal(120), claimedDistanceKm: decimal(120), rateSnapshot: { policyType: "PER_KM", ratePerKm: "2" }, policyStatus: "CONFIGURED", remarks: null };
    const update = vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data }));
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update }, seeraDaPolicy: { findFirst: vi.fn().mockResolvedValue({ id: "da-neeraj", amount: decimal(150) }) } };
    const result = await approveDailyTravel(db as never, "m1", "c1", { eligibleDistanceKm: 120, reason: "Verified" });
    expect(result.totalApproved).toBe(390); // 120km * 2 = 240 TA + 150 DA
    expect(result.daAmount).toBe(150);
    expect(result.daStatus).toBe("CONFIGURED");
  });

  it("refuses to approve a Full Day Outstation claim with no DA policy configured for that employee — never guesses an amount", async () => {
    const claim = { id: "c1", employeeId: "unconfigured-1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION", dayClassification: "FULL_DAY", originalDistanceKm: decimal(10), claimedDistanceKm: decimal(10), rateSnapshot: { policyType: "PER_KM", ratePerKm: "2" }, policyStatus: "CONFIGURED", remarks: null };
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim) }, seeraDaPolicy: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(approveDailyTravel(db as never, "m1", "c1", { eligibleDistanceKm: 10, reason: "Verified" })).rejects.toMatchObject({ code: "DA_POLICY_NOT_CONFIGURED" });
  });

  it("Half Day Outstation approval never pays DA even with a configured Full Day policy present", async () => {
    const claim = { id: "c1", employeeId: "neeraj-1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION", dayClassification: "HALF_DAY", originalDistanceKm: decimal(50), claimedDistanceKm: decimal(50), rateSnapshot: { policyType: "PER_KM", ratePerKm: "2" }, policyStatus: "CONFIGURED", remarks: null };
    const update = vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data }));
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update }, seeraDaPolicy: { findFirst: vi.fn() } };
    const result = await approveDailyTravel(db as never, "m1", "c1", { eligibleDistanceKm: 50, reason: "Verified" });
    expect(result.totalApproved).toBe(100); // 50km * 2 = 100 TA, DA = 0
    expect(result.daAmount).toBe(0);
    expect(result.daStatus).toBe("HALF_DAY_NOT_PAYABLE");
    expect(db.seeraDaPolicy.findFirst).not.toHaveBeenCalled(); // Half Day never even looks up a policy
  });

  describe("classifyDailyAllowanceDayType — Half Day / Full Day gate (Founder final policy, 25-Aug)", () => {
    it("rejects day classification for a claim that is not Outstation", async () => {
      const claim = { id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "LOCAL_HQ" };
      const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim) } };
      await expect(classifyDailyAllowanceDayType(db as never, "m1", "c1", { dayClassification: "FULL_DAY", reason: "test" })).rejects.toMatchObject({ code: "TA_DAY_CLASSIFICATION_NOT_APPLICABLE" });
    });
    it("requires a reason", async () => {
      const claim = { id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION" };
      const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim) } };
      await expect(classifyDailyAllowanceDayType(db as never, "m1", "c1", { dayClassification: "FULL_DAY", reason: "" })).rejects.toMatchObject({ code: "TA_DAY_CLASSIFICATION_REASON_REQUIRED" });
    });
    it("Full Day resolves the employee-scoped DA policy (Manoj: ₹300)", async () => {
      const claim = { id: "c1", employeeId: "manoj-1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "OUTSTATION", dayClassification: null };
      const update = vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data }));
      const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update }, seeraDaPolicy: { findFirst: vi.fn().mockResolvedValue({ id: "da-manoj", amount: decimal(300) }) } };
      const result = await classifyDailyAllowanceDayType(db as never, "m1", "c1", { dayClassification: "FULL_DAY", reason: "Confirmed overnight outstation" });
      expect(result.dayClassification).toBe("FULL_DAY");
      expect(result.daAmount).toBe(300);
      expect(result.daStatus).toBe("CONFIGURED");
      expect(db.seeraDaPolicy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: "manoj-1", policyType: "FULL_DAY" }) }));
    });
  });

  it.each([["REJECT", "MANAGER_REJECTED"], ["RETURN", "RETURNED"]] as const)("supports Manager %s with a reason", async (decision, status) => {
    const claim = { id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", remarks: null };
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update: vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data })) } };
    await expect(decideDailyTravel(db as never, "m1", "c1", { decision, reason: "Governed decision" })).resolves.toMatchObject({ status });
  });

  it("Accounts payment is idempotent and ledger posting occurs only at payment", async () => {
    const pending = { id: "c1", employeeId: "e1", status: "SENT_TO_ACCOUNTS", totalApproved: decimal(50), claimNumber: "TA-1", rateSnapshot: {} };
    const paid = { ...pending, status: "PAID", amountPaid: decimal(50), paidAt: new Date() };
    const find = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(paid);
    const db = { seeraTaClaim: { findUniqueOrThrow: find, update: vi.fn().mockResolvedValue(paid) }, seeraFinancialEntry: { findFirst: vi.fn().mockResolvedValue({ id: "entry-1", taClaimId: "c1" }) } };
    postLedgerEntry.mockResolvedValue({ id: "entry-1", taClaimId: "c1" });
    const input = { employeePartyId: "e1", companyPartyId: "company", idempotencyKey: "pay-1", paymentReference: "UTR-1" };
    await payDailyTravel(db as never, "accounts-1", "c1", input);
    await payDailyTravel(db as never, "accounts-1", "c1", input);
    expect(postLedgerEntry).toHaveBeenCalledTimes(1);
  });

  it("aggregates only the Manager's assigned team", async () => {
    const db = {
      seeraAssignment: { findMany: vi.fn().mockResolvedValue([{ subjectId: "e1" }]) },
      seeraWorkSession: { findMany: vi.fn().mockResolvedValue([{ id: "s1", employeeId: "e1", employeeRole: "SALES_EXECUTIVE", visits: [{ id: "v1" }, { id: "v2" }] }]) },
      seeraTravelEstimate: { findMany: vi.fn().mockResolvedValue([{ id: "est1", workSessionId: "s1", distanceKm: decimal(10) }]) },
      seeraTaClaim: { findMany: vi.fn().mockResolvedValue([{ travelEstimateId: "est1", claimedDistanceKm: decimal(10), approvedDistanceKm: decimal(9), totalApproved: decimal(45), amountPaid: null, totalClaimed: decimal(50), status: "SENT_TO_ACCOUNTS", gpsReviewRequired: false }]) },
      seeraEmployeeHeadquarters: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "e1", name: "Executive One", email: "e1@example.com" }]) },
    };
    const report = await travelReport(db as never, "m1", { scope: "TEAM", from: new Date("2026-08-01"), to: new Date("2026-08-31") });
    expect(db.seeraWorkSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: { in: ["e1"] } }) }));
    expect(report.rows[0]).toMatchObject({ employeeId: "e1", workingDays: 1, visits: 2, calculatedKm: 10, eligibleKm: 9, sentToAccounts: 45 });
  });

  it.each([["neeraj", "jhansi"], ["manoj", "bhilwara"]])("calculates %s local-HQ TA at Rs 2/km with DA not applicable", async (employeeId, geographyId) => {
    const upsert = vi.fn().mockImplementation(({ create }) => ({ id: `claim-${employeeId}`, ...create }));
    const db = {
      seeraWorkSession: { findFirstOrThrow: vi.fn().mockResolvedValue({ employeeId, employeeRole: "SALES_EXECUTIVE", status: "ENDED", endedAt: new Date("2026-08-23T12:00:00Z"), plannedGeographyId: geographyId, visits: [] }) },
      seeraTravelEstimate: { findUnique: vi.fn().mockResolvedValue({ id: `estimate-${employeeId}`, distanceKm: decimal(10), calculationVersion: "v3", sourceEvents: { method: "CHECKPOINT_HAVERSINE_ESTIMATE" } }) },
      seeraAssignment: { findFirst: vi.fn().mockResolvedValue({ targetId: "manager-1" }) },
      seeraEmployeeHeadquarters: { findFirst: vi.fn().mockResolvedValue({ id: `hq-${employeeId}`, geographyId }) },
      seeraGeographyNode: { findUnique: vi.fn() },
      seeraTravelPolicy: { findFirst: vi.fn().mockResolvedValue({ id: "policy-2", policyType: "PER_KM", employeeRole: "SALES_EXECUTIVE", ratePerKm: decimal(2), fixedAllowance: null, dailyAllowance: null, vehicleType: "STANDARD_FIELD", effectiveFrom: new Date("2026-08-23T00:00:00Z"), effectiveTo: null }) },
      seeraTaClaim: { findUnique: vi.fn().mockResolvedValue(null), upsert },
    };
    await expect(finalizeDailyTravelClaim(db as never, employeeId, `session-${employeeId}`)).resolves.toMatchObject({ dutyType: "LOCAL_HQ", taAmount: 20, daEligible: false, daAmount: null, daStatus: "NOT_APPLICABLE", totalReimbursement: 20 });
  });

  it("keeps outstation DA pending and separate while calculating TA at Rs 2/km", async () => {
    const db = {
      seeraWorkSession: { findFirstOrThrow: vi.fn().mockResolvedValue({ employeeId: "exec-1", employeeRole: "SALES_EXECUTIVE", status: "ENDED", endedAt: new Date("2026-08-23T12:00:00Z"), plannedGeographyId: "remote-beat", visits: [] }) },
      seeraTravelEstimate: { findUnique: vi.fn().mockResolvedValue({ id: "estimate-outstation", distanceKm: decimal(15), calculationVersion: "v3", sourceEvents: {} }) },
      seeraAssignment: { findFirst: vi.fn().mockResolvedValue({ targetId: "manager-1" }) },
      seeraEmployeeHeadquarters: { findFirst: vi.fn().mockResolvedValue({ id: "hq-1", geographyId: "home-territory" }) },
      seeraGeographyNode: { findUnique: vi.fn().mockResolvedValueOnce({ parentId: "remote-area" }).mockResolvedValueOnce({ parentId: null }) },
      seeraTravelPolicy: { findFirst: vi.fn().mockResolvedValue({ id: "policy-2", policyType: "PER_KM", employeeRole: "SALES_EXECUTIVE", ratePerKm: decimal(2), fixedAllowance: null, dailyAllowance: null, vehicleType: "STANDARD_FIELD", effectiveFrom: new Date("2026-08-23T00:00:00Z"), effectiveTo: null }) },
      seeraTaClaim: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockImplementation(({ create }) => ({ id: "claim-outstation", ...create })) },
    };
    // DA (Founder final policy, 25-Aug): an OUTSTATION day is not yet DA-payable at finalize —
    // Half Day / Full Day must be classified first (a separate gate from duty location), so this
    // is honestly PENDING_DAY_CLASSIFICATION rather than jumping straight to POLICY_NOT_CONFIGURED.
    await expect(finalizeDailyTravelClaim(db as never, "exec-1", "session-outstation")).resolves.toMatchObject({ dutyType: "OUTSTATION", taAmount: 30, daEligible: true, daAmount: null, daStatus: "PENDING_DAY_CLASSIFICATION", totalReimbursement: 30 });
  });

  it("requires independent Manager classification and preserves an audit trail", async () => {
    const claim = { id: "c1", employeeId: "e1", managerId: "m1", status: "READY_FOR_REVIEW", dutyType: "UNCLASSIFIED" };
    const db = { seeraTaClaim: { findUniqueOrThrow: vi.fn().mockResolvedValue(claim), update: vi.fn().mockImplementation(({ data }) => ({ ...claim, ...data })) } };
    await expect(classifyDailyTravelDuty(db as never, "e1", "c1", { dutyType: "LOCAL_HQ", reason: "self" })).rejects.toMatchObject({ code: "TA_SELF_APPROVAL_DENIED" });
    // Same DA gate as above — duty just became OUTSTATION, day-length isn't classified yet.
    await expect(classifyDailyTravelDuty(db as never, "m1", "c1", { dutyType: "OUTSTATION", reason: "Route outside HQ", reference: "plan-42" })).resolves.toMatchObject({ dutyType: "OUTSTATION", daEligible: true, daStatus: "PENDING_DAY_CLASSIFICATION" });
    expect(recordAudit).toHaveBeenCalledWith(db, expect.objectContaining({ actorId: "m1", action: "ta.duty_classified", beforeState: { dutyType: "UNCLASSIFIED" } }));
  });

  it("Accounts pending-payment filter exposes only sent-to-Accounts claims", async () => {
    const findMany = vi.fn().mockResolvedValue([]); const db = { seeraTaClaim: { findMany } };
    await accountsTravelClaims(db as never, "accounts-1", "PENDING");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "SENT_TO_ACCOUNTS" } }));
  });
});
