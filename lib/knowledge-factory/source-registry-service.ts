import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireKnowledgeFactoryPrincipal } from "./context";

/**
 * MUV Intelligence Factory V4 §1 — Canonical Source Layer. The one place
 * that knows what raw canonical documents exist, their authority, and
 * (via SourceProvenance, wired in later sprints) what they've produced.
 *
 * Duplicate detection (V4 §4.3) is enforced at the database level — a
 * unique constraint on (organizationKey, fileHash) — the exact SHA-256
 * mechanism already proven this session to prove the AI Sutra file was a
 * byte-identical duplicate across two folders. registerSource() catches
 * the resulting P2002 and returns a clear, actionable result instead of a
 * raw constraint-violation error.
 */

const sourceLocatorSchema = z.object({
  type: z.enum(["FILE", "URL", "CMS_ID", "CLOUD_OBJECT", "API"]),
  value: z.string().min(1),
});

const registerSourceInput = z.object({
  title: z.string().min(2).max(300),
  documentType: z.string().min(2).max(80),
  sourceLocator: sourceLocatorSchema,
  fileHash: z.string().min(8).max(128),
  authorityLevel: z.enum(["CONSTITUTIONAL", "OPERATIONAL", "PRODUCT_TECHNICAL", "EXPERIENCE", "EXTERNAL"]),
});

export async function registerSource(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = registerSourceInput.parse(input);

  const existing = await prisma.canonicalSourceDocument.findFirst({
    where: { organizationKey: principal.organizationKey, fileHash: data.fileHash },
  });
  if (existing) {
    return {
      created: false as const,
      document: existing,
      message: `A source with identical content is already registered as "${existing.title}" (${existing.id}, status ${existing.status}).`,
    };
  }

  const document = await prisma.canonicalSourceDocument.create({
    data: {
      organizationKey: principal.organizationKey,
      title: data.title,
      documentType: data.documentType,
      sourceLocator: data.sourceLocator,
      fileHash: data.fileHash,
      authorityLevel: data.authorityLevel,
      ingestedById: principal.id,
    },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "SOURCE_REGISTERED", entityType: "CanonicalSourceDocument", entityId: document.id,
    description: `Source "${document.title}" (${document.documentType}, ${document.authorityLevel}) registered`,
  }).catch(() => {});
  return { created: true as const, document };
}

/** B supersedes A: B.supersedesId = A.id, A.status flips to SUPERSEDED. Both
 * rows are preserved — never a delete, matching this codebase's own
 * immutable-evidence discipline applied to source documents. */
export async function markSuperseded(newDocumentId: string, oldDocumentId: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  if (newDocumentId === oldDocumentId) throw new AppError("A source cannot supersede itself", 422, "VALIDATION_ERROR");
  const [newDoc, oldDoc] = await Promise.all([
    prisma.canonicalSourceDocument.findFirst({ where: { id: newDocumentId, organizationKey: principal.organizationKey } }),
    prisma.canonicalSourceDocument.findFirst({ where: { id: oldDocumentId, organizationKey: principal.organizationKey } }),
  ]);
  if (!newDoc) throw new NotFoundError("New source document");
  if (!oldDoc) throw new NotFoundError("Superseded source document");
  if (oldDoc.status === "SUPERSEDED") throw new ConflictError("That source is already marked superseded");

  const [, updatedOld] = await prisma.$transaction([
    prisma.canonicalSourceDocument.update({ where: { id: newDocumentId }, data: { supersedesId: oldDocumentId } }),
    prisma.canonicalSourceDocument.update({ where: { id: oldDocumentId }, data: { status: "SUPERSEDED" } }),
  ]);
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "SOURCE_SUPERSEDED", entityType: "CanonicalSourceDocument", entityId: oldDocumentId,
    description: `"${oldDoc.title}" superseded by "${newDoc.title}"`,
  }).catch(() => {});
  return updatedOld;
}

export async function retireSource(id: string, reason: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const doc = await prisma.canonicalSourceDocument.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!doc) throw new NotFoundError("Source document");
  if (doc.status === "RETIRED") throw new ConflictError("Already retired");
  const updated = await prisma.canonicalSourceDocument.update({ where: { id }, data: { status: "RETIRED" } });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "SOURCE_RETIRED", entityType: "CanonicalSourceDocument", entityId: id,
    description: `"${doc.title}" retired: ${reason}`,
  }).catch(() => {});
  return updated;
}

export async function verifySource(id: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const doc = await prisma.canonicalSourceDocument.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!doc) throw new NotFoundError("Source document");
  return prisma.canonicalSourceDocument.update({ where: { id }, data: { lastVerifiedAt: new Date() } });
}

export async function getSource(id: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const doc = await prisma.canonicalSourceDocument.findFirst({
    where: { id, organizationKey: principal.organizationKey },
    include: { supersedes: true, supersededBy: true },
  });
  if (!doc) throw new NotFoundError("Source document");
  return doc;
}

const recordProvenanceInput = z.object({
  sourceDocumentId: z.string().cuid(),
  targetType: z.enum(["KnowledgeVersion", "ProductIntelligenceVersion", "ProblemIntelligenceVersion", "CareIntelligenceVersion", "CategoryIntelligenceVersion", "ProductVariantIntelligenceVersion"]),
  targetId: z.string().min(1),
  extractionConfidence: z.enum(["LOW", "MODERATE", "HIGH"]),
});

/** Governance metadata mechanism (V4 §3/§8): links a published knowledge
 * object back to the exact source document and confidence level that
 * justified it. Authority is never stored redundantly on the object itself
 * — it's always resolved by joining to sourceDocument.authorityLevel. */
export async function recordProvenance(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = recordProvenanceInput.parse(input);
  const source = await prisma.canonicalSourceDocument.findFirst({ where: { id: data.sourceDocumentId, organizationKey: principal.organizationKey } });
  if (!source) throw new NotFoundError("Source document");
  if (source.status !== "ACTIVE") throw new AppError("Cannot record provenance against a non-ACTIVE source — supersede/retire status must be resolved first", 409, "INVALID_SOURCE_STATUS");
  return prisma.sourceProvenance.create({
    data: { organizationKey: principal.organizationKey, sourceDocumentId: data.sourceDocumentId, targetType: data.targetType, targetId: data.targetId, extractedById: principal.id, extractionConfidence: data.extractionConfidence },
  });
}

export async function getProvenanceFor(targetType: string, targetId: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  return prisma.sourceProvenance.findMany({
    where: { organizationKey: principal.organizationKey, targetType, targetId },
    include: { sourceDocument: true },
    orderBy: { extractedAt: "desc" },
  });
}

export async function listSources(input: { documentType?: string; authorityLevel?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.documentType ? { documentType: input.documentType } : {}),
    ...(input.authorityLevel ? { authorityLevel: input.authorityLevel } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.canonicalSourceDocument.findMany({ where, orderBy: { ingestedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.canonicalSourceDocument.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
