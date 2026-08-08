import { z } from "zod";
import { knowledgeLayerValues } from "@/lib/validations/knowledge";

// MUV AI — Problem Intelligence Foundation (PrIF Engine, Module 3). Reuses
// knowledgeLayerValues from Module 1 for Layer A/B/C, same as Module 2 —
// one source of truth for the permission vocabulary across every module.

export const problemIntelligenceStatusValues = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export const problemRiskLevelValues = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export const problemConfidenceLevelValues = ["LOW", "MODERATE", "HIGH"] as const;
export const problemQuestionAnswerTypeValues = [
  "TEXT", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "NUMBER", "DATE", "SCALE", "IMAGE_REQUIRED",
] as const;
export const problemQuestionAudienceValues = ["CUSTOMER_FACING", "INTERNAL_ONLY"] as const;
export const problemProductSuitabilityValues = ["PRIMARY", "ALTERNATIVE", "CONDITIONAL", "SUPPORTING", "NOT_RECOMMENDED"] as const;

// Enforced server-side in actions/problem-intelligence.ts. DRAFT cannot go
// straight to PUBLISHED — REVIEW is mandatory, same "Human Accountability"/
// "Safety First" reasoning as Module 2. PUBLISHED only ever moves to
// ARCHIVED ("never overwrite published knowledge"; corrections go through
// duplicateProblemIntelligenceDraft / restoreProblemIntelligence instead).
// REVIEW -> DRAFT exists for "send this draft back for changes" — reachable
// via updateProblemIntelligenceDraft (editing a REVIEW-status version
// implicitly returns it to DRAFT, see that action's own comment), not a
// separately named action, since the spec's Server Actions list doesn't
// name one.
export const PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS: Record<(typeof problemIntelligenceStatusValues)[number], string[]> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const cuid = () => z.string().cuid();
const displayOrder = () => z.number().int().min(0).max(10000).default(0);
const shortText = (max: number) => z.string().max(max);
const longText = (max: number) => z.string().max(max);

// ---------------------------------------------------------------------------
// Core item / version
// ---------------------------------------------------------------------------

// Only version-level identity/content fields — child sections (symptoms,
// causes, etc.) are added afterward through their own dedicated actions,
// not created inline here, so a single oversized "create everything at
// once" payload never exists.
const versionContentSchema = z.object({
  publicTitle: shortText(200),
  internalTitle: shortText(200).optional(),
  summary: longText(3000).optional(),
  problemCategory: shortText(120).optional(),
  applicableCategoryIds: z.array(cuid()).max(20).default([]),
  tags: z.array(shortText(60)).max(30).default([]),
  synonyms: z.array(shortText(60)).max(30).default([]),
  searchTerms: z.array(shortText(60)).max(30).default([]),
  customerDescriptions: z.array(shortText(300)).max(30).default([]),
  riskLevel: z.enum(problemRiskLevelValues).default("LOW"),
  escalationRequired: z.boolean().default(false),
  escalationReason: longText(2000).optional(),
  emergencyWarningText: longText(2000).optional(),
  humanReviewRequired: z.boolean().default(false),
  prohibitedRecommendation: z.boolean().default(false),
  requiredDisclaimers: z.array(shortText(500)).max(20).default([]),
  internalHandlingNotes: longText(3000).optional(),
});

export const createProblemIntelligenceSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  layer: z.enum(knowledgeLayerValues),
  content: versionContentSchema,
  changeNote: shortText(500).optional(),
});

export const createProblemIntelligenceVersionSchema = z.object({
  problemIntelligenceId: cuid(),
  content: versionContentSchema,
  changeNote: shortText(500).optional(),
});

export const updateProblemIntelligenceDraftSchema = z.object({
  versionId: cuid(),
  content: versionContentSchema.partial(),
  changeNote: shortText(500).optional(),
});

export const submitProblemIntelligenceForReviewSchema = z.object({ versionId: cuid() });
export const publishProblemIntelligenceSchema = z.object({ versionId: cuid() });
export const archiveProblemIntelligenceSchema = z.object({ versionId: cuid(), reason: shortText(500).optional() });

export const restoreProblemIntelligenceSchema = z.object({
  problemIntelligenceId: cuid(),
  archivedVersionId: cuid(),
  changeNote: shortText(500).optional(),
});

export const duplicateProblemIntelligenceDraftSchema = z.object({
  problemIntelligenceId: cuid(),
  sourceVersionId: cuid().optional(),
  changeNote: shortText(500).optional(),
});

export const changeProblemIntelligenceLayerSchema = z.object({
  problemIntelligenceId: cuid(),
  layer: z.enum(knowledgeLayerValues),
});

export const problemIntelligenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  layer: z.enum(knowledgeLayerValues).optional(),
  status: z.enum(problemIntelligenceStatusValues).optional(),
});

export const publishedProblemIntelligenceQuerySchema = z.object({
  slug: z.string().optional(),
  tag: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Structured child sections
// ---------------------------------------------------------------------------

export const addProblemSymptomSchema = z.object({
  versionId: cuid(),
  title: shortText(200),
  description: longText(2000).optional(),
  severity: z.enum(problemRiskLevelValues).default("LOW"),
  isRequired: z.boolean().default(false),
  displayOrder: displayOrder(),
  customerLanguageVariations: z.array(shortText(200)).max(20).default([]),
  internalNotes: longText(2000).optional(),
});

export const addProblemCauseSchema = z.object({
  versionId: cuid(),
  title: shortText(200),
  explanation: longText(2000).optional(),
  likelihood: z.enum(problemConfidenceLevelValues).default("LOW"),
  evidenceIndicators: z.array(shortText(300)).max(20).default([]),
  confirmingQuestionIds: z.array(cuid()).max(20).default([]),
  internalNotes: longText(2000).optional(),
  displayOrder: displayOrder(),
});

const questionOptionSchema = z.object({
  label: shortText(200),
  value: shortText(200),
  displayOrder: displayOrder(),
});

export const addProblemDiagnosticQuestionSchema = z.object({
  versionId: cuid(),
  questionText: longText(1000),
  purpose: longText(1000).optional(),
  answerType: z.enum(problemQuestionAnswerTypeValues),
  isRequired: z.boolean().default(false),
  validationRules: z.record(z.unknown()).optional(),
  followUpConditions: z.record(z.unknown()).optional(),
  displayOrder: displayOrder(),
  audience: z.enum(problemQuestionAudienceValues).default("INTERNAL_ONLY"),
  options: z.array(questionOptionSchema).max(50).default([]),
}).superRefine((data, ctx) => {
  const needsOptions = data.answerType === "SINGLE_SELECT" || data.answerType === "MULTI_SELECT";
  if (needsOptions && data.options.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${data.answerType} questions require at least one option`, path: ["options"] });
  }
});

export const addProblemCommonMistakeSchema = z.object({
  versionId: cuid(),
  title: shortText(200),
  explanation: longText(2000).optional(),
  consequence: longText(2000).optional(),
  correction: longText(2000).optional(),
  severity: z.enum(problemRiskLevelValues).default("LOW"),
  displayOrder: displayOrder(),
});

export const addProblemProductRelationshipSchema = z.object({
  versionId: cuid(),
  productId: cuid(),
  productIntelligenceId: cuid().optional(),
  suitability: z.enum(problemProductSuitabilityValues),
  reason: longText(2000).optional(),
  conditionsRequired: z.array(shortText(300)).max(20).default([]),
  usageNotes: longText(2000).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  confidence: z.enum(problemConfidenceLevelValues).default("LOW"),
  customerFacingExplanation: longText(2000).optional(),
  internalRationale: longText(2000).optional(),
  // Required only if this relationship conflicts with an existing
  // ExclusionRule for the same product in the same version — enforced in
  // the action, not here, since checking requires a DB lookup. See
  // "No contradictory recommendation and exclusion... without an explicit
  // documented override" in the module spec.
  overrideJustification: longText(1000).optional(),
});

export const addProblemExclusionRuleSchema = z
  .object({
    versionId: cuid(),
    productId: cuid().optional(),
    categoryId: cuid().optional(),
    reason: longText(2000),
    condition: longText(2000).optional(),
    severity: z.enum(problemRiskLevelValues).default("MODERATE"),
    customerFacingWarning: longText(1000).optional(),
    internalNotes: longText(2000).optional(),
    escalationRequired: z.boolean().default(false),
  })
  .refine((data) => !!data.productId || !!data.categoryId, {
    message: "An exclusion rule needs either a productId or a categoryId",
    path: ["productId"],
  });

export const addProblemUsageGuidanceSchema = z.object({
  versionId: cuid(),
  productId: cuid().optional(),
  productIntelligenceId: cuid().optional(),
  stepTitle: shortText(200),
  instructions: longText(3000),
  quantityOrDilution: shortText(300).optional(),
  frequency: shortText(200).optional(),
  duration: shortText(200).optional(),
  expectedTiming: shortText(200).optional(),
  safetyNote: longText(1000).optional(),
  displayOrder: displayOrder(),
});

export const addProblemExpectedOutcomeSchema = z.object({
  versionId: cuid(),
  description: longText(2000),
  expectedTimeframe: shortText(200).optional(),
  conditions: longText(1000).optional(),
  limitations: longText(1000).optional(),
  confidenceLevel: z.enum(problemConfidenceLevelValues).default("LOW"),
  customerFacingWording: longText(2000).optional(),
  internalEvidenceNotes: longText(2000).optional(),
  displayOrder: displayOrder(),
});

export const addProblemPreventionGuidanceSchema = z.object({
  versionId: cuid(),
  title: shortText(200),
  guidance: longText(2000),
  frequency: shortText(200).optional(),
  applicableContext: shortText(300).optional(),
  displayOrder: displayOrder(),
});

export const addProblemSafetyRuleSchema = z.object({
  versionId: cuid(),
  title: shortText(200),
  condition: longText(2000).optional(),
  riskLevel: z.enum(problemRiskLevelValues).default("MODERATE"),
  escalationRequired: z.boolean().default(false),
  disclaimerText: longText(1000).optional(),
  internalNotes: longText(2000).optional(),
  displayOrder: displayOrder(),
});
