import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { claimOperation, completeOperation, enforceSegregationOfDuties, operationWasAcquired, requestFingerprint, selectEffectivePolicy } from "@/lib/enterprise-phase2/foundation";
import { phase2SerializableTransaction } from "@/lib/enterprise-phase2/jobs";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { calculateCommercialAmount, type CalculationRule } from "./domain";

const runInput = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  idempotencyKey: z.string().trim().min(8).max(191),
  partnerIds: z.array(z.string().cuid()).min(1),
});

type RunKind = "ROYALTY" | "COMMISSION";

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function calculateCommercialRun(kind: RunKind, input: unknown) {
  const data = runInput.parse(input);
  if (data.periodEnd <= data.periodStart) throw new ConflictError("Run period is invalid");
  const permission = kind === "ROYALTY" ? PERMISSIONS.NETWORK_ROYALTIES_MANAGE : PERMISSIONS.NETWORK_COMMISSIONS_MANAGE;
  const principal = await requireNetworkPrincipal(permission);
  const correlationId = crypto.randomUUID();
  const fingerprint = requestFingerprint({ kind, ...data, partnerIds: [...data.partnerIds].sort() });
  return phase2SerializableTransaction(async (tx) => {
    const operation = await claimOperation(tx, principal, {
      organizationKey: principal.organizationKey, operationType: `${kind}_RUN`,
      idempotencyKey: data.idempotencyKey, requestFingerprint: fingerprint, correlationId,
    });
    if (!operationWasAcquired(operation, correlationId)) {
      if (operation.status !== "COMPLETED" || !operation.resultEntityId) throw new ConflictError("Calculation is already in progress");
      return kind === "ROYALTY"
        ? tx.networkRoyaltyRun.findFirstOrThrow({ where: { id: operation.resultEntityId, organizationKey: principal.organizationKey }, include: { lines: true } })
        : tx.networkCommissionRun.findFirstOrThrow({ where: { id: operation.resultEntityId, organizationKey: principal.organizationKey }, include: { lines: true } });
    }
    const partners = await tx.networkPartner.findMany({
      where: { organizationKey: principal.organizationKey, id: { in: data.partnerIds }, lifecycleStatus: "ACTIVE" },
    });
    if (partners.length !== new Set(data.partnerIds).size) throw new ConflictError("Every calculation partner must be active in this organization");
    const sources = await tx.networkPartnerOrderSource.findMany({
      where: {
        organizationKey: principal.organizationKey, partnerId: { in: partners.map((item) => item.id) },
        metricKey: "REVENUE", effectiveAt: { gte: data.periodStart, lt: data.periodEnd },
        order: { paymentStatus: "PAID" },
      },
      include: { order: true },
      orderBy: [{ partnerId: "asc" }, { orderId: "asc" }, { sourceVersion: "asc" }],
    });
    const policies = await tx.phase2PolicyVersion.findMany({
      where: { organizationKey: principal.organizationKey, policyType: kind, policyKey: { in: partners.map((item) => item.partnerType) } },
    });
    const snapshot = partners.map((partner) => {
      const policy = selectEffectivePolicy(policies.filter((item) => item.policyKey === partner.partnerType), data.periodEnd);
      if (!policy) throw new ConflictError(`No finalized ${kind.toLowerCase()} policy applies to ${partner.partnerNumber}`);
      const partnerSources = sources.filter((source) => source.partnerId === partner.id);
      const basis = partnerSources.reduce((sum, source) => sum + Number(source.attributedAmount), 0);
      const result = calculateCommercialAmount(basis, policy.configuration as CalculationRule);
      return { partner, policy, basis, result, partnerSources };
    });
    const sourceSnapshotHash = stableHash(sources.map((source) => ({
      id: source.id, partnerId: source.partnerId, orderId: source.orderId,
      amount: source.attributedAmount.toString(), version: source.sourceVersion, orderUpdatedAt: source.order.updatedAt,
    })));
    const totalAmount = snapshot.reduce((sum, item) => sum + item.result.amount, 0);
    const runNumber = await nextEnterpriseNumber(tx, principal.organizationKey, `${kind}_RUN`, kind === "ROYALTY" ? "RYL" : "COM");
    const shared = {
      organizationKey: principal.organizationKey, runNumber, periodStart: data.periodStart, periodEnd: data.periodEnd,
      sourceSnapshotHash, policySnapshot: snapshot.map((item) => ({ id: item.policy.id, version: item.policy.version })),
      totalAmount, preparedById: principal.id,
    };
    const run = kind === "ROYALTY"
      ? await tx.networkRoyaltyRun.create({
        data: { ...shared, lines: { create: snapshot.map((item) => ({
          organizationKey: principal.organizationKey, partnerId: item.partner.id, sourceType: "ORDER_PERIOD",
          sourceId: stableHash(item.partnerSources.map((source) => source.id)), policyVersionId: item.policy.id,
          basisAmount: item.basis, calculatedAmount: item.result.amount, calculation: item.result.trace as Prisma.InputJsonValue,
        })) } }, include: { lines: true },
      })
      : await tx.networkCommissionRun.create({
        data: { ...shared, lines: { create: snapshot.map((item) => ({
          organizationKey: principal.organizationKey, partnerId: item.partner.id, sourceType: "ORDER_PERIOD",
          sourceId: stableHash(item.partnerSources.map((source) => source.id)), policyVersionId: item.policy.id,
          basisAmount: item.basis, calculatedAmount: item.result.amount, calculation: item.result.trace as Prisma.InputJsonValue,
        })) } }, include: { lines: true },
      });
    await completeOperation(tx, principal, { organizationKey: principal.organizationKey, operationId: operation.id, resultEntityType: `Network${kind}Run`, resultEntityId: run.id });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `${kind}_CALCULATED`, entityType: `Network${kind}Run`, entityId: run.id,
      description: `${kind} run ${runNumber} calculated`, next: { runNumber, totalAmount, sourceSnapshotHash },
    });
    return run;
  });
}

export async function finalizeCommercialRun(kind: RunKind, runId: string) {
  const permission = kind === "ROYALTY" ? PERMISSIONS.NETWORK_ROYALTIES_APPROVE : PERMISSIONS.NETWORK_COMMISSIONS_APPROVE;
  const principal = await requireNetworkPrincipal(permission);
  return phase2SerializableTransaction(async (tx) => {
    const run = kind === "ROYALTY"
      ? await tx.networkRoyaltyRun.findFirst({ where: { id: runId, organizationKey: principal.organizationKey } })
      : await tx.networkCommissionRun.findFirst({ where: { id: runId, organizationKey: principal.organizationKey } });
    if (!run) throw new NotFoundError(`${kind} run`);
    if (run.status !== "DRAFT") throw new ConflictError("Only a draft calculation run can be finalized");
    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: `${kind}_APPROVAL`,
      subjectType: `Network${kind}Run`, subjectId: run.id, preparerId: run.preparedById,
    });
    const now = new Date();
    const finalized = kind === "ROYALTY"
      ? await tx.networkRoyaltyRun.update({ where: { id: run.id }, data: { status: "FINALIZED", approvedById: principal.id, approvedAt: now, finalizedAt: now } })
      : await tx.networkCommissionRun.update({ where: { id: run.id }, data: { status: "FINALIZED", approvedById: principal.id, approvedAt: now, finalizedAt: now } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `${kind}_FINALIZED`, entityType: `Network${kind}Run`, entityId: run.id,
      description: `${kind} calculation finalized`, next: { status: "FINALIZED", financeReady: true },
    });
    return finalized;
  });
}

export async function correctCommercialRun(kind: RunKind, runId: string, idempotencyKey: string, reason: string) {
  const permission = kind === "ROYALTY" ? PERMISSIONS.NETWORK_ROYALTIES_MANAGE : PERMISSIONS.NETWORK_COMMISSIONS_MANAGE;
  const principal = await requireNetworkPrincipal(permission);
  const correlationId = crypto.randomUUID();
  return phase2SerializableTransaction(async (tx) => {
    const operation = await claimOperation(tx, principal, {
      organizationKey: principal.organizationKey, operationType: `${kind}_CORRECTION`,
      idempotencyKey, requestFingerprint: requestFingerprint({ kind, runId, reason }), correlationId,
    });
    if (!operationWasAcquired(operation, correlationId)) {
      if (operation.status !== "COMPLETED" || !operation.resultEntityId) throw new ConflictError("Correction is already in progress");
      return kind === "ROYALTY"
        ? tx.networkRoyaltyRun.findFirstOrThrow({ where: { id: operation.resultEntityId, organizationKey: principal.organizationKey }, include: { lines: true } })
        : tx.networkCommissionRun.findFirstOrThrow({ where: { id: operation.resultEntityId, organizationKey: principal.organizationKey }, include: { lines: true } });
    }
    if (kind === "ROYALTY") {
      const original = await tx.networkRoyaltyRun.findFirst({ where: { id: runId, organizationKey: principal.organizationKey, status: "FINALIZED" }, include: { lines: true } });
      if (!original) throw new NotFoundError("Finalized royalty run");
      const runNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "ROYALTY_RUN", "RYL");
      const reversal = await tx.networkRoyaltyRun.create({
        data: {
          organizationKey: principal.organizationKey, runNumber, periodStart: original.periodStart, periodEnd: original.periodEnd,
          sourceSnapshotHash: original.sourceSnapshotHash, policySnapshot: original.policySnapshot as Prisma.InputJsonValue,
          totalAmount: -Number(original.totalAmount), preparedById: principal.id, reversalOfId: original.id,
          correctionReason: reason.trim(), version: original.version + 1,
          lines: { create: original.lines.map((line) => ({
            organizationKey: principal.organizationKey, partnerId: line.partnerId, sourceType: "REVERSAL",
            sourceId: line.id, sourceVersion: line.sourceVersion, policyVersionId: line.policyVersionId,
            basisAmount: -Number(line.basisAmount), calculatedAmount: -Number(line.calculatedAmount),
            calculation: { reversalOfLineId: line.id, originalCalculation: line.calculation } as Prisma.InputJsonValue,
            financeReference: line.financeReference,
          })) },
        }, include: { lines: true },
      });
      await completeOperation(tx, principal, { organizationKey: principal.organizationKey, operationId: operation.id, resultEntityType: "NetworkRoyaltyRun", resultEntityId: reversal.id });
      await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "ROYALTY_CORRECTION_CREATED", entityType: "NetworkRoyaltyRun", entityId: reversal.id, description: "Royalty reversal successor created", next: { reversalOfId: original.id, reason } });
      return reversal;
    }
    const original = await tx.networkCommissionRun.findFirst({ where: { id: runId, organizationKey: principal.organizationKey, status: "FINALIZED" }, include: { lines: true } });
    if (!original) throw new NotFoundError("Finalized commission run");
    const runNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "COMMISSION_RUN", "COM");
    const reversal = await tx.networkCommissionRun.create({
      data: {
        organizationKey: principal.organizationKey, runNumber, periodStart: original.periodStart, periodEnd: original.periodEnd,
        sourceSnapshotHash: original.sourceSnapshotHash, policySnapshot: original.policySnapshot as Prisma.InputJsonValue,
        totalAmount: -Number(original.totalAmount), preparedById: principal.id, reversalOfId: original.id,
        correctionReason: reason.trim(), version: original.version + 1,
        lines: { create: original.lines.map((line) => ({
          organizationKey: principal.organizationKey, partnerId: line.partnerId, sourceType: "REVERSAL",
          sourceId: line.id, sourceVersion: line.sourceVersion, policyVersionId: line.policyVersionId,
          basisAmount: -Number(line.basisAmount), calculatedAmount: -Number(line.calculatedAmount),
          calculation: { reversalOfLineId: line.id, originalCalculation: line.calculation } as Prisma.InputJsonValue,
          financeReference: line.financeReference,
        })) },
      }, include: { lines: true },
    });
    await completeOperation(tx, principal, { organizationKey: principal.organizationKey, operationId: operation.id, resultEntityType: "NetworkCommissionRun", resultEntityId: reversal.id });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "COMMISSION_CORRECTION_CREATED", entityType: "NetworkCommissionRun", entityId: reversal.id, description: "Commission reversal successor created", next: { reversalOfId: original.id, reason } });
    return reversal;
  });
}
