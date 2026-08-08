import { z } from "zod";
import { knowledgeLayerValues } from "@/lib/validations/knowledge";

// MUV AI — Product Intelligence Foundation (PIF Engine, Module 2). Reuses
// knowledgeLayerValues from Module 1 (lib/validations/knowledge.ts) for
// Layer A/B/C rather than redefining it — same values, one source.

export const productIntelligenceStatusValues = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

// Enforced server-side in actions/product-intelligence.ts. Draft -> Review
// -> Published -> Archived is a strict pipeline: DRAFT cannot go straight
// to PUBLISHED (a review step is mandatory — "Human Accountability"/"Safety
// First"), and PUBLISHED can only ever move to ARCHIVED (never back to
// DRAFT/REVIEW — "never overwrite published knowledge"; a correction is
// always a new version via duplicateProductIntelligenceDraft).
export const PRODUCT_INTELLIGENCE_ALLOWED_TRANSITIONS: Record<(typeof productIntelligenceStatusValues)[number], string[]> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const faqEntrySchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});

const objectionEntrySchema = z.object({
  objection: z.string().min(1).max(500),
  response: z.string().min(1).max(2000),
});

const doDontSchema = z.object({
  do: z.array(z.string().max(300)).max(30).default([]),
  dont: z.array(z.string().max(300)).max(30).default([]),
});

/**
 * The 15 structured PIF sections. `.catchall(z.unknown())` deliberately
 * lets an unrecognized key pass through validation instead of being
 * rejected — this is what "additional sections can be added later without
 * breaking compatibility" means at the validation layer: a new section
 * doesn't require touching this schema before it can be saved, though it
 * won't get the benefit of strict typing until a named field is added here
 * for it.
 */
export const productIntelligenceSectionsSchema = z
  .object({
    productIdentity: z.string().max(2000).optional(),
    purpose: z.string().max(2000).optional(),
    problemsSolved: z.array(z.string().max(500)).max(50).optional(),
    features: z.array(z.string().max(500)).max(50).optional(),
    benefits: z.array(z.string().max(500)).max(50).optional(),
    ingredients: z.string().max(5000).optional(),
    usageInstructions: z.string().max(5000).optional(),
    safetyInformation: z.string().max(5000).optional(),
    doDont: doDontSchema.optional(),
    faqs: z.array(faqEntrySchema).max(50).optional(),
    objectionHandling: z.array(objectionEntrySchema).max(50).optional(),
    comparisonNotes: z.string().max(5000).optional(),
    crossSellSuggestions: z.array(z.string().max(200)).max(50).optional(),
    storageInstructions: z.string().max(2000).optional(),
    shelfLife: z.string().max(500).optional(),
  })
  .catchall(z.unknown());

export const createProductIntelligenceSchema = z.object({
  productId: z.string().cuid(),
  layer: z.enum(knowledgeLayerValues),
  sections: productIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

// Content edits only ever target a specific version, and only while it's
// still DRAFT/REVIEW (enforced in the action, not here) — never "the
// product's current PIF" generically, so there's no ambiguity about which
// row is being mutated.
export const updateProductIntelligenceSchema = z.object({
  versionId: z.string().cuid(),
  sections: productIntelligenceSectionsSchema,
  changeNote: z.string().max(500).optional(),
});

export const updateProductIntelligenceLayerSchema = z.object({
  productIntelligenceId: z.string().cuid(),
  layer: z.enum(knowledgeLayerValues),
});

export const productIntelligenceStatusTransitionSchema = z.object({
  versionId: z.string().cuid(),
  status: z.enum(productIntelligenceStatusValues),
});

// Serves both "Duplicate Draft" and "Restore" from the module spec — a
// restore is a duplicate whose `sourceVersionId` happens to point at an
// old (typically ARCHIVED) version instead of the current one. Kept as one
// action rather than two near-identical ones ("avoid duplicated logic").
// Omitting sourceVersionId duplicates the item's latest version by
// versionNumber, regardless of status.
export const duplicateProductIntelligenceDraftSchema = z.object({
  productIntelligenceId: z.string().cuid(),
  sourceVersionId: z.string().cuid().optional(),
  changeNote: z.string().max(500).optional(),
});

export const productIntelligenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  layer: z.enum(knowledgeLayerValues).optional(),
});

export type ProductIntelligenceSections = z.infer<typeof productIntelligenceSectionsSchema>;
