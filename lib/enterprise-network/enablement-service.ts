import { Prisma } from "@prisma/client";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { pageInput } from "./schemas";

/** Enterprise UI Integration — Business Network UI. Pure read addition. */
export async function listSupportCases(input: unknown) {
  const data = pageInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  const where: Prisma.NetworkSupportCaseWhereInput = {
    organizationKey: principal.organizationKey,
    status: data.status,
    ...(data.search ? { caseNumber: { contains: data.search, mode: "insensitive" } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.networkSupportCase.count({ where }),
    prisma.networkSupportCase.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (data.page - 1) * data.pageSize, take: data.pageSize,
      include: { partner: { select: { id: true, legalName: true, partnerNumber: true } } },
    }),
  ]);
  return { items, total, page: data.page, pageSize: data.pageSize, pages: Math.max(1, Math.ceil(total / data.pageSize)) };
}

export async function createTargetPlan(input: unknown) {
  const data = z.object({
    planKey: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(160),
    periodStart: z.coerce.date(), periodEnd: z.coerce.date(),
    lines: z.array(z.object({ partnerId: z.string().cuid(), metricKey: z.string().trim().min(1).max(80), targetValue: z.coerce.number().nonnegative(), sourceRule: z.record(z.unknown()).default({}) })).min(1),
  }).parse(input);
  if (data.periodEnd <= data.periodStart) throw new NotFoundError("Valid target period");
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const latest = await tx.networkTargetPlan.findFirst({ where: { organizationKey: principal.organizationKey, planKey: data.planKey }, orderBy: { version: "desc" } });
    const partners = await tx.networkPartner.count({ where: { organizationKey: principal.organizationKey, id: { in: data.lines.map((line) => line.partnerId) } } });
    if (partners !== new Set(data.lines.map((line) => line.partnerId)).size) throw new NotFoundError("Target partner");
    const plan = await tx.networkTargetPlan.create({
      data: {
        organizationKey: principal.organizationKey, planKey: data.planKey, name: data.name,
        periodStart: data.periodStart, periodEnd: data.periodEnd, version: (latest?.version ?? 0) + 1, createdById: principal.id,
        lines: { create: data.lines.map((line) => ({ ...line, sourceRule: line.sourceRule as Prisma.InputJsonValue, organizationKey: principal.organizationKey })) },
      }, include: { lines: true },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TARGET_PLAN_CREATED", entityType: "NetworkTargetPlan", entityId: plan.id, description: `Target plan ${plan.planKey} version ${plan.version} created`, next: { version: plan.version, lines: plan.lines.length } });
    return plan;
  });
}

export async function deriveTargetAchievement(planId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_ANALYTICS_VIEW);
  const plan = await (await import("@/lib/prisma")).prisma.networkTargetPlan.findFirst({
    where: { id: planId, organizationKey: principal.organizationKey }, include: { lines: true },
  });
  if (!plan) throw new NotFoundError("Target plan");
  const db = (await import("@/lib/prisma")).prisma;
  return Promise.all(plan.lines.map(async (line) => {
    const rule = line.sourceRule as { territoryKey?: string; metricKey?: string };
    const sources = await db.networkPartnerOrderSource.findMany({
      where: {
        organizationKey: principal.organizationKey, partnerId: line.partnerId,
        metricKey: rule.metricKey ?? line.metricKey,
        territoryKey: rule.territoryKey,
        effectiveAt: { gte: plan.periodStart, lt: plan.periodEnd },
        order: { paymentStatus: "PAID" },
      },
      orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
    });
    const achieved = sources.reduce((sum, source) => sum + Number(source.attributedAmount), 0);
    return {
      partnerId: line.partnerId, metricKey: line.metricKey, target: Number(line.targetValue),
      achieved, percentage: Number(line.targetValue) ? Math.round(achieved / Number(line.targetValue) * 10000) / 100 : 0,
      territoryKey: rule.territoryKey ?? null,
      sourceSnapshot: sources.map((source) => ({ id: source.id, version: source.sourceVersion, amount: source.attributedAmount.toString() })),
      authoritativeSource: "network_partner_order_sources",
    };
  }));
}

export async function openPartnerSupportCase(input: unknown) {
  const data = z.object({ partnerId: z.string().cuid(), category: z.string().min(1).max(80), priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"), subject: z.string().min(2).max(200), description: z.string().min(2).max(4000) }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    if (!await tx.networkPartner.findFirst({ where: { id: data.partnerId, organizationKey: principal.organizationKey } })) throw new NotFoundError("Partner");
    const caseNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "NETWORK_SUPPORT", "SUP");
    const item = await tx.networkSupportCase.create({ data: { ...data, organizationKey: principal.organizationKey, caseNumber, createdById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "SUPPORT_CASE_OPENED", entityType: "NetworkSupportCase", entityId: item.id, description: `Support case ${caseNumber} opened`, next: { partnerId: data.partnerId, priority: data.priority } });
    return item;
  });
}

export async function transitionSupportCase(caseId: string, next: "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED", input: { assignedToId?: string; resolution?: string } = {}) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  const graph: Record<string, string[]> = { OPEN: ["ASSIGNED"], ASSIGNED: ["ASSIGNED", "IN_PROGRESS"], IN_PROGRESS: ["ASSIGNED", "RESOLVED"], RESOLVED: ["IN_PROGRESS", "CLOSED"], CLOSED: [] };
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkSupportCase.findFirst({ where: { id: caseId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Support case");
    if (!graph[current.status]?.includes(next)) throw new NotFoundError(`Valid support transition from ${current.status}`);
    if (["ASSIGNED", "IN_PROGRESS"].includes(next) && !(input.assignedToId ?? current.assignedToId)) throw new NotFoundError("Support owner");
    if (next === "RESOLVED" && !input.resolution?.trim()) throw new NotFoundError("Support resolution");
    const now = new Date();
    const item = await tx.networkSupportCase.update({ where: { id: current.id }, data: {
      status: next, assignedToId: input.assignedToId, resolution: input.resolution,
      resolvedAt: next === "RESOLVED" ? now : next === "IN_PROGRESS" ? null : undefined,
      closedAt: next === "CLOSED" ? now : undefined, version: { increment: 1 },
    } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: `SUPPORT_${next}`, entityType: "NetworkSupportCase", entityId: item.id, description: `Support case ${current.status} to ${next}`, previous: { status: current.status }, next: { status: next, assignedToId: item.assignedToId, resolution: item.resolution } });
    return item;
  });
}

export async function createTrainingProgramVersion(input: unknown) {
  const data = z.object({
    programKey: z.string().min(1).max(80), title: z.string().min(2).max(200),
    partnerTypes: z.array(z.string()).default([]), mandatory: z.boolean().default(false),
    validForDays: z.number().int().positive().optional(), contentRefs: z.array(z.string()).default([]),
  }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const previous = await tx.networkTrainingProgram.findFirst({ where: { organizationKey: principal.organizationKey, programKey: data.programKey }, orderBy: { version: "desc" } });
    const program = await tx.networkTrainingProgram.create({ data: { ...data, organizationKey: principal.organizationKey, version: (previous?.version ?? 0) + 1, createdById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TRAINING_PROGRAM_VERSION_CREATED", entityType: "NetworkTrainingProgram", entityId: program.id, description: `Training program ${program.programKey} version ${program.version} created`, next: { version: program.version } });
    return program;
  });
}

export async function assignPartnerTraining(programId: string, partnerId: string, dueAt?: Date) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const [program, partner] = await Promise.all([
      tx.networkTrainingProgram.findFirst({ where: { id: programId, organizationKey: principal.organizationKey, status: "ACTIVE" } }),
      tx.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey } }),
    ]);
    if (!program || !partner) throw new NotFoundError("Training program or partner");
    const assignment = await tx.networkTrainingAssignment.create({ data: { organizationKey: principal.organizationKey, programId, partnerId, dueAt, assignedById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TRAINING_ASSIGNED", entityType: "NetworkTrainingAssignment", entityId: assignment.id, description: "Partner training assigned", next: { programId, partnerId, dueAt: dueAt?.toISOString() ?? null } });
    return assignment;
  });
}

export async function completePartnerTraining(assignmentId: string, evidenceRefs: string[], certificationReference?: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkTrainingAssignment.findFirst({ where: { id: assignmentId, organizationKey: principal.organizationKey, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, include: { program: true } });
    if (!current) throw new NotFoundError("Active training assignment");
    if (!evidenceRefs.length) throw new NotFoundError("Training completion evidence");
    const completedAt = new Date();
    const renewalDueAt = current.program.validForDays ? new Date(completedAt.getTime() + current.program.validForDays * 86_400_000) : null;
    const completed = await tx.networkTrainingAssignment.update({ where: { id: current.id }, data: { status: "COMPLETED", completedAt, evidenceRefs, certificationReference, renewalDueAt } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "TRAINING_COMPLETED", entityType: "NetworkTrainingAssignment", entityId: completed.id, description: "Partner training completed", next: { evidenceRefs, certificationReference: certificationReference ?? null, renewalDueAt: renewalDueAt?.toISOString() ?? null } });
    return completed;
  });
}

export async function createComplianceRequirementVersion(input: unknown) {
  const data = z.object({
    requirementKey: z.string().min(1).max(80), name: z.string().min(2).max(200),
    partnerTypes: z.array(z.string()).default([]), mandatory: z.boolean().default(true),
    renewalDays: z.number().int().positive().optional(), trainingProgramId: z.string().cuid().optional(),
    effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional(),
  }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    if (data.trainingProgramId && !await tx.networkTrainingProgram.findFirst({ where: { id: data.trainingProgramId, organizationKey: principal.organizationKey } })) throw new NotFoundError("Training program");
    const previous = await tx.networkComplianceRequirement.findFirst({ where: { organizationKey: principal.organizationKey, requirementKey: data.requirementKey }, orderBy: { version: "desc" } });
    const requirement = await tx.networkComplianceRequirement.create({ data: { ...data, organizationKey: principal.organizationKey, version: (previous?.version ?? 0) + 1, createdById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "COMPLIANCE_REQUIREMENT_VERSION_CREATED", entityType: "NetworkComplianceRequirement", entityId: requirement.id, description: `Compliance requirement ${requirement.requirementKey} version ${requirement.version} created`, next: { version: requirement.version, trainingProgramId: requirement.trainingProgramId } });
    return requirement;
  });
}

export async function recordPartnerCompliance(input: unknown) {
  const data = z.object({ requirementId: z.string().cuid(), partnerId: z.string().cuid(), status: z.enum(["PENDING", "COMPLIANT", "NON_COMPLIANT", "EXPIRED"]), evidenceRefs: z.array(z.string()).default([]), validFrom: z.coerce.date().optional(), expiresAt: z.coerce.date().optional(), notes: z.string().max(2000).optional() }).parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const requirement = await tx.networkComplianceRequirement.findFirst({ where: { id: data.requirementId, organizationKey: principal.organizationKey }, include: { trainingProgram: true } });
    if (!requirement) throw new NotFoundError("Compliance requirement");
    if (data.status === "COMPLIANT" && requirement.trainingProgramId) {
      const training = await tx.networkTrainingAssignment.findFirst({ where: { organizationKey: principal.organizationKey, partnerId: data.partnerId, programId: requirement.trainingProgramId, status: "COMPLETED", OR: [{ renewalDueAt: null }, { renewalDueAt: { gt: new Date() } }] } });
      if (!training) throw new NotFoundError("Current required training completion");
    }
    const previous = await tx.networkComplianceRecord.findFirst({ where: { organizationKey: principal.organizationKey, requirementId: data.requirementId, partnerId: data.partnerId }, orderBy: { version: "desc" } });
    const record = await tx.networkComplianceRecord.create({ data: { ...data, organizationKey: principal.organizationKey, version: (previous?.version ?? 0) + 1, reviewedById: principal.id, reviewedAt: new Date() } });
    const outstanding = await tx.networkComplianceRecord.count({ where: { organizationKey: principal.organizationKey, partnerId: data.partnerId, status: { not: "COMPLIANT" } } });
    await tx.networkPartner.updateMany({ where: { id: data.partnerId, organizationKey: principal.organizationKey }, data: { complianceStatus: outstanding ? "NON_COMPLIANT" : "COMPLIANT", version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "COMPLIANCE_RECORDED", entityType: "NetworkComplianceRecord", entityId: record.id, description: `Partner compliance ${data.status.toLowerCase()}`, next: { partnerId: data.partnerId, requirementId: data.requirementId, status: data.status, version: record.version } });
    return record;
  });
}

export async function processExpiredCompliance(asOf = new Date()) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const expiring = await tx.networkComplianceRecord.findMany({ where: { organizationKey: principal.organizationKey, status: "COMPLIANT", expiresAt: { lte: asOf } } });
    const created = [];
    for (const current of expiring) {
      if (await tx.networkComplianceRecord.findFirst({ where: {
        organizationKey: principal.organizationKey, requirementId: current.requirementId,
        partnerId: current.partnerId, version: { gt: current.version },
      } })) continue;
      const expired = await tx.networkComplianceRecord.create({ data: {
        organizationKey: principal.organizationKey, requirementId: current.requirementId, partnerId: current.partnerId,
        status: "EXPIRED", evidenceRefs: current.evidenceRefs as Prisma.InputJsonValue, validFrom: current.validFrom,
        expiresAt: current.expiresAt, notes: "Expired by governed compliance processing", version: current.version + 1,
        reviewedById: principal.id, reviewedAt: asOf,
      } });
      await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "COMPLIANCE_EXPIRED", entityType: "NetworkComplianceRecord", entityId: expired.id, description: "Partner compliance expired", next: { previousRecordId: current.id, asOf: asOf.toISOString() } });
      created.push(expired);
    }
    return created;
  });
}
