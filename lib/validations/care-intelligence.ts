import { z } from "zod";
import { knowledgeLayerValues } from "@/lib/validations/knowledge";
import { problemConfidenceLevelValues } from "@/lib/validations/problem-intelligence";

// MUV AI — Care Intelligence Foundation (CIF Engine, Module 4). Reuses
// knowledgeLayerValues (Module 1) for Layer A/B/C and
// problemConfidenceLevelValues (Module 3) for evidence confidence — same
// vocabularies, not redefined a third/fourth time.

export const careIntelligenceStatusValues = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export const carePriorityValues = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const careResolutionConditionValues = [
  "RESOLVED", "PENDING", "WAITING_CUSTOMER", "WAITING_TEAM", "ESCALATED", "CLOSED", "CANCELLED",
] as const;

// Same shape as Modules 2/3's transition maps. DRAFT cannot reach PUBLISHED
// directly (REVIEW is mandatory); PUBLISHED only ever moves to ARCHIVED.
export const CARE_INTELLIGENCE_ALLOWED_TRANSITIONS: Record<(typeof careIntelligenceStatusValues)[number], string[]> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const cuid = () => z.string().cuid();
const shortText = (max: number) => z.string().max(max);
const longText = (max: number) => z.string().max(max);
const displayOrder = () => z.number().int().min(0).max(10000).default(0);

const requiredInformationItemSchema = z.object({
  label: shortText(200),
  description: longText(1000).optional(),
  isRequired: z.boolean().default(true),
  displayOrder: displayOrder(),
});

const careActionItemSchema = z.object({
  stepNumber: z.number().int().min(0).max(1000).default(0),
  description: longText(2000),
  actor: shortText(200).optional(),
  preconditions: longText(1000).optional(),
  expectedOutcome: longText(1000).optional(),
  failureHandling: longText(1000).optional(),
});

const evidenceSourceItemSchema = z.object({
  source: longText(1000),
  approved: z.boolean().default(false),
  confidence: z.enum(problemConfidenceLevelValues).default("LOW"),
  reviewerId: cuid().optional(),
  reviewDate: z.coerce.date().optional(),
  internalNotes: longText(2000).optional(),
});

/**
 * The full nested content for one version — required-information, care
 * actions, and evidence sources are all included here as arrays, not
 * populated through separate per-row actions. See the schema's own
 * file-level comment on CareIntelligenceVersion for why: this module's
 * Server Actions list has no addCareAction-style functions, unlike Module
 * 3's PrIF Engine.
 */
const careVersionContentSchema = z.object({
  title: shortText(200),
  category: shortText(120), // free text, extensible — no fixed vocabulary enforced
  summary: longText(3000).optional(),

  situationDescription: longText(3000).optional(),
  situationTags: z.array(shortText(60)).max(30).default([]),

  careObjectives: z.array(shortText(300)).max(20).default([]),

  escalationRequired: z.boolean().default(false),
  escalationReason: longText(2000).optional(),
  escalationTeam: shortText(200).optional(),
  escalationPriority: z.enum(carePriorityValues).optional(),
  escalationSla: shortText(200).optional(),
  escalationInternalNotes: longText(2000).optional(),

  communicationTone: shortText(300).optional(),
  thingsToAvoid: z.array(shortText(300)).max(30).default([]),
  mandatoryStatements: z.array(shortText(500)).max(30).default([]),
  optionalGuidance: z.array(shortText(500)).max(30).default([]),
  transparencyRules: z.array(shortText(500)).max(30).default([]),

  applicableResolutionConditions: z.array(z.enum(careResolutionConditionValues)).max(7).default([]),

  followUpGuidance: longText(2000).optional(),
  maxWaitingPeriod: shortText(100).optional(),
  reminderInterval: shortText(100).optional(),
  closureConditions: longText(2000).optional(),

  applicableCustomerSegments: z.array(shortText(100)).max(30).default([]),

  relatedProductIds: z.array(cuid()).max(50).default([]),
  relatedProductIntelligenceIds: z.array(cuid()).max(50).default([]),
  relatedProblemIntelligenceIds: z.array(cuid()).max(50).default([]),
  relatedKnowledgeItemIds: z.array(cuid()).max(50).default([]),

  requiredInformation: z.array(requiredInformationItemSchema).max(50).default([]),
  careActions: z.array(careActionItemSchema).max(100).default([]),
  evidenceSources: z.array(evidenceSourceItemSchema).max(50).default([]),
});

export const createCareIntelligenceSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  layer: z.enum(knowledgeLayerValues),
  content: careVersionContentSchema,
  changeNote: shortText(500).optional(),
});

/**
 * Operates on a specific versionId, only while DRAFT/REVIEW. Content
 * fields fully replace the version's existing scalar fields and child rows
 * (requiredInformation/careActions/evidenceSources are deleted and
 * recreated inside one transaction) — see the action file for why this is
 * "replace," not "patch."
 *
 * `status` here is deliberately narrow: only "DRAFT" or "REVIEW" are
 * accepted, so this one field also serves as the DRAFT<->REVIEW toggle in
 * place of a separate submitForReview action (not named in this module's
 * Server Actions list). Reaching PUBLISHED/ARCHIVED always goes through
 * publishCareIntelligence/archiveCareIntelligence instead.
 */
export const updateCareIntelligenceSchema = z.object({
  versionId: cuid(),
  content: careVersionContentSchema.partial(),
  status: z.enum(["DRAFT", "REVIEW"]).optional(),
  layer: z.enum(knowledgeLayerValues).optional(), // admin-only when present and changed — see actions file
  changeNote: shortText(500).optional(),
});

export const publishCareIntelligenceSchema = z.object({ versionId: cuid() });
export const archiveCareIntelligenceSchema = z.object({ versionId: cuid(), reason: shortText(500).optional() });

export const restoreCareIntelligenceSchema = z.object({
  careIntelligenceId: cuid(),
  archivedVersionId: cuid(),
  changeNote: shortText(500).optional(),
});

export const duplicateCareIntelligenceSchema = z.object({
  careIntelligenceId: cuid(),
  sourceVersionId: cuid().optional(),
  changeNote: shortText(500).optional(),
});

export const careIntelligenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  layer: z.enum(knowledgeLayerValues).optional(),
  category: z.string().optional(),
  status: z.enum(careIntelligenceStatusValues).optional(),
});

export const publishedCareIntelligenceQuerySchema = z.object({
  slug: z.string().optional(),
  category: z.string().optional(),
  segment: z.string().optional(),
});
