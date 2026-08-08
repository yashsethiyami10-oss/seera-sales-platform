import { createHash } from "node:crypto";
import { Prisma, type Phase2Operation } from "@prisma/client";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import type { EnterprisePrincipal, EnterpriseTx } from "@/lib/enterprise/context";
import { requireOrganization } from "@/lib/enterprise/context";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";

export const PHASE2_FEATURE_FLAGS = [
  "ENTERPRISE_BUSINESS_NETWORK_ENABLED",
  "ENTERPRISE_PARTNER_PORTAL_ENABLED",
  "ENTERPRISE_FINANCE_ENABLED",
  "ENTERPRISE_FINANCIAL_POSTING_ENABLED",
  "ENTERPRISE_BANKING_RECONCILIATION_ENABLED",
  "ENTERPRISE_TAX_COMPLIANCE_ENABLED",
  "ENTERPRISE_FINANCIAL_REPORTING_ENABLED",
  "ENTERPRISE_FOUNDER_OS_ENABLED",
  "ENTERPRISE_FOUNDER_AI_INTELLIGENCE_ENABLED",
  // Part 3C addition (Section 36's advisory-only Finance AI adapter): no
  // existing flag above covers an AI extension point specifically, so this
  // one is appended rather than overloading ENTERPRISE_FINANCE_ENABLED.
  "ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED",
] as const;

export const PHASE2_WORKFLOW_SUBJECTS = [
  "PARTNER_ONBOARDING", "AGREEMENT", "COMMERCIAL_POLICY", "ROYALTY",
  "COMMISSION", "CLAIM", "MANUAL_JOURNAL", "EXPENSE", "PAYMENT",
  "PERIOD_REOPENING", "TAX_ADJUSTMENT", "BUDGET", "STRATEGIC_DECISION",
] as const;

export const PHASE2_NOTIFICATION_EVENTS = [
  "PARTNER_ONBOARDING_STATUS", "AGREEMENT_STATUS", "ROYALTY_STATUS",
  "COMMISSION_STATUS", "CLAIM_STATUS", "PAYMENT_DUE", "RECEIVABLE_OVERDUE",
  "PAYABLE_OVERDUE", "PERIOD_CLOSE_TASK", "RECONCILIATION_EXCEPTION",
  "EXECUTIVE_ALERT", "STRATEGIC_DECISION_REVIEW", "AI_EXECUTIVE_BRIEFING",
] as const;

export type SourceReference = {
  organizationKey: string;
  sourceDomain: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEventId?: string;
  sourceDocumentNo?: string;
  sourceVersion?: number;
};

export function validateEffectiveRange(effectiveFrom: Date, effectiveTo?: Date | null) {
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new AppError("Effective-to must be later than effective-from", 422, "INVALID_EFFECTIVE_RANGE");
  }
}

export function assertLifecycleTransition(
  current: string,
  next: string,
  transitions: Readonly<Record<string, readonly string[]>>,
) {
  if (!transitions[current]?.includes(next)) {
    throw new ConflictError(`Invalid lifecycle transition from ${current} to ${next}`);
  }
}

export function selectEffectivePolicy<T extends {
  status: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}>(versions: readonly T[], at: Date): T | null {
  return [...versions]
    .filter((item) =>
      item.status === "FINALIZED" &&
      item.effectiveFrom <= at &&
      (!item.effectiveTo || item.effectiveTo > at))
    .sort((a, b) => b.version - a.version || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

export function requestFingerprint(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function claimOperation(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationType: string;
    idempotencyKey: string;
    requestFingerprint?: string;
    source?: Omit<SourceReference, "organizationKey">;
    correlationId: string;
  },
) {
  requireOrganization(principal, input.organizationKey);
  const inserted = await tx.$queryRaw<Phase2Operation[]>(Prisma.sql`
    INSERT INTO "phase2_operations" (
      "id", "organizationKey", "idempotencyKey", "operationType",
      "requestFingerprint", "sourceDomain", "sourceEntityType", "sourceEntityId",
      "sourceEventId", "status", "correlationId", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      ${crypto.randomUUID()}, ${principal.organizationKey}, ${input.idempotencyKey},
      ${input.operationType}, ${input.requestFingerprint ?? null},
      ${input.source?.sourceDomain ?? null}, ${input.source?.sourceEntityType ?? null},
      ${input.source?.sourceEntityId ?? null}, ${input.source?.sourceEventId ?? null},
      'PENDING', ${input.correlationId}, ${principal.id}, NOW(), NOW()
    )
    ON CONFLICT ("organizationKey", "operationType", "idempotencyKey") DO NOTHING
    RETURNING *
  `);
  const operation = inserted[0] ?? await tx.phase2Operation.findUniqueOrThrow({
    where: {
      organizationKey_operationType_idempotencyKey: {
        organizationKey: principal.organizationKey,
        operationType: input.operationType,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (operation.requestFingerprint && input.requestFingerprint &&
      operation.requestFingerprint !== input.requestFingerprint) {
    throw new ConflictError("Idempotency key was already used for a different request");
  }
  return operation;
}

export function operationWasAcquired(
  operation: { correlationId: string },
  correlationId: string,
) {
  return operation.correlationId === correlationId;
}

export async function completeOperation(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationId: string;
    resultEntityType?: string;
    resultEntityId?: string;
  },
) {
  requireOrganization(principal, input.organizationKey);
  const result = await tx.phase2Operation.updateMany({
    where: {
      id: input.operationId,
      organizationKey: principal.organizationKey,
      status: { in: ["PENDING", "RUNNING"] },
    },
    data: {
      status: "COMPLETED",
      resultEntityType: input.resultEntityType,
      resultEntityId: input.resultEntityId,
      failureCode: null,
      completedAt: new Date(),
    },
  });
  if (result.count !== 1) {
    throw new ConflictError("Operation is not active or does not belong to this organization");
  }
  return tx.phase2Operation.findUniqueOrThrow({ where: { id: input.operationId } });
}

export async function failOperation(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationId: string;
    failureCode: string;
  },
) {
  requireOrganization(principal, input.organizationKey);
  const failureCode = input.failureCode.trim().slice(0, 80) || "FAILED";
  const result = await tx.phase2Operation.updateMany({
    where: {
      id: input.operationId,
      organizationKey: principal.organizationKey,
      status: { in: ["PENDING", "RUNNING"] },
    },
    data: {
      status: "FAILED",
      failureCode,
      completedAt: new Date(),
    },
  });
  if (result.count !== 1) {
    throw new ConflictError("Operation is not active or does not belong to this organization");
  }
  return tx.phase2Operation.findUniqueOrThrow({ where: { id: input.operationId } });
}

export async function retryOperation(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationId: string;
    correlationId: string;
    staleBefore?: Date;
  },
) {
  requireOrganization(principal, input.organizationKey);
  const result = await tx.phase2Operation.updateMany({
    where: {
      id: input.operationId,
      organizationKey: principal.organizationKey,
      OR: [
        { status: "FAILED" },
        ...(input.staleBefore ? [{ status: "RUNNING", updatedAt: { lte: input.staleBefore } }] : []),
      ],
    },
    data: {
      status: "RUNNING",
      correlationId: input.correlationId,
      failureCode: null,
      completedAt: null,
    },
  });
  if (result.count !== 1) {
    throw new ConflictError("Operation is not retryable");
  }
  return tx.phase2Operation.findUniqueOrThrow({ where: { id: input.operationId } });
}

export async function recordSourceReference(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  target: { entityType: string; entityId: string },
  source: SourceReference,
  correlationId?: string,
) {
  requireOrganization(principal, source.organizationKey);
  return tx.phase2SourceReference.create({
    data: {
      organizationKey: principal.organizationKey,
      targetEntityType: target.entityType,
      targetEntityId: target.entityId,
      sourceDomain: source.sourceDomain,
      sourceEntityType: source.sourceEntityType,
      sourceEntityId: source.sourceEntityId,
      sourceEventId: source.sourceEventId,
      sourceDocumentNo: source.sourceDocumentNo,
      sourceVersion: source.sourceVersion,
      correlationId,
    },
  });
}

export async function enforceSegregationOfDuties(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationType: string;
    subjectType: string;
    subjectId: string;
    preparerId: string;
    overrideReason?: string;
  },
) {
  requireOrganization(principal, input.organizationKey);
  const policy = await tx.phase2SodPolicy.findUnique({
    where: {
      organizationKey_operationType: {
        organizationKey: principal.organizationKey,
        operationType: input.operationType,
      },
    },
  });
  if (!policy?.active || !policy.prohibitSameActor || input.preparerId !== principal.id) {
    return { enforced: Boolean(policy?.active), overridden: false };
  }
  if (!policy.overridePermission ||
      (!principal.isFounder && !principal.permissions.has(policy.overridePermission))) {
    throw new ForbiddenError("Segregation-of-duties policy denied this action");
  }
  if (!input.overrideReason?.trim()) {
    throw new AppError("A reason is required for a segregation-of-duties override", 422, "REASON_REQUIRED");
  }
  if (!policy.overrideApprovalType) {
    throw new ForbiddenError("Segregation-of-duties override approval is not configured");
  }
  const approval = await tx.salesAuditLog.findFirst({
    where: {
      module: "ENTERPRISE_PHASE2_APPROVAL",
      action: "APPROVED",
      recordType: policy.overrideApprovalType,
      recordId: input.subjectId,
      userId: { not: principal.id },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!approval) {
    throw new ForbiddenError("Independent approval evidence is required");
  }
  await recordEnterpriseMutation(tx, principal, {
    module: "ENTERPRISE_PHASE2_SOD",
    action: "SOD_OVERRIDE",
    entityType: input.subjectType,
    entityId: input.subjectId,
    description: input.overrideReason.trim(),
    next: {
      operationType: input.operationType,
      policyId: policy.id,
      approvalAuditId: approval.id,
    },
    notify: false,
  });
  return { enforced: true, overridden: true, policyId: policy.id, approvalAuditId: approval.id };
}

export async function recordPhase2Evidence(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  event: Parameters<typeof recordEnterpriseMutation>[2],
) {
  return recordEnterpriseMutation(tx, principal, event);
}
