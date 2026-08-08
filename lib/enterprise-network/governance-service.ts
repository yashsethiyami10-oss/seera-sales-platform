import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties, validateEffectiveRange } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { AGREEMENT_TRANSITIONS, assertEditable, assertTransition } from "./domain";
import { pageInput } from "./schemas";

/**
 * Enterprise UI Integration — Business Network UI. Pure read additions
 * (list + single-record get, no mutation, no calculation) — this file
 * previously had zero read exports for Agreements, only mutations, each
 * returning just the row it touched. Matches the freeze doc's explicit
 * allowance for UI-facing reads (§11).
 */
export async function listAgreements(input: unknown) {
  const data = pageInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_AGREEMENTS_MANAGE);
  const where: Prisma.NetworkAgreementWhereInput = {
    organizationKey: principal.organizationKey,
    status: data.status,
    ...(data.search ? { OR: [
      { agreementKey: { contains: data.search, mode: "insensitive" } },
      { agreementNumber: { contains: data.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.networkAgreement.count({ where }),
    prisma.networkAgreement.findMany({
      where, orderBy: { updatedAt: "desc" }, skip: (data.page - 1) * data.pageSize, take: data.pageSize,
      include: { partner: { select: { id: true, legalName: true, partnerNumber: true } } },
    }),
  ]);
  return { items, total, page: data.page, pageSize: data.pageSize, pages: Math.max(1, Math.ceil(total / data.pageSize)) };
}

export async function getAgreement(agreementId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_AGREEMENTS_MANAGE);
  const agreement = await prisma.networkAgreement.findFirst({
    where: { id: agreementId, organizationKey: principal.organizationKey },
    include: { partner: { select: { id: true, legalName: true, partnerNumber: true } } },
  });
  if (!agreement) throw new NotFoundError("Agreement");
  return agreement;
}

const requirement = z.object({
  requirementKey: z.string().trim().min(1).max(100),
  requirementType: z.string().trim().min(1).max(80),
  required: z.boolean().default(true),
});

export async function beginPartnerOnboarding(partnerId: string, requirements: unknown) {
  const items = z.array(requirement).min(1).parse(requirements);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const partner = await tx.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey } });
    if (!partner) throw new NotFoundError("Partner");
    if (!["DRAFT", "ONBOARDING"].includes(partner.lifecycleStatus)) throw new ConflictError("Partner cannot begin onboarding");
    const caseNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_ONBOARDING", "ONB");
    const onboarding = await tx.networkOnboardingCase.create({
      data: {
        organizationKey: principal.organizationKey, partnerId, caseNumber, status: "IN_PROGRESS", createdById: principal.id,
        requirements: { create: items.map((item) => ({ ...item, organizationKey: principal.organizationKey })) },
      },
      include: { requirements: true },
    });
    await tx.networkPartner.update({ where: { id: partner.id }, data: { lifecycleStatus: "ONBOARDING", onboardingStatus: "IN_PROGRESS", version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "ONBOARDING_STARTED", entityType: "NetworkOnboardingCase", entityId: onboarding.id,
      description: `Onboarding ${caseNumber} started`, next: { partnerId, requirementCount: items.length },
    });
    return onboarding;
  });
}

export async function reviewOnboardingRequirement(requirementId: string, status: "VERIFIED" | "REJECTED", evidenceRefs: string[], notes?: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkOnboardingRequirement.findFirst({ where: { id: requirementId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Onboarding requirement");
    const item = await tx.networkOnboardingRequirement.update({
      where: { id: current.id }, data: { status, evidenceRefs, notes, reviewedById: principal.id, reviewedAt: new Date() },
    });
    const all = await tx.networkOnboardingRequirement.findMany({ where: { onboardingId: current.onboardingId, organizationKey: principal.organizationKey } });
    const ready = all.every((row) => !row.required || row.status === "VERIFIED");
    await tx.networkOnboardingCase.update({
      where: { id: current.onboardingId },
      data: { status: ready ? "READY" : status === "REJECTED" ? "CORRECTION_REQUIRED" : "IN_PROGRESS", readinessSnapshot: { ready, checkedAt: new Date().toISOString() }, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `ONBOARDING_REQUIREMENT_${status}`, entityType: "NetworkOnboardingRequirement", entityId: item.id,
      description: `Onboarding requirement ${status.toLowerCase()}`, next: { status, evidenceRefs },
    });
    return item;
  });
}

const agreementInput = z.object({
  agreementKey: z.string().trim().min(1).max(100),
  partnerId: z.string().cuid(),
  agreementType: z.string().trim().min(1).max(80),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  terms: z.record(z.unknown()),
  documentRefs: z.array(z.string()).default([]),
});

export async function createAgreementVersion(input: unknown) {
  const data = agreementInput.parse(input);
  validateEffectiveRange(data.effectiveFrom, data.effectiveTo);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_AGREEMENTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const partner = await tx.networkPartner.findFirst({ where: { id: data.partnerId, organizationKey: principal.organizationKey } });
    if (!partner) throw new NotFoundError("Partner");
    const previous = await tx.networkAgreement.findFirst({
      where: { organizationKey: principal.organizationKey, agreementKey: data.agreementKey },
      orderBy: { version: "desc" },
    });
    const agreementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_AGREEMENT", "AGR");
    const agreement = await tx.networkAgreement.create({
      data: {
        ...data, terms: data.terms as Prisma.InputJsonValue, documentRefs: data.documentRefs,
        organizationKey: principal.organizationKey, agreementNumber,
        version: (previous?.version ?? 0) + 1, preparedById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "AGREEMENT_VERSION_CREATED", entityType: "NetworkAgreement", entityId: agreement.id,
      description: `Agreement ${agreementNumber} version ${agreement.version} created`, next: { agreementKey: data.agreementKey, version: agreement.version },
    });
    return agreement;
  });
}

export async function transitionAgreement(agreementId: string, next: string) {
  const permission = next === "APPROVED" ? PERMISSIONS.NETWORK_AGREEMENTS_APPROVE : PERMISSIONS.NETWORK_AGREEMENTS_MANAGE;
  const principal = await requireNetworkPrincipal(permission);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkAgreement.findFirst({ where: { id: agreementId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Agreement");
    assertTransition(current.status, next, AGREEMENT_TRANSITIONS);
    if (next === "APPROVED") {
      await enforceSegregationOfDuties(tx, principal, {
        organizationKey: principal.organizationKey, operationType: "AGREEMENT_APPROVAL",
        subjectType: "NetworkAgreement", subjectId: current.id, preparerId: current.preparedById,
      });
    }
    const now = new Date();
    const agreement = await tx.networkAgreement.update({
      where: { id: current.id }, data: {
        status: next, approvedById: next === "APPROVED" ? principal.id : undefined,
        approvedAt: next === "APPROVED" ? now : undefined, executedAt: next === "ACTIVE" ? now : undefined,
        terminatedAt: next === "TERMINATED" ? now : undefined,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: `AGREEMENT_${next}`, entityType: "NetworkAgreement", entityId: agreement.id,
      description: `Agreement ${current.status} to ${next}`, previous: { status: current.status }, next: { status: next },
    });
    return agreement;
  });
}

export async function updateDraftAgreement(agreementId: string, terms: Record<string, unknown>) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_AGREEMENTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkAgreement.findFirst({ where: { id: agreementId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Agreement");
    assertEditable(current.status);
    if (current.status !== "DRAFT") throw new AppError("Only draft agreements can be edited", 409);
    const agreement = await tx.networkAgreement.update({ where: { id: current.id }, data: { terms: terms as Prisma.InputJsonValue } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "AGREEMENT_DRAFT_UPDATED", entityType: "NetworkAgreement", entityId: agreement.id,
      description: "Draft agreement updated", next: { version: agreement.version },
    });
    return agreement;
  });
}

export async function amendAgreement(agreementId: string, input: unknown, correctionReason: string) {
  const data = agreementInput.omit({ agreementKey: true, partnerId: true, agreementType: true }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_AGREEMENTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkAgreement.findFirst({ where: { id: agreementId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Agreement");
    if (!["APPROVED", "PENDING_EXECUTION", "ACTIVE"].includes(current.status)) throw new ConflictError("Only a finalized current agreement can be amended");
    const agreementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_AGREEMENT", "AGR");
    const successor = await tx.networkAgreement.create({
      data: {
        organizationKey: principal.organizationKey, agreementKey: current.agreementKey, agreementNumber,
        partnerId: current.partnerId, agreementType: current.agreementType, version: current.version + 1,
        status: "DRAFT", effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo,
        terms: data.terms as Prisma.InputJsonValue, documentRefs: data.documentRefs,
        preparedById: principal.id, previousVersionId: current.id, correctionReason: correctionReason.trim(),
      },
    });
    await tx.networkAgreement.update({ where: { id: current.id }, data: { status: "SUPERSEDED", supersededById: successor.id } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "AGREEMENT_AMENDED", entityType: "NetworkAgreement", entityId: successor.id,
      description: `Agreement ${current.agreementNumber} superseded by ${successor.agreementNumber}`,
      previous: { agreementId: current.id, version: current.version }, next: { agreementId: successor.id, version: successor.version, correctionReason },
    });
    return successor;
  });
}
