import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ConflictError, ForbiddenError } from "@/lib/errors";
import type { EnterprisePrincipal } from "@/lib/enterprise/context";
import {
  claimOperation,
  enforceSegregationOfDuties,
  operationWasAcquired,
} from "@/lib/enterprise-phase2/foundation";
import {
  claimPhase2Job,
  completePhase2Job,
  failPhase2Job,
  findStalePhase2Jobs,
  retryPhase2Job,
} from "@/lib/enterprise-phase2/jobs";

const suffix = `part3ar_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const operationType = `REMEDIATION:${suffix}`;
let principal: EnterprisePrincipal;
let independentApproverId: string;

function claim(key: string, fingerprint: string, correlationId = crypto.randomUUID()) {
  return prisma.$transaction((tx) => claimOperation(tx, principal, {
    organizationKey: "MUV",
    operationType,
    idempotencyKey: key,
    requestFingerprint: fingerprint,
    correlationId,
  }));
}

describe("Part 3A-R actual database foundations", () => {
  beforeAll(async () => {
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    if (users.length < 2) throw new Error("Two active users are required for maker/checker tests");
    principal = {
      id: users[0]!.id,
      email: users[0]!.email,
      roleName: "Founder",
      isFounder: true,
      permissions: new Set(["finance.journals.approve"]),
      organizationKey: "MUV",
    };
    independentApproverId = users[1]!.id;
  });

  afterAll(async () => {
    await prisma.phase2Operation.deleteMany({
      where: { operationType: { in: [operationType, `JOB:${operationType}`] } },
    });
    await prisma.phase2SodPolicy.deleteMany({
      where: { organizationKey: "MUV", operationType },
    });
  });

  it("replays an exact sequential claim without entering an aborted transaction", async () => {
    const correlationId = crypto.randomUUID();
    const first = await claim(`${suffix}:sequential`, "fingerprint-a", correlationId);
    const replay = await claim(`${suffix}:sequential`, "fingerprint-a");
    expect(operationWasAcquired(first, correlationId)).toBe(true);
    expect(replay.id).toBe(first.id);
    expect(replay.correlationId).toBe(correlationId);
  });

  it("rejects a reused key with a different fingerprint using a safe conflict", async () => {
    await claim(`${suffix}:conflict`, "fingerprint-a");
    await expect(claim(`${suffix}:conflict`, "fingerprint-b"))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it("returns one logical operation to actual concurrent database claimants", async () => {
    const results = await Promise.all([
      claim(`${suffix}:concurrent`, "same"),
      claim(`${suffix}:concurrent`, "same"),
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await prisma.phase2Operation.count({
      where: { operationType, idempotencyKey: `${suffix}:concurrent` },
    })).toBe(1);
  });

  it("supports job claim, replay, failure, retry, stale detection, and completion", async () => {
    const command = {
      organizationKey: "MUV",
      jobType: operationType,
      idempotencyKey: `${suffix}:job`,
      correlationId: crypto.randomUUID(),
      payload: { period: "2026-07" },
    };
    const first = await claimPhase2Job(principal, command);
    expect(first.acquired).toBe(true);
    expect(first.operation.status).toBe("RUNNING");

    const replay = await claimPhase2Job(principal, { ...command, correlationId: crypto.randomUUID() });
    expect(replay.acquired).toBe(false);
    expect(replay.operation.id).toBe(first.operation.id);

    const failed = await failPhase2Job(principal, {
      organizationKey: "MUV", operationId: first.operation.id, failureCode: "TEMPORARY_FAILURE",
    });
    expect(failed.status).toBe("FAILED");

    const retried = await retryPhase2Job(principal, {
      organizationKey: "MUV", operationId: first.operation.id, correlationId: crypto.randomUUID(),
    });
    expect(retried.status).toBe("RUNNING");
    expect(retried.failureCode).toBeNull();

    const stale = await findStalePhase2Jobs(principal, {
      organizationKey: "MUV", staleBefore: new Date(Date.now() + 1_000),
    });
    expect(stale.some((operation) => operation.id === first.operation.id)).toBe(true);

    const completed = await completePhase2Job(principal, {
      organizationKey: "MUV",
      operationId: first.operation.id,
      resultEntityType: "VerificationResult",
      resultEntityId: suffix,
    });
    expect(completed).toMatchObject({
      status: "COMPLETED",
      resultEntityType: "VerificationResult",
      resultEntityId: suffix,
      failureCode: null,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("grants exactly one acquisition to concurrent job claimants", async () => {
    const base = {
      organizationKey: "MUV",
      jobType: operationType,
      idempotencyKey: `${suffix}:concurrent-job`,
      payload: { period: "2026-08" },
    };
    const results = await Promise.all([
      claimPhase2Job(principal, { ...base, correlationId: crypto.randomUUID() }),
      claimPhase2Job(principal, { ...base, correlationId: crypto.randomUUID() }),
    ]);
    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(new Set(results.map((result) => result.operation.id)).size).toBe(1);
  });

  it("loads active SoD policy and requires trusted authority plus independent approval evidence", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.phase2SodPolicy.create({ data: {
        organizationKey: "MUV",
        operationType,
        preparerAction: "PREPARE",
        approverAction: "APPROVE",
        overridePermission: "finance.journals.approve",
        overrideApprovalType: "MANUAL_JOURNAL",
      } });
      const unauthorized = { ...principal, isFounder: false, permissions: new Set<string>() };
      await expect(enforceSegregationOfDuties(tx, unauthorized, {
        organizationKey: "MUV", operationType, subjectType: "MANUAL_JOURNAL",
        subjectId: `${suffix}:sod`, preparerId: unauthorized.id, overrideReason: "Required correction",
      })).rejects.toBeInstanceOf(ForbiddenError);

      await expect(enforceSegregationOfDuties(tx, principal, {
        organizationKey: "MUV", operationType, subjectType: "MANUAL_JOURNAL",
        subjectId: `${suffix}:sod`, preparerId: principal.id, overrideReason: "Required correction",
      })).rejects.toBeInstanceOf(ForbiddenError);

      await tx.salesAuditLog.create({ data: {
        userId: independentApproverId,
        module: "ENTERPRISE_PHASE2_APPROVAL",
        action: "APPROVED",
        recordType: "MANUAL_JOURNAL",
        recordId: `${suffix}:sod`,
      } });
      const beforeAudit = await tx.salesAuditLog.count({
        where: { module: "ENTERPRISE_PHASE2_SOD", recordId: `${suffix}:sod` },
      });
      const beforeTimeline = await tx.salesTimelineEvent.count({
        where: { relatedRecordType: "MANUAL_JOURNAL", relatedRecordId: `${suffix}:sod` },
      });
      const result = await enforceSegregationOfDuties(tx, principal, {
        organizationKey: "MUV", operationType, subjectType: "MANUAL_JOURNAL",
        subjectId: `${suffix}:sod`, preparerId: principal.id, overrideReason: "Required correction",
      });
      expect(result.overridden).toBe(true);
      expect(await tx.salesAuditLog.count({
        where: { module: "ENTERPRISE_PHASE2_SOD", recordId: `${suffix}:sod` },
      })).toBe(beforeAudit + 1);
      expect(await tx.salesTimelineEvent.count({
        where: { relatedRecordType: "MANUAL_JOURNAL", relatedRecordId: `${suffix}:sod` },
      })).toBe(beforeTimeline + 1);
      throw new Error("ROLLBACK_SOD_VERIFICATION");
    }).catch((error) => {
      if ((error as Error).message !== "ROLLBACK_SOD_VERIFICATION") throw error;
    });
  });
});
