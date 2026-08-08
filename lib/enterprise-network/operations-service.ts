import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { pageInput } from "./schemas";

/** Enterprise UI Integration — Business Network UI. Pure read addition. */
export async function listClaims(input: unknown) {
  const data = pageInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_CLAIMS_MANAGE);
  const where: Prisma.NetworkClaimWhereInput = {
    organizationKey: principal.organizationKey,
    status: data.status,
    ...(data.search ? { claimNumber: { contains: data.search, mode: "insensitive" } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.networkClaim.count({ where }),
    prisma.networkClaim.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (data.page - 1) * data.pageSize, take: data.pageSize,
      include: { partner: { select: { id: true, legalName: true, partnerNumber: true } } },
    }),
  ]);
  return { items, total, page: data.page, pageSize: data.pageSize, pages: Math.max(1, Math.ceil(total / data.pageSize)) };
}

const claimInput = z.object({
  partnerId: z.string().cuid(),
  claimType: z.string().trim().min(1).max(80),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default("INR"),
  description: z.string().trim().min(4).max(4000),
  evidenceRefs: z.array(z.string()).default([]),
  sourceReferences: z.array(z.record(z.unknown())).default([]),
});

export async function createClaim(input: unknown) {
  const data = claimInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_CLAIMS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const partner = await tx.networkPartner.findFirst({ where: { id: data.partnerId, organizationKey: principal.organizationKey } });
    if (!partner) throw new NotFoundError("Partner");
    const claimNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_CLAIM", "CLM");
    const claim = await tx.networkClaim.create({
      data: {
        ...data, evidenceRefs: data.evidenceRefs as Prisma.InputJsonValue,
        sourceReferences: data.sourceReferences as Prisma.InputJsonValue,
        organizationKey: principal.organizationKey, claimNumber, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "CLAIM_CREATED", entityType: "NetworkClaim", entityId: claim.id,
      description: `Claim ${claimNumber} created`, next: { claimNumber, partnerId: data.partnerId, amount: data.amount },
    });
    return claim;
  });
}

export async function transitionClaim(claimId: string, next: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "SETTLED", reason?: string, approvedAmount?: number) {
  const principal = await requireNetworkPrincipal(["APPROVED", "PARTIALLY_APPROVED"].includes(next) ? PERMISSIONS.NETWORK_CLAIMS_APPROVE : PERMISSIONS.NETWORK_CLAIMS_MANAGE);
  const graph: Record<string, string[]> = {
    DRAFT: ["SUBMITTED"], SUBMITTED: ["UNDER_REVIEW"], UNDER_REVIEW: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED"],
    APPROVED: ["SETTLED"], PARTIALLY_APPROVED: ["SETTLED"], REJECTED: [], SETTLED: [],
  };
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Claim");
    if (!graph[current.status]?.includes(next)) throw new ConflictError(`Invalid claim transition from ${current.status} to ${next}`);
    if (["APPROVED", "PARTIALLY_APPROVED"].includes(next)) {
      await enforceSegregationOfDuties(tx, principal, {
        organizationKey: principal.organizationKey, operationType: "CLAIM_APPROVAL",
        subjectType: "NetworkClaim", subjectId: current.id, preparerId: current.createdById,
      });
    }
    const claimAmount = Number(current.amount);
    const accepted = next === "APPROVED" ? claimAmount : next === "PARTIALLY_APPROVED" ? Number(approvedAmount) : undefined;
    if (next === "PARTIALLY_APPROVED" && (!Number.isFinite(accepted) || accepted! <= 0 || accepted! >= claimAmount)) {
      throw new ConflictError("Partial approval amount must be positive and less than the claim amount");
    }
    const now = new Date();
    const claim = await tx.networkClaim.update({
      where: { id: current.id }, data: {
        status: next, submittedById: next === "SUBMITTED" ? principal.id : undefined,
        submittedAt: next === "SUBMITTED" ? now : undefined, reviewedById: next === "UNDER_REVIEW" ? principal.id : undefined,
        reviewedAt: next === "UNDER_REVIEW" ? now : undefined, approvedById: ["APPROVED", "PARTIALLY_APPROVED"].includes(next) ? principal.id : undefined,
        approvedAt: ["APPROVED", "PARTIALLY_APPROVED"].includes(next) ? now : undefined, rejectionReason: next === "REJECTED" ? reason : undefined,
        approvedAmount: accepted, remainingAmount: accepted == null ? undefined : claimAmount - accepted,
        version: { increment: 1 },
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `CLAIM_${next}`, entityType: "NetworkClaim", entityId: claim.id,
      description: `Claim ${current.status} to ${next}`, previous: { status: current.status }, next: { status: next, reason: reason ?? null },
    });
    return claim;
  });
}

const territoryAssignmentInput = z.object({
  territoryId: z.string().cuid(), partnerId: z.string().cuid(),
  assignmentType: z.string().trim().min(1).max(80), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional(),
});

export async function assignPartnerTerritory(input: unknown) {
  const data = territoryAssignmentInput.parse(input);
  if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) throw new ConflictError("Territory assignment range is invalid");
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_TERRITORIES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const [territory, partner] = await Promise.all([
      tx.networkTerritory.findFirst({ where: { id: data.territoryId, organizationKey: principal.organizationKey, status: "ACTIVE" } }),
      tx.networkPartner.findFirst({ where: { id: data.partnerId, organizationKey: principal.organizationKey } }),
    ]);
    if (!territory || !partner) throw new NotFoundError("Territory or partner");
    const overlap = await tx.networkTerritoryAssignment.findFirst({ where: {
      organizationKey: principal.organizationKey, partnerId: data.partnerId, assignmentType: data.assignmentType, status: "ACTIVE",
      effectiveFrom: { lt: data.effectiveTo ?? new Date("9999-12-31") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: data.effectiveFrom } }],
    } });
    if (overlap) throw new ConflictError("An overlapping territory assignment already exists");
    const assignment = await tx.networkTerritoryAssignment.create({ data: { ...data, organizationKey: principal.organizationKey, createdById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TERRITORY_ASSIGNED", entityType: "NetworkTerritoryAssignment", entityId: assignment.id, description: "Partner territory assigned", next: data });
    return assignment;
  });
}

export async function closeTerritoryAssignment(assignmentId: string, effectiveTo: Date) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_TERRITORIES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkTerritoryAssignment.findFirst({ where: { id: assignmentId, organizationKey: principal.organizationKey, status: "ACTIVE" } });
    if (!current) throw new NotFoundError("Active territory assignment");
    if (effectiveTo <= current.effectiveFrom) throw new ConflictError("Closure must follow effective-from");
    const closed = await tx.networkTerritoryAssignment.update({ where: { id: current.id }, data: { effectiveTo, status: "ENDED" } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TERRITORY_ASSIGNMENT_ENDED", entityType: "NetworkTerritoryAssignment", entityId: closed.id, description: "Territory assignment historically closed", next: { effectiveTo: effectiveTo.toISOString() } });
    return closed;
  });
}

export async function getTerritoryAssignmentHistory(partnerId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  return (await import("@/lib/prisma")).prisma.networkTerritoryAssignment.findMany({
    where: { organizationKey: principal.organizationKey, partnerId }, include: { territory: true },
    orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
  });
}

const territoryInput = z.object({
  territoryKey: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160),
  territoryType: z.string().trim().min(1).max(80),
  parentKey: z.string().trim().max(80).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  geometry: z.record(z.unknown()).optional(),
  rules: z.record(z.unknown()).default({}),
});

export async function createTerritoryVersion(input: unknown) {
  const data = territoryInput.parse(input);
  if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) throw new ConflictError("Territory effective range is invalid");
  if (data.parentKey === data.territoryKey) throw new ConflictError("Territory cannot be its own parent");
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_TERRITORIES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    if (data.parentKey) {
      const parent = await tx.networkTerritory.findFirst({ where: { organizationKey: principal.organizationKey, territoryKey: data.parentKey, status: "ACTIVE" } });
      if (!parent) throw new NotFoundError("Parent territory");
    }
    const latest = await tx.networkTerritory.findFirst({ where: { organizationKey: principal.organizationKey, territoryKey: data.territoryKey }, orderBy: { version: "desc" } });
    const territory = await tx.networkTerritory.create({
      data: {
        ...data, geometry: data.geometry as Prisma.InputJsonValue | undefined,
        rules: data.rules as Prisma.InputJsonValue,
        organizationKey: principal.organizationKey, version: (latest?.version ?? 0) + 1, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "TERRITORY_VERSION_CREATED", entityType: "NetworkTerritory", entityId: territory.id,
      description: `Territory ${territory.territoryKey} version ${territory.version} created`, next: { territoryKey: territory.territoryKey, version: territory.version },
    });
    return territory;
  });
}
