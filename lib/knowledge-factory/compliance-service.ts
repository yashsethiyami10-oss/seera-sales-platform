import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireKnowledgeFactoryPrincipal } from "./context";

/**
 * MUV AI Engineering Execution — Sprint 11 (Domain Foundations). Generic
 * Compliance Requirement registry — mirrors NetworkComplianceRequirement/
 * NetworkComplianceRecord's proven versioned-requirement + versioned-
 * record-per-target SHAPE (Enterprise Network track), generalized via the
 * same targetType/targetId polymorphic idiom SourceProvenance/
 * KnowledgeEmbedding/KnowledgeUsageReference already use. Does not touch or
 * extend the Network-scoped models, which stay frozen — this is a new,
 * independent registry, reusing only the *pattern*, not the tables.
 */

const registerRequirementInput = z.object({
  requirementKey: z.string().min(2).max(80),
  name: z.string().min(2).max(200),
  description: z.string().min(3).max(2000),
  scopeType: z.string().min(2).max(60),
  mandatory: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

export async function registerRequirement(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = registerRequirementInput.parse(input);

  const existing = await prisma.complianceRequirement.findFirst({
    where: { organizationKey: principal.organizationKey, requirementKey: data.requirementKey },
    orderBy: { version: "desc" },
  });
  const version = (existing?.version ?? 0) + 1;

  const requirement = await prisma.complianceRequirement.create({
    data: { organizationKey: principal.organizationKey, version, createdById: principal.id, ...data },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "COMPLIANCE_REQUIREMENT_REGISTERED", entityType: "ComplianceRequirement", entityId: requirement.id,
    description: `${data.requirementKey} v${version} registered (${data.scopeType}${data.mandatory ? ", mandatory" : ""})`,
  }).catch(() => {});
  return requirement;
}

export async function retireRequirement(id: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const requirement = await prisma.complianceRequirement.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!requirement) throw new NotFoundError("Compliance requirement");
  if (requirement.status !== "ACTIVE") throw new ConflictError("Only an ACTIVE requirement can be retired");
  const updated = await prisma.complianceRequirement.update({ where: { id }, data: { status: "RETIRED", effectiveTo: new Date() } });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "COMPLIANCE_REQUIREMENT_RETIRED", entityType: "ComplianceRequirement", entityId: id,
    description: `${requirement.requirementKey} v${requirement.version} retired`,
  }).catch(() => {});
  return updated;
}

const recordComplianceInput = z.object({
  requirementId: z.string().min(1),
  targetType: z.string().min(2).max(80),
  targetId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLIANT", "NON_COMPLIANT", "WAIVED"]),
  evidenceRefs: z.array(z.unknown()).default([]),
  validFrom: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordCompliance(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = recordComplianceInput.parse(input);

  const requirement = await prisma.complianceRequirement.findFirst({ where: { id: data.requirementId, organizationKey: principal.organizationKey } });
  if (!requirement) throw new NotFoundError("Compliance requirement");
  if (requirement.status !== "ACTIVE") throw new AppError("Cannot record compliance against a RETIRED requirement", 422, "VALIDATION_ERROR");

  const record = await prisma.complianceRecord.create({
    data: {
      organizationKey: principal.organizationKey, requirementId: data.requirementId, targetType: data.targetType, targetId: data.targetId,
      status: data.status, evidenceRefs: data.evidenceRefs as never, validFrom: data.validFrom, expiresAt: data.expiresAt, notes: data.notes,
      reviewedById: principal.id, reviewedAt: new Date(),
    },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "COMPLIANCE_RECORDED", entityType: "ComplianceRecord", entityId: record.id,
    description: `${data.status} recorded for ${data.targetType}:${data.targetId} against ${requirement.requirementKey}`,
  }).catch(() => {});
  return record;
}

export async function getComplianceStatus(targetType: string, targetId: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const requirements = await prisma.complianceRequirement.findMany({
    where: { organizationKey: principal.organizationKey, scopeType: targetType, status: "ACTIVE" },
    include: { records: { where: { targetType, targetId }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return requirements.map((r) => ({
    requirement: r,
    latestRecord: r.records[0] ?? null,
    // No record at all is never silently treated as compliant — an
    // unrecorded mandatory requirement is exactly as blocking as an
    // explicit NON_COMPLIANT one.
    effectiveStatus: r.records[0]?.status ?? "PENDING",
  }));
}

export async function listRequirements(input: { scopeType?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.scopeType ? { scopeType: input.scopeType } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.complianceRequirement.findMany({ where, orderBy: [{ requirementKey: "asc" }, { version: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.complianceRequirement.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Used by a future Publish Gate (matching KnowledgeConflict's own
 * hasOpenConflicts precedent) — a target with any mandatory requirement
 * not COMPLIANT/WAIVED should be blockable from publish. Exposed now so a
 * later sprint can call it without redefining the query. */
export async function listNonCompliantTargets(scopeType: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const requirements = await prisma.complianceRequirement.findMany({
    where: { organizationKey: principal.organizationKey, scopeType, status: "ACTIVE", mandatory: true },
    include: { records: { orderBy: { createdAt: "desc" } } },
  });
  const nonCompliant: { requirementId: string; requirementKey: string; targetId: string; status: string }[] = [];
  for (const r of requirements) {
    const latestByTarget = new Map<string, (typeof r.records)[number]>();
    for (const rec of r.records) if (!latestByTarget.has(rec.targetId)) latestByTarget.set(rec.targetId, rec);
    for (const [targetId, rec] of latestByTarget) {
      if (rec.status !== "COMPLIANT" && rec.status !== "WAIVED") nonCompliant.push({ requirementId: r.id, requirementKey: r.requirementKey, targetId, status: rec.status });
    }
  }
  return nonCompliant;
}
