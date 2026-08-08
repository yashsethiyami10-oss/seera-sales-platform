import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireKnowledgeFactoryPrincipal } from "./context";

/**
 * MUV Intelligence Factory V4 §4/§8 — Conflict Queue. The permanent,
 * queryable destination for every duplicate/pricing/variant/naming
 * conflict the Normalization Layer detects — including, going forward,
 * every conflict this session's own Source Audit already found by hand
 * (Bathroom Cleaner/Floor Cleaner/Black Phenyl/White Phenyl/GLOW pricing
 * and naming conflicts, plus the Liquid Detergent Cool Water pricing
 * conflict found when the new SOP was verified). This service does not
 * resolve conflicts — it records them and tracks their resolution; the
 * decision itself remains a human one, per V4's explicit "never guess"
 * discipline applied to conflicting sources.
 */

const createConflictInput = z.object({
  conflictType: z.string().min(2).max(80),
  description: z.string().min(3).max(2000),
  sourceARef: z.string().min(1).max(500),
  sourceBRef: z.string().min(1).max(500),
  severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).default("MODERATE"),
});

export async function createConflict(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = createConflictInput.parse(input);
  const conflict = await prisma.knowledgeConflict.create({
    data: { organizationKey: principal.organizationKey, ...data },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "CONFLICT_REGISTERED", entityType: "KnowledgeConflict", entityId: conflict.id,
    description: `${data.conflictType} conflict registered: ${data.description}`,
  }).catch(() => {});
  return conflict;
}

export async function resolveConflict(id: string, resolutionNote: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const conflict = await prisma.knowledgeConflict.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!conflict) throw new NotFoundError("Conflict");
  if (conflict.status !== "OPEN") throw new ConflictError("Only an OPEN conflict can be resolved");
  if (!resolutionNote || resolutionNote.trim().length < 3) throw new AppError("A resolution note is required — a conflict is never silently closed", 422, "VALIDATION_ERROR");
  const updated = await prisma.knowledgeConflict.update({
    where: { id }, data: { status: "RESOLVED", resolvedById: principal.id, resolvedAt: new Date(), resolutionNote },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "CONFLICT_RESOLVED", entityType: "KnowledgeConflict", entityId: id,
    description: `Resolved: ${resolutionNote}`,
  }).catch(() => {});
  return updated;
}

export async function acceptAsKnownLimitation(id: string, resolutionNote: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const conflict = await prisma.knowledgeConflict.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!conflict) throw new NotFoundError("Conflict");
  if (conflict.status !== "OPEN") throw new ConflictError("Only an OPEN conflict can be accepted as a known limitation");
  if (!resolutionNote || resolutionNote.trim().length < 3) throw new AppError("A reason is required — acceptance is never silent", 422, "VALIDATION_ERROR");
  const updated = await prisma.knowledgeConflict.update({
    where: { id }, data: { status: "ACCEPTED_AS_KNOWN_LIMITATION", resolvedById: principal.id, resolvedAt: new Date(), resolutionNote },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "CONFLICT_ACCEPTED_AS_LIMITATION", entityType: "KnowledgeConflict", entityId: id,
    description: `Accepted as known limitation: ${resolutionNote}`,
  }).catch(() => {});
  return updated;
}

export async function listConflicts(input: { status?: string; conflictType?: string; severity?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.status ? { status: input.status } : {}),
    ...(input.conflictType ? { conflictType: input.conflictType } : {}),
    ...(input.severity ? { severity: input.severity as never } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.knowledgeConflict.findMany({ where, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.knowledgeConflict.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Used by the future Publish Gate (V4 §8) — a target with any OPEN
 * conflict cannot be published. Exposed here now so Sprint 4+ can call it
 * without redefining the query. */
export async function hasOpenConflicts(sourceRef: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const count = await prisma.knowledgeConflict.count({
    where: { organizationKey: principal.organizationKey, status: "OPEN", OR: [{ sourceARef: sourceRef }, { sourceBRef: sourceRef }] },
  });
  return count > 0;
}
