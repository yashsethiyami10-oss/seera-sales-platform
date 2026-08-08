import { z } from "zod";
import { knowledgeLayerValues } from "@/lib/validations/knowledge";
import { productIntelligenceSectionsSchema } from "@/lib/validations/product-intelligence";

/**
 * MUV AI Engineering Execution — Sprint 5 (Knowledge Modeling). Extends
 * Module 2's exact validation conventions to Category and Variant scope —
 * same status enum, same transition map, same .catchall()-style forward
 * compatibility already established for productIntelligenceSectionsSchema.
 */

export const knowledgeModelingStatusValues = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

export const KNOWLEDGE_MODELING_ALLOWED_TRANSITIONS: Record<(typeof knowledgeModelingStatusValues)[number], string[]> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

/**
 * Deliberately a small, closed set — V4 §2.3's inheritance rule: a fact
 * true for every product in a category (general safety class, general
 * storage class) belongs here; usage instructions, ingredients, and
 * pricing-adjacent content must NEVER be authored at category scope, since
 * those must never silently inherit down to a specific product.
 */
export const categoryIntelligenceSectionsSchema = z
  .object({
    generalSafetyClass: z.string().max(2000).optional(),
    generalStorageClass: z.string().max(2000).optional(),
    generalCareGuidance: z.string().max(2000).optional(),
  })
  .catchall(z.unknown());

export const createCategoryIntelligenceSchema = z.object({
  categoryId: z.string().cuid(),
  layer: z.enum(knowledgeLayerValues),
  sections: categoryIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

export const updateCategoryIntelligenceSchema = z.object({
  versionId: z.string().cuid(),
  sections: categoryIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

export const categoryIntelligenceStatusTransitionSchema = z.object({
  versionId: z.string().cuid(),
  status: z.enum(knowledgeModelingStatusValues),
});

/**
 * A variant override reuses PIF's own section shape exactly — a variant
 * override is a product-level-shaped fact, just scoped narrower. Unlike
 * Category, there is no restricted section list here: a variant may
 * legitimately override any PIF section (e.g. a fragrance-specific safety
 * note), per V4 §2.3's "variant replaces product-level exclusively."
 */
export const createProductVariantIntelligenceSchema = z.object({
  variantId: z.string().cuid(),
  layer: z.enum(knowledgeLayerValues),
  sections: productIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

export const updateProductVariantIntelligenceSchema = z.object({
  versionId: z.string().cuid(),
  sections: productIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

export const productVariantIntelligenceStatusTransitionSchema = z.object({
  versionId: z.string().cuid(),
  status: z.enum(knowledgeModelingStatusValues),
});
