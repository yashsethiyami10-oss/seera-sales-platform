import { z } from "zod";

// MUV AI — Knowledge Retrieval Core (KRC, Module 5). Validation for every
// read-only retrieval operation. `sourceType`/`sourceTypes` are validated
// against the same string union lib/retrieval/types.ts defines (not a
// Prisma enum) — extensible to a "Future Source" without a migration.

export const knowledgeSourceTypeValues = ["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE"] as const;
export const versionSelectorModeValues = ["published", "latest", "specific", "draft", "review", "archived", "history"] as const;

export const versionSelectorSchema = z
  .object({
    mode: z.enum(versionSelectorModeValues).default("published"),
    versionId: z.string().cuid().optional(),
  })
  .refine((data) => data.mode !== "specific" || !!data.versionId, {
    message: "versionId is required when mode is \"specific\"",
    path: ["versionId"],
  });

const cuid = () => z.string().cuid();

/** Shared shape for retrieveKnowledge/searchKnowledge/getPublishedKnowledge
 * — every field optional so callers can filter by whatever they actually
 * know, but at least one real filter is required (enforced per-schema
 * below) so "return everything" is never a legal call — "the AI should
 * never search everything." */
const retrievalContextBaseSchema = z.object({
  knowledgeId: cuid().optional(),
  slug: z.string().max(120).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  keywords: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  productId: cuid().optional(),
  problemIntelligenceId: cuid().optional(),
  careIntelligenceId: cuid().optional(),
  sourceTypes: z.array(z.enum(knowledgeSourceTypeValues)).max(4).optional(),
  versionSelector: versionSelectorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function requireAtLeastOneFilter<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: unknown, ctx) => {
    const d = data as Record<string, unknown>;
    const hasFilter = ["knowledgeId", "slug", "tags", "keywords", "category", "productId", "problemIntelligenceId", "careIntelligenceId"].some(
      (key) => d[key] !== undefined && !(Array.isArray(d[key]) && (d[key] as unknown[]).length === 0)
    );
    if (!hasFilter) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one filter (knowledgeId, slug, tags, keywords, category, productId, problemIntelligenceId, or careIntelligenceId) is required" });
    }
  });
}

export const retrieveKnowledgeSchema = requireAtLeastOneFilter(retrievalContextBaseSchema);

export const searchKnowledgeSchema = retrievalContextBaseSchema.extend({
  keywords: z.string().min(1, "keywords is required for a search").max(200),
});

export const getPublishedKnowledgeSchema = requireAtLeastOneFilter(retrievalContextBaseSchema);

export const resolveKnowledgeSchema = z
  .object({
    sourceType: z.enum(knowledgeSourceTypeValues),
    recordId: cuid().optional(),
    slug: z.string().max(120).optional(),
    versionSelector: versionSelectorSchema.optional(),
  })
  .refine((data) => !!data.recordId || !!data.slug, { message: "Either recordId or slug is required", path: ["recordId"] });

export const getKnowledgeHistorySchema = z.object({
  sourceType: z.enum(knowledgeSourceTypeValues),
  recordId: cuid(),
});

export const getKnowledgeRelationshipsSchema = z.object({
  sourceType: z.enum(knowledgeSourceTypeValues),
  recordId: cuid(),
});

export const validateRetrievalScopeSchema = z.object({
  sourceTypes: z.array(z.enum(knowledgeSourceTypeValues)).max(4).optional(),
  versionSelector: versionSelectorSchema.optional(),
});

const sourceReferenceSchema = z.object({
  type: z.enum(["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE", "PRODUCT"]),
  id: z.string(),
  label: z.string().optional(),
  linkKind: z.enum(["direct", "via-product"]),
});

/** Mirrors lib/retrieval/types.ts's RetrievalResult exactly, so
 * rankKnowledge validates real result shapes, not `z.any()`. */
const retrievalResultSchema = z.object({
  sourceType: z.enum(knowledgeSourceTypeValues),
  recordId: z.string(),
  versionId: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  layer: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]),
  versionNumber: z.number().nullable(),
  status: z.string().nullable(),
  priorityScore: z.number(),
  relationship: z.string().nullable(),
  matchedFields: z.array(z.string()),
  confidence: z.number(),
  retrievedAt: z.string(),
  sourceReferences: z.array(sourceReferenceSchema),
  internalMetadata: z.record(z.unknown()).nullable(),
});

export const rankKnowledgeSchema = z.object({
  results: z.array(retrievalResultSchema).max(200),
  context: retrievalContextBaseSchema.partial().optional(),
});

// Sprint 7 — Retrieval Orchestration. Deliberately narrower than
// retrievalContextBaseSchema: the orchestration plan's tiers key off
// product/problem/care identity and variant scope, not the full
// knowledgeId/slug/tags/category surface the raw pipeline exposes.
export const runOrchestrationPlanSchema = z
  .object({
    productId: cuid().optional(),
    variantId: cuid().optional(),
    problemIntelligenceId: cuid().optional(),
    careIntelligenceId: cuid().optional(),
    keywords: z.string().max(200).optional(),
  })
  .refine((data) => !!data.productId || !!data.problemIntelligenceId || !!data.careIntelligenceId, {
    message: "At least one of productId, problemIntelligenceId, or careIntelligenceId is required",
  });
