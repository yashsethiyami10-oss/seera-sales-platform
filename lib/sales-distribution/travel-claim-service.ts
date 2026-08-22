import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postLedgerEntry } from "./financial-service";
import { calculateGovernedTa } from "./phase6-9-rules";

type Db = PrismaClient | Prisma.TransactionClient;

async function activeHeadquarters(db: Db, employeeId: string, at: Date) {
  return db.seeraEmployeeHeadquarters.findFirst({ where: { employeeId, status: "ACTIVE", effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] }, orderBy: { effectiveFrom: "desc" } });
}

async function classifyFromGovernedGeography(db: Db, plannedGeographyId: string | null, headquartersGeographyId: string | null) {
  if (!plannedGeographyId || !headquartersGeographyId) return null;
  let current: string | null = plannedGeographyId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === headquartersGeographyId) return "LOCAL_HQ" as const;
    visited.add(current);
    const node: { parentId: string | null } | null = await db.seeraGeographyNode.findUnique({ where: { id: current }, select: { parentId: true } });
    current = node?.parentId ?? null;
  }
  return "OUTSTATION" as const;
}

async function reviewerFor(db: Db, employeeId: string) {
  const now = new Date();
  return db.seeraAssignment.findFirst({
    where: {
      subjectId: employeeId,
      assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { targetId: true },
  });
}

export async function finalizeDailyTravelClaim(db: PrismaClient, employeeId: string, workSessionId: string) {
  const session = await db.seeraWorkSession.findFirstOrThrow({
    where: { id: workSessionId, employeeId, status: "ENDED" },
    include: { visits: { select: { id: true } } },
  });
  const estimate = await db.seeraTravelEstimate.findUnique({
    where: { employeeId_workSessionId: { employeeId, workSessionId } },
  });
  if (!estimate) return null;
  const source = estimate.sourceEvents as { reviewRequired?: boolean; method?: string; warnings?: string[] };
  const reviewer = await reviewerFor(db, employeeId);
  const at = session.endedAt ?? new Date();
  const headquarters = await activeHeadquarters(db, employeeId, at);
  const governedDutyType = await classifyFromGovernedGeography(db, session.plannedGeographyId ?? null, headquarters?.geographyId ?? null);
  const dutyType = governedDutyType ?? "UNCLASSIFIED";
  const dutyClassificationSource = governedDutyType ? "APPROVED_PLANNED_GEOGRAPHY" : headquarters ? "MANAGER_CLASSIFICATION_REQUIRED" : "HEADQUARTERS_NOT_CONFIGURED";
  const policy = await db.seeraTravelPolicy.findFirst({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lte: at },
      AND: [
        { OR: [{ employeeRole: session.employeeRole }, { employeeRole: null }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
      ],
    },
    orderBy: [{ employeeRole: "desc" }, { effectiveFrom: "desc" }],
  });
  const distanceKm = Number(estimate.distanceKm);
  const existingClaim = await db.seeraTaClaim.findUnique({ where: { travelEstimateId: estimate.id } });
  if (existingClaim && ["SENT_TO_ACCOUNTS", "ACCOUNTS_APPROVED", "PAID", "CLOSED"].includes(existingClaim.status)) return existingClaim;
  const policyStatus = policy ? "CONFIGURED" : "POLICY_NOT_CONFIGURED";
  const amounts = policy
    ? calculateGovernedTa({
        policyType: policy.policyType,
        eligibleKm: distanceKm,
        ratePerKm: Number(policy.ratePerKm ?? 0),
        fixedAllowance: Number(policy.fixedAllowance ?? policy.dailyAllowance ?? 0),
      })
    : null;
  const daEligible = dutyType === "LOCAL_HQ" ? false : dutyType === "OUTSTATION" ? true : null;
  const daStatus = dutyType === "LOCAL_HQ" ? "NOT_APPLICABLE" : dutyType === "OUTSTATION" ? "POLICY_NOT_CONFIGURED" : "PENDING_DUTY_CLASSIFICATION";
  const status = source.reviewRequired ? "TRAVEL_REVIEW_REQUIRED" : "READY_FOR_REVIEW";
  const rateSnapshot = policy
    ? {
        policyId: policy.id,
        policyType: policy.policyType,
        employeeRole: policy.employeeRole,
        ratePerKm: policy.ratePerKm?.toString() ?? null,
        fixedAllowance: (policy.fixedAllowance ?? policy.dailyAllowance)?.toString() ?? null,
        effectiveFrom: policy.effectiveFrom.toISOString(),
        effectiveTo: policy.effectiveTo?.toISOString() ?? null,
        distanceMethod: source.method ?? "CHECKPOINT_HAVERSINE_ESTIMATE",
        calculationVersion: estimate.calculationVersion,
      }
    : {
        policyStatus,
        distanceMethod: source.method ?? "CHECKPOINT_HAVERSINE_ESTIMATE",
        calculationVersion: estimate.calculationVersion,
      };
  const claim = await db.seeraTaClaim.upsert({
    where: { travelEstimateId: estimate.id },
    update: {
      managerId: reviewer?.targetId,
      originalDistanceKm: estimate.distanceKm,
      claimedDistanceKm: estimate.distanceKm,
      vehicleType: policy?.vehicleType ?? "STANDARD_FIELD",
      rateSnapshot,
      travelAmount: amounts?.travelAmount,
      dailyAllowance: amounts?.fixedAllowance ?? 0,
      totalClaimed: amounts?.total,
      policyStatus,
      gpsReviewRequired: Boolean(source.reviewRequired),
      status,
      dutyType,
      dutyClassificationSource,
      classifiedAt: governedDutyType ? at : null,
      classificationReason: governedDutyType ? "Classified from approved planned geography against effective employee HQ geography" : null,
      hqAssignmentId: headquarters?.id,
      taPolicyId: policy?.id,
      taMode: policy?.policyType,
      taRatePerKm: policy?.ratePerKm,
      taAmount: amounts?.travelAmount,
      daEligible,
      daPolicyId: null,
      daAmount: null,
      daStatus,
      totalReimbursement: amounts?.total,
    },
    create: {
      claimNumber: `TA-AUTO-${workSessionId.slice(-18)}`,
      employeeId,
      managerId: reviewer?.targetId,
      claimDate: at,
      travelEstimateId: estimate.id,
      originalDistanceKm: estimate.distanceKm,
      claimedDistanceKm: estimate.distanceKm,
      vehicleType: policy?.vehicleType ?? "STANDARD_FIELD",
      rateSnapshot,
      travelAmount: amounts?.travelAmount,
      dailyAllowance: amounts?.fixedAllowance ?? 0,
      totalClaimed: amounts?.total,
      proofFileIds: [],
      policyStatus,
      gpsReviewRequired: Boolean(source.reviewRequired),
      status,
      dutyType,
      dutyClassificationSource,
      classifiedAt: governedDutyType ? at : null,
      classificationReason: governedDutyType ? "Classified from approved planned geography against effective employee HQ geography" : null,
      hqAssignmentId: headquarters?.id,
      taPolicyId: policy?.id,
      taMode: policy?.policyType,
      taRatePerKm: policy?.ratePerKm,
      taAmount: amounts?.travelAmount,
      daEligible,
      daPolicyId: null,
      daAmount: null,
      daStatus,
      totalReimbursement: amounts?.total,
      submittedAt: at,
      idempotencyKey: `auto-travel:${workSessionId}`,
    },
  });
  await recordAudit(db, {
    actorId: employeeId,
    action: "ta.auto_finalized",
    entityType: "SeeraTaClaim",
    entityId: claim.id,
    afterState: { workSessionId, distanceKm, policyStatus, status, dutyType, dutyClassificationSource, daStatus, warnings: source.warnings ?? [] },
  });
  return claim;
}

async function loadReviewable(db: PrismaClient, reviewerId: string, claimId: string) {
  const claim = await db.seeraTaClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (claim.employeeId === reviewerId) throw new FoundationError("TA_SELF_APPROVAL_DENIED", "Self approval denied", 403);
  if (claim.managerId !== reviewerId) throw new FoundationError("TA_MANAGER_SCOPE_DENIED", "Claim outside reviewer scope", 403);
  if (!["READY_FOR_REVIEW", "TRAVEL_REVIEW_REQUIRED", "RETURNED"].includes(claim.status)) throw new FoundationError("TA_STATE_INVALID", "Claim is not reviewable", 409);
  return claim;
}

export async function approveDailyTravel(db: PrismaClient, reviewerId: string, claimId: string, input: { eligibleDistanceKm: number; reason: string }) {
  await authorize(db, { actorId: reviewerId, permission: "ta_claim:verify" });
  const claim = await loadReviewable(db, reviewerId, claimId);
  if (claim.dutyType === "UNCLASSIFIED") throw new FoundationError("TA_DUTY_CLASSIFICATION_REQUIRED", "Local HQ or Outstation duty classification is required before approval", 409);
  if (input.eligibleDistanceKm < 0 || !input.reason.trim()) throw new FoundationError("INVALID_TA_APPROVAL", "Eligible distance and reason required", 400);
  const snapshot = claim.rateSnapshot as { policyType?: "PER_KM" | "FIXED_DAILY" | "PER_KM_PLUS_FIXED" | "NONE"; ratePerKm?: string | null; fixedAllowance?: string | null };
  const amounts = claim.policyStatus === "CONFIGURED" && snapshot.policyType
    ? calculateGovernedTa({ policyType: snapshot.policyType, eligibleKm: input.eligibleDistanceKm, ratePerKm: Number(snapshot.ratePerKm ?? 0), fixedAllowance: Number(snapshot.fixedAllowance ?? 0) })
    : null;
  const now = new Date();
  const result = await db.seeraTaClaim.update({
    where: { id: claim.id },
    data: {
      approvedDistanceKm: input.eligibleDistanceKm,
      travelAmount: amounts?.travelAmount,
      totalApproved: amounts?.total,
      taAmount: amounts?.travelAmount,
      totalReimbursement: amounts?.total,
      status: "SENT_TO_ACCOUNTS",
      managerVerifiedById: reviewerId,
      approvedAt: now,
      sentToAccountsAt: now,
      remarks: `${claim.remarks ?? ""}\nApproved: ${input.reason}`.trim(),
    },
  });
  await recordAudit(db, { actorId: reviewerId, action: "ta.approved_sent_to_accounts", entityType: "SeeraTaClaim", entityId: claim.id, beforeState: { calculatedDistanceKm: claim.originalDistanceKm.toString() }, afterState: { eligibleDistanceKm: input.eligibleDistanceKm, totalApproved: amounts?.total ?? null } });
  return result;
}

export async function classifyDailyTravelDuty(db: PrismaClient, reviewerId: string, claimId: string, input: { dutyType: "LOCAL_HQ" | "OUTSTATION"; reason: string; reference?: string }) {
  await authorize(db, { actorId: reviewerId, permission: "ta_claim:verify" });
  const claim = await loadReviewable(db, reviewerId, claimId);
  if (!input.reason.trim()) throw new FoundationError("TA_DUTY_REASON_REQUIRED", "Duty classification reason required", 400);
  const daEligible = input.dutyType === "OUTSTATION";
  const result = await db.seeraTaClaim.update({ where: { id: claim.id }, data: { dutyType: input.dutyType, dutyClassificationSource: "MANAGER_GOVERNED_CLASSIFICATION", classifiedById: reviewerId, classifiedAt: new Date(), classificationReason: `${input.reason}${input.reference ? ` (${input.reference})` : ""}`, daEligible, daPolicyId: null, daAmount: null, daStatus: daEligible ? "POLICY_NOT_CONFIGURED" : "NOT_APPLICABLE" } });
  await recordAudit(db, { actorId: reviewerId, action: "ta.duty_classified", entityType: "SeeraTaClaim", entityId: claim.id, beforeState: { dutyType: claim.dutyType }, afterState: { dutyType: input.dutyType, source: "MANAGER_GOVERNED_CLASSIFICATION", reason: input.reason, reference: input.reference ?? null, daStatus: result.daStatus } });
  return result;
}

export async function decideDailyTravel(db: PrismaClient, reviewerId: string, claimId: string, input: { decision: "REJECT" | "RETURN"; reason: string }) {
  await authorize(db, { actorId: reviewerId, permission: "ta_claim:verify" });
  const claim = await loadReviewable(db, reviewerId, claimId);
  if (!input.reason.trim()) throw new FoundationError("TA_DECISION_REASON_REQUIRED", "Decision reason required", 400);
  const status = input.decision === "REJECT" ? "MANAGER_REJECTED" : "RETURNED";
  const result = await db.seeraTaClaim.update({ where: { id: claim.id }, data: { status, returnedAt: input.decision === "RETURN" ? new Date() : null, remarks: `${claim.remarks ?? ""}\n${input.decision}: ${input.reason}`.trim() } });
  await recordAudit(db, { actorId: reviewerId, action: `ta.${input.decision.toLowerCase()}`, entityType: "SeeraTaClaim", entityId: claim.id, afterState: { status, reason: input.reason } });
  return result;
}

export async function requestDailyTravelAdjustment(db: PrismaClient, employeeId: string, claimId: string, input: { requestedDistanceKm: number; reason: string; evidenceFileIds: string[] }) {
  await authorize(db, { actorId: employeeId, permission: "ta_claim:view_self" });
  const claim = await db.seeraTaClaim.findFirst({ where: { id: claimId, employeeId, status: { in: ["READY_FOR_REVIEW", "TRAVEL_REVIEW_REQUIRED", "RETURNED", "MANAGER_REJECTED"] } } });
  if (!claim) throw new FoundationError("TA_ADJUSTMENT_SCOPE_DENIED", "Travel record unavailable for adjustment", 403);
  if (input.requestedDistanceKm < 0 || !input.reason.trim()) throw new FoundationError("TA_ADJUSTMENT_REASON_REQUIRED", "Adjustment distance and reason required", 400);
  const result = await db.seeraTaClaim.update({ where: { id: claim.id }, data: { claimedDistanceKm: input.requestedDistanceKm, deviationReason: input.reason, proofFileIds: { push: input.evidenceFileIds }, status: claim.gpsReviewRequired ? "TRAVEL_REVIEW_REQUIRED" : "READY_FOR_REVIEW" } });
  await recordAudit(db, { actorId: employeeId, action: "ta.adjustment_requested", entityType: "SeeraTaClaim", entityId: claim.id, beforeState: { calculatedDistanceKm: claim.originalDistanceKm.toString(), previousRequestedDistanceKm: claim.claimedDistanceKm.toString() }, afterState: { requestedDistanceKm: input.requestedDistanceKm, reason: input.reason, evidenceFileIds: input.evidenceFileIds } });
  return result;
}

export async function requestTaCorrectionFinal(db: PrismaClient, employeeId: string, claimId: string, input: { correctedDistanceKm: number; reason: string; evidenceFileIds: string[] }) {
  return requestDailyTravelAdjustment(db, employeeId, claimId, { requestedDistanceKm: input.correctedDistanceKm, reason: input.reason, evidenceFileIds: input.evidenceFileIds });
}

export async function payDailyTravel(db: PrismaClient, accountsId: string, claimId: string, input: { employeePartyId: string; companyPartyId: string; idempotencyKey: string; paymentReference: string }) {
  await authorize(db, { actorId: accountsId, permission: "ta_claim:approve" });
  const existing = await db.seeraTaClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (existing.status === "PAID") return { claim: existing, entry: await db.seeraFinancialEntry.findFirst({ where: { taClaimId: claimId } }) };
  if (existing.employeeId === accountsId || existing.status !== "SENT_TO_ACCOUNTS" || existing.totalApproved == null) throw new FoundationError("TA_PAYMENT_STATE_INVALID", "Only an independently approved Accounts claim may be paid", 409);
  if (input.employeePartyId !== existing.employeeId) throw new FoundationError("TA_PAYMENT_EMPLOYEE_MISMATCH", "Payment employee must match the approved travel claim", 400);
  const entry = await postLedgerEntry(db, accountsId, { type: "REIMBURSEMENT", debitPartyType: "COMPANY", debitPartyId: input.companyPartyId, creditPartyType: "EMPLOYEE", creditPartyId: input.employeePartyId, amount: Number(existing.totalApproved), taClaimId: existing.id, reason: `Paid TA reimbursement: ${input.paymentReference}`, commercialSnapshot: { claimNumber: existing.claimNumber, rateSnapshot: existing.rateSnapshot }, idempotencyKey: input.idempotencyKey, approverId: accountsId });
  const claim = await db.seeraTaClaim.update({ where: { id: existing.id }, data: { status: "PAID", accountsApprovedById: accountsId, paidById: accountsId, paidAt: new Date(), amountPaid: existing.totalApproved, paymentReference: input.paymentReference } });
  await recordAudit(db, { actorId: accountsId, action: "ta.paid", entityType: "SeeraTaClaim", entityId: claim.id, afterState: { entryId: entry.id, amountPaid: claim.amountPaid?.toString(), paymentReference: input.paymentReference } });
  return { claim, entry };
}

async function teamIds(db: PrismaClient, managerId: string) {
  const rows = await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: managerId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, select: { subjectId: true } });
  return rows.map((row) => row.subjectId);
}

export async function travelReport(db: PrismaClient, actorId: string, input: { scope: "SELF" | "TEAM" | "ORGANIZATION"; from: Date; to: Date; employeeId?: string; managerId?: string; role?: string; status?: string }) {
  if (input.scope === "SELF") await authorize(db, { actorId, permission: "field_reports:view_self" });
  else if (input.scope === "TEAM") await authorize(db, { actorId, permission: "manager_team:view" });
  else await authorize(db, { actorId, permission: "travel_policy:manage" });
  const scopedIds = input.scope === "SELF" ? [actorId] : input.scope === "TEAM" ? await teamIds(db, actorId) : undefined;
  if (input.employeeId && scopedIds && !scopedIds.includes(input.employeeId)) throw new FoundationError("TRAVEL_REPORT_SCOPE_DENIED", "Employee outside report scope", 403);
  let employeeFilter = input.employeeId ? [input.employeeId] : scopedIds;
  if (input.scope === "ORGANIZATION" && input.managerId) employeeFilter = await teamIds(db, input.managerId);
  const sessions = await db.seeraWorkSession.findMany({
    where: { employeeId: employeeFilter ? { in: employeeFilter } : undefined, employeeRole: input.role || undefined, startedAt: { gte: input.from, lte: input.to } },
    include: { visits: { select: { id: true } } },
    orderBy: { startedAt: "desc" },
  });
  const estimates = await db.seeraTravelEstimate.findMany({ where: { workSessionId: { in: sessions.map((s) => s.id) } } });
  const claims = await db.seeraTaClaim.findMany({ where: { travelEstimateId: { in: estimates.map((e) => e.id) }, ...(input.status ? { status: input.status as never } : {}) } });
  const estimateBySession = new Map(estimates.map((e) => [e.workSessionId, e]));
  const claimByEstimate = new Map(claims.map((c) => [c.travelEstimateId, c]));
  const managerAssignments = input.scope === "ORGANIZATION" ? await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, subjectId: { in: sessions.map((s) => s.employeeId) }, effectiveFrom: { lte: input.to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.from } }] }, select: { subjectId: true, targetId: true }, orderBy: { effectiveFrom: "desc" } }) : [];
  const managerByEmployee = new Map(managerAssignments.map((a) => [a.subjectId, a.targetId]));
  if (input.scope === "TEAM") for (const session of sessions) managerByEmployee.set(session.employeeId, actorId);
  const identityIds = [...new Set([...sessions.map((s) => s.employeeId), ...managerByEmployee.values()])];
  const users = await db.user.findMany({ where: { id: { in: identityIds } }, select: { id: true, name: true, email: true } });
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const headquarters = await db.seeraEmployeeHeadquarters.findMany({ where: { employeeId: { in: sessions.map((s) => s.employeeId) }, status: "ACTIVE", effectiveFrom: { lte: input.to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.from } }] }, orderBy: { effectiveFrom: "desc" } });
  const hqByEmployee = new Map(headquarters.map((hq) => [hq.employeeId, hq.headquartersName]));
  const grouped = new Map<string, { employeeId: string; employeeName: string; role: string; managerId: string | null; managerName: string | null; headquarters: string | null; workingDays: number; travelDays: number; visits: number; calculatedKm: number; eligibleKm: number; localHqDays: number; outstationDays: number; taAmount: number; daAmount: number; totalApproved: number; approvedTa: number; sentToAccounts: number; paid: number; pending: number; exceptions: number }>();
  for (const session of sessions) {
    const estimate = estimateBySession.get(session.id); const claim = estimate ? claimByEstimate.get(estimate.id) : undefined;
    if (input.status && !claim) continue;
    const managerId = managerByEmployee.get(session.employeeId) ?? null;
    const row = grouped.get(session.employeeId) ?? { employeeId: session.employeeId, employeeName: names.get(session.employeeId) ?? session.employeeId, role: session.employeeRole, managerId, managerName: managerId ? names.get(managerId) ?? managerId : null, headquarters: hqByEmployee.get(session.employeeId) ?? null, workingDays: 0, travelDays: 0, visits: 0, calculatedKm: 0, eligibleKm: 0, localHqDays: 0, outstationDays: 0, taAmount: 0, daAmount: 0, totalApproved: 0, approvedTa: 0, sentToAccounts: 0, paid: 0, pending: 0, exceptions: 0 };
    row.workingDays++; row.visits += session.visits.length; if (estimate) { row.travelDays++; row.calculatedKm += Number(estimate.distanceKm); }
    if (claim) { row.eligibleKm += Number(claim.approvedDistanceKm ?? claim.claimedDistanceKm); if (claim.dutyType === "LOCAL_HQ") row.localHqDays++; if (claim.dutyType === "OUTSTATION") row.outstationDays++; row.taAmount += Number(claim.taAmount ?? 0); row.daAmount += Number(claim.daAmount ?? 0); row.totalApproved += Number(claim.totalApproved ?? 0); row.approvedTa += Number(claim.taAmount ?? claim.totalApproved ?? 0); if (claim.status === "SENT_TO_ACCOUNTS") row.sentToAccounts += Number(claim.totalApproved ?? 0); if (claim.status === "PAID") row.paid += Number(claim.amountPaid ?? 0); if (["READY_FOR_REVIEW", "TRAVEL_REVIEW_REQUIRED", "RETURNED"].includes(claim.status)) row.pending += Number(claim.totalReimbursement ?? claim.totalClaimed ?? 0); if (claim.gpsReviewRequired || claim.dutyType === "UNCLASSIFIED") row.exceptions++; }
    grouped.set(session.employeeId, row);
  }
  const rows = [...grouped.values()];
  return { rows, totals: rows.reduce((t, r) => ({ workingDays: t.workingDays + r.workingDays, visits: t.visits + r.visits, calculatedKm: t.calculatedKm + r.calculatedKm, eligibleKm: t.eligibleKm + r.eligibleKm, approvedTa: t.approvedTa + r.approvedTa, sentToAccounts: t.sentToAccounts + r.sentToAccounts, paid: t.paid + r.paid, pending: t.pending + r.pending }), { workingDays: 0, visits: 0, calculatedKm: 0, eligibleKm: 0, approvedTa: 0, sentToAccounts: 0, paid: 0, pending: 0 }) };
}

export async function accountsTravelClaims(db: PrismaClient, actorId: string, status: "PENDING" | "PAID" | "HISTORY") {
  await authorize(db, { actorId, permission: "ta_claim:approve" });
  return db.seeraTaClaim.findMany({ where: status === "PENDING" ? { status: "SENT_TO_ACCOUNTS" } : status === "PAID" ? { status: "PAID" } : { status: { in: ["SENT_TO_ACCOUNTS", "PAID", "ACCOUNTS_REJECTED"] } }, orderBy: { claimDate: "desc" }, take: 200 });
}

export async function configureTravelPolicy(db: PrismaClient, actorId: string, input: { employeeRole?: string; vehicleType: string; policyType: "PER_KM" | "FIXED_DAILY" | "PER_KM_PLUS_FIXED" | "NONE"; ratePerKm?: number; fixedAllowance?: number; effectiveFrom: Date; effectiveTo?: Date; status: "ACTIVE" | "INACTIVE" }) {
  await authorize(db, { actorId, permission: "travel_policy:manage" });
  const needsRate = input.policyType === "PER_KM" || input.policyType === "PER_KM_PLUS_FIXED";
  const needsFixed = input.policyType === "FIXED_DAILY" || input.policyType === "PER_KM_PLUS_FIXED";
  if ((needsRate && (input.ratePerKm == null || input.ratePerKm < 0)) || (needsFixed && (input.fixedAllowance == null || input.fixedAllowance < 0)) || (input.effectiveTo && input.effectiveTo <= input.effectiveFrom)) throw new FoundationError("INVALID_TRAVEL_POLICY", "Policy amounts and effective dates do not match the calculation mode", 400);
  const policy = await db.seeraTravelPolicy.create({ data: { employeeRole: input.employeeRole, vehicleType: input.vehicleType, policyType: input.policyType, ratePerKm: needsRate ? input.ratePerKm : 0, fixedAllowance: needsFixed ? input.fixedAllowance : null, dailyAllowance: needsFixed ? input.fixedAllowance : null, eligibility: { roles: input.employeeRole ? [input.employeeRole] : [], policyType: input.policyType }, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, status: input.status, approvedById: actorId } });
  await recordAudit(db, { actorId, action: "travel_policy.configured", entityType: "SeeraTravelPolicy", entityId: policy.id, afterState: { employeeRole: input.employeeRole, policyType: input.policyType, ratePerKm: input.ratePerKm ?? null, fixedAllowance: input.fixedAllowance ?? null, effectiveFrom: input.effectiveFrom.toISOString(), effectiveTo: input.effectiveTo?.toISOString() ?? null, status: input.status } });
  return policy;
}

export async function configureEmployeeHeadquarters(db: PrismaClient, actorId: string, input: { employeeId: string; headquartersName: string; geographyId?: string; effectiveFrom: Date; effectiveTo?: Date; reason: string }) {
  await authorize(db, { actorId, permission: "travel_policy:manage" });
  if (!input.headquartersName.trim() || !input.reason.trim() || (input.effectiveTo && input.effectiveTo <= input.effectiveFrom)) throw new FoundationError("INVALID_EMPLOYEE_HQ", "Headquarters name, reason and valid effective dates are required", 400);
  await db.user.findUniqueOrThrow({ where: { id: input.employeeId }, select: { id: true } });
  if (input.geographyId) await db.seeraGeographyNode.findFirstOrThrow({ where: { id: input.geographyId, status: "ACTIVE" }, select: { id: true } });
  const assignment = await db.seeraEmployeeHeadquarters.create({ data: { employeeId: input.employeeId, headquartersName: input.headquartersName.trim(), geographyId: input.geographyId, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, configuredById: actorId, reason: input.reason } });
  await recordAudit(db, { actorId, action: "employee_headquarters.configured", entityType: "SeeraEmployeeHeadquarters", entityId: assignment.id, afterState: { employeeId: input.employeeId, headquartersName: input.headquartersName.trim(), geographyId: input.geographyId ?? null, effectiveFrom: input.effectiveFrom.toISOString(), effectiveTo: input.effectiveTo?.toISOString() ?? null, reason: input.reason } });
  return assignment;
}
