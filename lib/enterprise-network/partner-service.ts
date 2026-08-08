import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties, recordSourceReference } from "@/lib/enterprise-phase2/foundation";
import { requireVersion } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { assertTransition, PARTNER_TRANSITIONS } from "./domain";
import { hierarchyInput, pageInput, partnerInput } from "./schemas";

export async function createPartner(input: unknown) {
  const data = partnerInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const partnerNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_PARTNER", "NWP");
    const partner = await tx.networkPartner.create({
      data: { ...data, metadata: data.metadata as Prisma.InputJsonValue, organizationKey: principal.organizationKey, partnerNumber, createdById: principal.id },
    });
    await tx.networkPartnerProfile.create({
      data: { organizationKey: principal.organizationKey, partnerId: partner.id, partnerType: partner.partnerType, configuration: {}, version: 1 },
    });
    await recordSourceReference(tx, principal, { entityType: "NetworkPartner", entityId: partner.id }, {
      organizationKey: principal.organizationKey, sourceDomain: "ENTERPRISE_NETWORK",
      sourceEntityType: "PARTNER_APPLICATION", sourceEntityId: partner.id,
      sourceDocumentNo: partner.partnerNumber, sourceVersion: partner.version,
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "PARTNER_CREATED", entityType: "NetworkPartner", entityId: partner.id,
      description: `Partner ${partnerNumber} created`, next: { partnerNumber, partnerType: partner.partnerType, lifecycleStatus: partner.lifecycleStatus },
    });
    return partner;
  });
}

export async function updatePartner(partnerId: string, expectedVersion: number, input: unknown) {
  const data = partnerInput.partial().omit({ partnerType: true }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Partner");
    requireVersion(current.version, expectedVersion);
    if (["TERMINATED", "ARCHIVED"].includes(current.lifecycleStatus)) throw new ConflictError("Terminated or archived partners are immutable");
    const partner = await tx.networkPartner.update({
      where: { id: current.id },
      data: { ...data, metadata: data.metadata as Prisma.InputJsonValue | undefined, version: { increment: 1 } },
    });
    await recordSourceReference(tx, principal, { entityType: "NetworkPartner", entityId: partner.id }, {
      organizationKey: principal.organizationKey, sourceDomain: "ENTERPRISE_NETWORK",
      sourceEntityType: "PARTNER_MASTER", sourceEntityId: partner.id,
      sourceEventId: `VERSION_${partner.version}`, sourceDocumentNo: partner.partnerNumber, sourceVersion: partner.version,
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "PARTNER_UPDATED", entityType: "NetworkPartner", entityId: partner.id,
      description: `Partner ${partner.partnerNumber} updated`, previous: { version: current.version }, next: { version: partner.version },
    });
    return partner;
  });
}

export async function transitionPartner(partnerId: string, expectedVersion: number, next: string, reason?: string) {
  const permission = next === "APPROVED"
    ? PERMISSIONS.NETWORK_PARTNERS_APPROVE_ONBOARDING
    : PERMISSIONS.NETWORK_PARTNERS_MANAGE;
  const principal = await requireNetworkPrincipal(permission);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Partner");
    requireVersion(current.version, expectedVersion);
    assertTransition(current.lifecycleStatus, next, PARTNER_TRANSITIONS);
    if (next === "APPROVED") {
      await enforceSegregationOfDuties(tx, principal, {
        organizationKey: principal.organizationKey, operationType: "PARTNER_ONBOARDING_APPROVAL",
        subjectType: "NetworkPartner", subjectId: current.id, preparerId: current.createdById,
      });
      const onboarding = await tx.networkOnboardingCase.findFirst({
        where: { organizationKey: principal.organizationKey, partnerId, status: "READY" },
        include: { requirements: true },
      });
      if (!onboarding || onboarding.requirements.some((item) => item.required && item.status !== "VERIFIED")) {
        throw new ConflictError("Partner onboarding is not ready for approval");
      }
    }
    if (next === "ACTIVE" && (current.approvalStatus !== "APPROVED" || current.complianceStatus !== "COMPLIANT")) {
      throw new ConflictError("Approval and compliance are required before activation");
    }
    const now = new Date();
    const partner = await tx.networkPartner.update({
      where: { id: current.id },
      data: {
        lifecycleStatus: next,
        approvalStatus: next === "APPROVED" ? "APPROVED" : undefined,
        activationStatus: next === "ACTIVE" ? "ACTIVE" : ["SUSPENDED", "INACTIVE", "TERMINATED", "ARCHIVED"].includes(next) ? "INACTIVE" : undefined,
        approvedById: next === "APPROVED" ? principal.id : undefined,
        approvedAt: next === "APPROVED" ? now : undefined,
        activatedAt: next === "ACTIVE" ? now : undefined,
        suspendedAt: next === "SUSPENDED" ? now : undefined,
        terminatedAt: next === "TERMINATED" ? now : undefined,
        archivedAt: next === "ARCHIVED" ? now : undefined,
        version: { increment: 1 },
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `PARTNER_${next}`, entityType: "NetworkPartner", entityId: partner.id,
      description: `Partner ${partner.partnerNumber}: ${current.lifecycleStatus} to ${next}`,
      previous: { lifecycleStatus: current.lifecycleStatus }, next: { lifecycleStatus: next, reason: reason ?? null },
    });
    return partner;
  });
}

async function wouldCreateCycle(tx: Prisma.TransactionClient, organizationKey: string, parentId: string, childId: string) {
  const queue = [childId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const children = await tx.networkPartnerHierarchy.findMany({
      where: { organizationKey, parentPartnerId: id, status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      select: { childPartnerId: true },
    });
    queue.push(...children.map((row) => row.childPartnerId));
  }
  return false;
}

export async function assignPartnerParent(input: unknown) {
  const data = hierarchyInput.parse(input);
  if (data.parentPartnerId === data.childPartnerId) throw new AppError("A partner cannot be its own parent", 422);
  if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) throw new AppError("Invalid effective range", 422);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const partners = await tx.networkPartner.findMany({
      where: { organizationKey: principal.organizationKey, id: { in: [data.parentPartnerId, data.childPartnerId] } },
    });
    if (partners.length !== 2) throw new AppError("Partner hierarchy references are invalid", 422);
    if (await wouldCreateCycle(tx, principal.organizationKey, data.parentPartnerId, data.childPartnerId)) {
      throw new ConflictError("Partner hierarchy cycle detected");
    }
    const overlap = await tx.networkPartnerHierarchy.findFirst({
      where: {
        organizationKey: principal.organizationKey, hierarchyType: data.hierarchyType, childPartnerId: data.childPartnerId,
        status: "ACTIVE", effectiveFrom: { lt: data.effectiveTo ?? new Date("9999-12-31") },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: data.effectiveFrom } }],
      },
    });
    if (overlap) throw new ConflictError("Partner already has an overlapping active parent");
    const hierarchy = await tx.networkPartnerHierarchy.create({
      data: { ...data, organizationKey: principal.organizationKey, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "PARTNER_PARENT_ASSIGNED", entityType: "NetworkPartnerHierarchy", entityId: hierarchy.id,
      description: "Effective-dated partner hierarchy assigned", next: data,
    });
    return hierarchy;
  });
}

export async function searchPartners(input: unknown) {
  const data = pageInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const where: Prisma.NetworkPartnerWhereInput = {
    organizationKey: principal.organizationKey,
    partnerType: data.partnerType,
    lifecycleStatus: data.status,
    ...(data.search ? { OR: [
      { partnerNumber: { contains: data.search, mode: "insensitive" } },
      { legalName: { contains: data.search, mode: "insensitive" } },
      { tradeName: { contains: data.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.networkPartner.count({ where }),
    prisma.networkPartner.findMany({
      where, orderBy: [{ legalName: "asc" }, { id: "asc" }],
      skip: (data.page - 1) * data.pageSize, take: data.pageSize,
      include: { contacts: { where: { active: true } }, addresses: { where: { active: true } } },
    }),
  ]);
  return { items, total, page: data.page, pageSize: data.pageSize, pages: Math.ceil(total / data.pageSize) };
}

/**
 * Enterprise UI Integration — Business Network UI. Pure read addition (no
 * mutation, no calculation), matching the freeze doc's explicit allowance
 * for "a Server Action/API route exposing these Business Services to the
 * UI" (PART_3B_BUSINESS_NETWORK_FREEZE.md §11) — no equivalent
 * single-partner read existed before this, only `searchPartners` (list).
 */
export async function getPartner(partnerId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const partner = await prisma.networkPartner.findFirst({
    where: { id: partnerId, organizationKey: principal.organizationKey },
    include: { contacts: true, addresses: true, profiles: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!partner) throw new NotFoundError("Partner");
  return partner;
}

export async function closePartnerParentAssignment(assignmentId: string, effectiveTo: Date, reason: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkPartnerHierarchy.findFirst({ where: { id: assignmentId, organizationKey: principal.organizationKey, status: "ACTIVE" } });
    if (!current) throw new NotFoundError("Active partner hierarchy assignment");
    if (effectiveTo <= current.effectiveFrom) throw new AppError("Closure must follow the effective-from date", 422);
    const closed = await tx.networkPartnerHierarchy.update({ where: { id: current.id }, data: { effectiveTo, status: "ENDED", terminationReason: reason.trim() } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "PARTNER_PARENT_ASSIGNMENT_ENDED", entityType: "NetworkPartnerHierarchy", entityId: closed.id,
      description: "Partner hierarchy assignment historically closed", next: { effectiveTo: effectiveTo.toISOString(), reason },
    });
    return closed;
  });
}

export async function reassignPartnerParent(assignmentId: string, nextAssignment: unknown, effectiveAt: Date, reason: string) {
  await closePartnerParentAssignment(assignmentId, effectiveAt, reason);
  return assignPartnerParent({ ...(hierarchyInput.parse(nextAssignment)), effectiveFrom: effectiveAt });
}

export async function getPartnerHierarchy(partnerId: string, direction: "ANCESTORS" | "DESCENDANTS", at = new Date()) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const root = await prisma.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey } });
  if (!root) throw new NotFoundError("Partner");
  const results: Array<{ depth: number; partnerId: string; assignmentId: string }> = [];
  let frontier = [partnerId];
  const seen = new Set(frontier);
  for (let depth = 1; frontier.length; depth++) {
    const rows = await prisma.networkPartnerHierarchy.findMany({
      where: {
        organizationKey: principal.organizationKey, status: "ACTIVE", effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        ...(direction === "ANCESTORS" ? { childPartnerId: { in: frontier } } : { parentPartnerId: { in: frontier } }),
      },
      orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    });
    frontier = [];
    for (const row of rows) {
      const nextId = direction === "ANCESTORS" ? row.parentPartnerId : row.childPartnerId;
      if (!seen.has(nextId)) {
        seen.add(nextId); frontier.push(nextId);
        results.push({ depth, partnerId: nextId, assignmentId: row.id });
      }
    }
  }
  return results;
}
