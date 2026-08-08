import { z } from "zod";
import { knowledgeSourceTypeValues } from "@/lib/validations/retrieval";

// MUV AI — Intelligence Core (Module 6). Validation for every engine's
// input. Reuses knowledgeSourceTypeValues from Module 5 rather than
// redefining it.

const priorityCategoryValues = [
  "SAFETY", "CUSTOMER_RISK", "BUSINESS_CRITICAL", "CUSTOMER_GOAL", "URGENCY",
  "PRODUCT_ISSUE", "COMPLAINT", "SALES_OPPORTUNITY", "GENERAL_INQUIRY",
] as const;
const intelligenceLevelValues = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const confidenceLevelValues = ["LOW", "MODERATE", "HIGH"] as const;
const emotionalStateValues = [
  "NEUTRAL", "CONFUSED", "FRUSTRATED", "ANGRY", "CONCERNED", "CURIOUS",
  "INTERESTED", "SATISFIED", "POSITIVE", "NEGATIVE", "UNKNOWN",
] as const;
const memoryItemTypeValues = ["CONVERSATION", "SESSION", "PERSISTENT"] as const;
const permissionLayerValues = ["PUBLIC", "INTERNAL", "CONFIDENTIAL"] as const;

// Several of the schemas below are exported (not just kept local) so that
// lib/validations/execution.ts (Module 7) can validate a caller-supplied
// DecisionPackage without redefining these shapes a second time — an
// additive, non-behavioral visibility change, not a redesign of Module 6.
export const sourceReferenceSchema = z.object({
  type: z.enum([...knowledgeSourceTypeValues, "PRODUCT"]),
  id: z.string(),
  label: z.string().optional(),
  linkKind: z.enum(["direct", "via-product"]),
});

export const retrievalResultSchema = z.object({
  sourceType: z.enum(knowledgeSourceTypeValues),
  recordId: z.string(),
  versionId: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  layer: z.enum(permissionLayerValues),
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

const retrievalContextSchema = z.object({
  knowledgeId: z.string().cuid().optional(),
  slug: z.string().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  category: z.string().optional(),
  productId: z.string().cuid().optional(),
  problemIntelligenceId: z.string().cuid().optional(),
  careIntelligenceId: z.string().cuid().optional(),
  sourceTypes: z.array(z.enum(knowledgeSourceTypeValues)).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const memoryItemSchema = z.object({
  id: z.string(),
  type: z.enum(memoryItemTypeValues),
  content: z.string().max(5000),
  layer: z.enum(permissionLayerValues),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  confidence: z.enum(confidenceLevelValues).optional(),
});

export const intelligenceRequestSchema = z.object({
  retrieval: retrievalContextSchema,
  customerMessage: z.string().max(5000).optional(),
  customerGoal: z.string().max(500).optional(),
  conversationContext: z.string().max(5000).optional(),
  businessContext: z.record(z.unknown()).optional(),
  institutionalContext: z.record(z.unknown()).optional(),
  websiteContext: z.record(z.unknown()).optional(),
  memory: z.array(memoryItemSchema).max(100).optional(),
});

export const buildIntelligenceSchema = intelligenceRequestSchema;

export const evaluatePrioritySchema = z.object({
  retrievedKnowledge: z.array(retrievalResultSchema).max(200),
  customerMessage: z.string().max(5000).optional(),
  customerGoal: z.string().max(500).optional(),
  businessContext: z.record(z.unknown()).optional(),
  institutionalContext: z.record(z.unknown()).optional(),
});

export const buildContextSchema = z.object({
  retrievedKnowledge: z.array(retrievalResultSchema).max(200),
  conversationContext: z.string().max(5000).optional(),
  customerGoal: z.string().max(500).optional(),
  businessContext: z.record(z.unknown()).optional(),
  institutionalContext: z.record(z.unknown()).optional(),
  websiteContext: z.record(z.unknown()).optional(),
});

export const resolveMemorySchema = z.object({
  memory: z.array(memoryItemSchema).max(100).optional(),
});

export const evaluateEmotionSchema = z.object({
  customerMessage: z.string().max(5000).optional(),
});

export const priorityResultSchema = z.object({
  category: z.enum(priorityCategoryValues),
  level: z.enum(intelligenceLevelValues),
  score: z.number(),
  evidence: z.array(z.string()),
  reasoning: z.string(),
});

export const eqResultSchema = z.object({
  state: z.enum(emotionalStateValues),
  confidence: z.number(),
  confidenceLevel: z.enum(confidenceLevelValues),
  evidence: z.array(z.string()),
  reasoning: z.string(),
});

export const cqResultSchema = z.object({
  requiredCareLevel: z.enum(intelligenceLevelValues),
  reassuranceNeeded: z.boolean(),
  transparencyNeeded: z.boolean(),
  escalationNeed: z.boolean(),
  empathyLevel: z.enum(intelligenceLevelValues),
  followUpImportance: z.enum(intelligenceLevelValues),
  educationNeed: z.boolean(),
  supportPriority: z.enum(intelligenceLevelValues),
  trustRisk: z.enum(intelligenceLevelValues),
  customerEffort: z.enum(intelligenceLevelValues),
  reasoning: z.string(),
  evidence: z.array(z.string()),
});

export const intelligenceContextSchema = z.object({
  conversationContext: z.string().nullable(),
  customerGoal: z.string().nullable(),
  retrievedKnowledge: z.array(retrievalResultSchema),
  referencedProducts: z.array(sourceReferenceSchema),
  referencedProblems: z.array(sourceReferenceSchema),
  referencedCareWorkflows: z.array(sourceReferenceSchema),
  businessContext: z.record(z.unknown()).nullable(),
  institutionalContext: z.record(z.unknown()).nullable(),
  websiteContext: z.record(z.unknown()).nullable(),
});

export const memoryResolutionSchema = z.object({
  items: z.array(memoryItemSchema),
  excludedCount: z.number(),
  excludedReasons: z.array(z.string()),
  overallConfidence: z.enum(confidenceLevelValues),
});

export const evaluateCareSchema = z.object({
  priority: priorityResultSchema,
  eq: eqResultSchema,
  context: intelligenceContextSchema,
});

export const buildDecisionSchema = z.object({
  priority: priorityResultSchema,
  context: intelligenceContextSchema,
  memory: memoryResolutionSchema,
  eq: eqResultSchema,
  cq: cqResultSchema,
});

export const decisionResultSchema = z.object({
  recommendedNextStep: z.string(),
  recommendedKnowledge: z.array(sourceReferenceSchema),
  requiredCareWorkflow: sourceReferenceSchema.nullable(),
  escalationRequirement: z.boolean(),
  informationStillNeeded: z.array(z.string()),
  confidence: z.number(),
  confidenceLevel: z.enum(confidenceLevelValues),
  decisionReason: z.string(),
  alternativeOptions: z.array(z.string()),
});

export const reasoningTraceSchema = z.array(z.object({ stage: z.string(), summary: z.string() }));

export const buildDecisionPackageSchema = z.object({
  priority: priorityResultSchema,
  context: intelligenceContextSchema,
  memory: memoryResolutionSchema,
  eq: eqResultSchema,
  cq: cqResultSchema,
  decision: decisionResultSchema,
  reasoningTrace: reasoningTraceSchema,
});

export const evaluateConfidenceSchema = z.object({
  evidenceCount: z.number().int().min(0),
  maxPossibleEvidence: z.number().int().min(0),
  missingInformation: z.array(z.string()).max(50),
});

export const explainDecisionSchema = z.object({
  priority: priorityResultSchema,
  eq: eqResultSchema,
  cq: cqResultSchema,
  decision: decisionResultSchema,
  reasoningTrace: reasoningTraceSchema,
});

// ---------------------------------------------------------------------------
// Decision Package — added when Module 7 (Execution Core) needed to accept
// a whole DecisionPackage as Server Action input. Module 6 itself never
// needed this as an input schema (only as an internally-assembled output),
// so it did not exist until now; added here since it validates a Module 6
// type, not a Module 7 one. No existing schema or behavior was changed.
// ---------------------------------------------------------------------------

export const confidenceEvaluationSchema = z.object({
  score: z.number(),
  level: z.enum(confidenceLevelValues),
  evidenceCount: z.number(),
  missingInformation: z.array(z.string()),
});

export const explainabilityMetadataSchema = z.object({
  why: z.string(),
  evidence: z.array(z.string()),
  missingInformation: z.array(z.string()),
  contributingModules: z.array(z.string()),
});

export const decisionPackageSchema = z.object({
  priority: priorityResultSchema,
  context: intelligenceContextSchema,
  memorySummary: z.object({ itemCount: z.number(), overallConfidence: z.enum(confidenceLevelValues) }),
  eqSummary: eqResultSchema,
  cqSummary: cqResultSchema,
  decision: decisionResultSchema,
  confidence: confidenceEvaluationSchema,
  reasoningTrace: reasoningTraceSchema.nullable(),
  knowledgeReferences: z.array(sourceReferenceSchema),
  careReferences: z.array(sourceReferenceSchema),
  problemReferences: z.array(sourceReferenceSchema),
  productReferences: z.array(sourceReferenceSchema),
  outstandingQuestions: z.array(z.string()),
  requiredInformation: z.array(z.string()),
  escalationRecommendation: z.boolean(),
  explainability: explainabilityMetadataSchema,
  executionHints: z.record(z.unknown()),
  generatedAt: z.string(),
});
