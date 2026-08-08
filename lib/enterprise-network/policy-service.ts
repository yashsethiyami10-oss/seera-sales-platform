import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties, selectEffectivePolicy, validateEffectiveRange } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";

const policyInput = z.object({
  policyType: z.enum(["ROYALTY", "COMMISSION", "PRICING", "DISCOUNT", "CREDIT", "CLAIM", "TARGET"]),
  policyKey: z.string().trim().min(1).max(100),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  configuration: z.record(z.unknown()),
});

export async function createCommercialPolicyVersion(input: unknown) {
  const data = policyInput.parse(input);
  validateEffectiveRange(data.effectiveFrom, data.effectiveTo);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_COMMERCIAL_POLICIES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const latest = await tx.phase2PolicyVersion.findFirst({
      where: { organizationKey: principal.organizationKey, policyType: data.policyType, policyKey: data.policyKey },
      orderBy: { version: "desc" },
    });
    const policy = await tx.phase2PolicyVersion.create({
      data: {
        ...data, configuration: data.configuration as Prisma.InputJsonValue,
        organizationKey: principal.organizationKey, version: (latest?.version ?? 0) + 1, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "COMMERCIAL_POLICY_VERSION_CREATED",
      entityType: "Phase2PolicyVersion", entityId: policy.id,
      description: `${data.policyType} policy ${data.policyKey} version ${policy.version} created`,
      next: { policyType: data.policyType, policyKey: data.policyKey, version: policy.version },
    });
    return policy;
  });
}

export async function finalizeCommercialPolicy(policyId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_COMMERCIAL_POLICIES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.phase2PolicyVersion.findFirst({ where: { id: policyId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Commercial policy");
    if (current.status !== "DRAFT") throw new ConflictError("Only draft policies can be finalized");
    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "COMMERCIAL_POLICY_APPROVAL",
      subjectType: "Phase2PolicyVersion", subjectId: current.id, preparerId: current.createdById,
    });
    const overlap = await tx.phase2PolicyVersion.findFirst({
      where: {
        organizationKey: principal.organizationKey, policyType: current.policyType, policyKey: current.policyKey,
        status: "FINALIZED", effectiveFrom: { lt: current.effectiveTo ?? new Date("9999-12-31") },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: current.effectiveFrom } }],
      },
    });
    if (overlap) throw new ConflictError("A finalized policy already overlaps this effective period");
    const policy = await tx.phase2PolicyVersion.update({
      where: { id: current.id }, data: { status: "FINALIZED", approvedById: principal.id, approvedAt: new Date() },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "COMMERCIAL_POLICY_FINALIZED",
      entityType: "Phase2PolicyVersion", entityId: policy.id,
      description: "Commercial policy finalized", next: { status: "FINALIZED", version: policy.version },
    });
    return policy;
  });
}

export async function resolveCommercialPolicy(policyType: string, policyKey: string, at: Date) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const versions = await (await import("@/lib/prisma")).prisma.phase2PolicyVersion.findMany({
    where: { organizationKey: principal.organizationKey, policyType, policyKey },
  });
  return selectEffectivePolicy(versions, at);
}

