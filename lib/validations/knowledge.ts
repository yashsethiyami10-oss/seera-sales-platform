import { z } from "zod";

// MUV AI Knowledge Foundation — Layer A/B/C permission model and PIF/PrIF/CIF
// taxonomy per the MUV AI Master Implementation Prompt (not found in the
// on-disk Knowledge Library/AI Sutra source files as of this module — see
// the schema comment above KnowledgeLayer in prisma/schema.prisma for the
// full note on that).

export const knowledgeLayerValues = ["PUBLIC", "INTERNAL", "CONFIDENTIAL"] as const;
export const knowledgeFileTypeValues = [
  "KNOWLEDGE_LIBRARY",
  "PRODUCT_INTELLIGENCE",
  "PROBLEM_INTELLIGENCE",
  "CARE_INTELLIGENCE",
  "POLICY",
  "SOP",
  "FAQ",
] as const;
export const knowledgeVersionStatusValues = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

// Enforced server-side in actions/knowledge.ts (not just disabled in a
// future admin UI) — same discipline as ALLOWED_TRANSITIONS in
// lib/validations/order.ts and RETURN_REQUEST_ALLOWED_TRANSITIONS in
// lib/validations/returns.ts. A version can never move backward out of
// PUBLISHED or ARCHIVED — "never overwrite published knowledge" means a
// correction is always a *new* version, never a reopened old one.
export const KNOWLEDGE_VERSION_ALLOWED_TRANSITIONS: Record<(typeof knowledgeVersionStatusValues)[number], string[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createKnowledgeItemSchema = z.object({
  slug: z.string().min(1).max(120).regex(slugPattern, "Use lowercase letters, numbers, and hyphens only"),
  title: z.string().min(1).max(200),
  fileType: z.enum(knowledgeFileTypeValues),
  layer: z.enum(knowledgeLayerValues),
  productId: z.string().cuid().optional(),
  // The item's first version is created together with the item itself —
  // an item with zero versions has nothing for an admin to review or
  // publish, so this isn't optional the way a later edit's content is.
  content: z.string().min(1),
  changeNote: z.string().max(500).optional(),
});

// Classification metadata only (title/layer/product association) — never
// content. Content changes always go through createKnowledgeVersion below,
// so a version's text can never be silently altered after the fact.
export const updateKnowledgeItemMetaSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1).max(200).optional(),
  layer: z.enum(knowledgeLayerValues).optional(),
  productId: z.string().cuid().nullable().optional(),
});

export const createKnowledgeVersionSchema = z.object({
  itemId: z.string().cuid(),
  content: z.string().min(1),
  changeNote: z.string().max(500).optional(),
});

export const knowledgeVersionTransitionSchema = z.object({
  versionId: z.string().cuid(),
  status: z.enum(knowledgeVersionStatusValues),
});

export const knowledgeItemQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  fileType: z.enum(knowledgeFileTypeValues).optional(),
  layer: z.enum(knowledgeLayerValues).optional(),
});

// The customer/AI-facing retrieval path — deliberately its own schema, not
// a reuse of knowledgeItemQuerySchema, so a Layer restriction can never be
// accidentally left off a future caller. See getPublicKnowledge in
// actions/knowledge.ts — it hardcodes layer: PUBLIC and status: PUBLISHED
// itself, this schema doesn't even accept a layer parameter to override.
export const publicKnowledgeQuerySchema = z.object({
  fileType: z.enum(knowledgeFileTypeValues).optional(),
  productId: z.string().cuid().optional(),
});
