import { z } from "zod";
import { decisionPackageSchema, sourceReferenceSchema } from "@/lib/validations/intelligence";

// MUV AI — Execution Core (Module 7). Validation for every engine's input.
// Reuses decisionPackageSchema/sourceReferenceSchema from Module 6 rather
// than redefining them (see lib/validations/intelligence.ts's added-export
// note).

const permissionLayerValues = ["PUBLIC", "INTERNAL", "CONFIDENTIAL"] as const;
const safetyOutcomeValues = [
  "APPROVED", "BLOCKED", "NEEDS_HUMAN_REVIEW", "NEEDS_MORE_INFORMATION",
  "RESTRICTED", "ESCALATED", "DEFERRED", "UNKNOWN",
] as const;
const policyCheckAreaValues = [
  "COMPANY_POLICY", "CARE_POLICY", "KNOWLEDGE_POLICY", "PERMISSION_LAYER",
  "BUSINESS_RULES", "RESPONSE_RULES", "SAFETY_RULES",
] as const;
const escalationTargetValues = [
  "NONE", "CUSTOMER_SUPPORT", "TECHNICAL_TEAM", "SALES_TEAM",
  "INSTITUTIONAL_SALES", "FOUNDER_REVIEW", "SAFETY_REVIEW", "FUTURE_TEAM",
] as const;
const actionTypeValues = [
  "ANSWER_CUSTOMER", "ASK_FOLLOW_UP_QUESTION", "RECOMMEND_PRODUCT",
  "RECOMMEND_CARE_WORKFLOW", "RECOMMEND_KNOWLEDGE", "ESCALATE",
  "STOP_EXECUTION", "COLLECT_INFORMATION", "WAIT", "DECLINE_CONFIDENTIAL",
] as const;
const confidenceLevelValues = ["LOW", "MODERATE", "HIGH"] as const;
const executionStatusValues = [
  "EXECUTED", "BLOCKED", "ESCALATED", "DEFERRED",
  "NEEDS_MORE_INFORMATION", "NEEDS_HUMAN_REVIEW", "RESTRICTED",
] as const;

export const executionInputSchema = z.object({
  decisionPackage: decisionPackageSchema,
  clearanceLayer: z.enum(permissionLayerValues).optional(),
});

export const validateSafetySchema = executionInputSchema;

export const safetyResultSchema = z.object({
  outcome: z.enum(safetyOutcomeValues),
  policyCompliant: z.boolean(),
  confidenceThresholdMet: z.boolean(),
  missingInformationBlocking: z.boolean(),
  restrictedActionDetected: z.boolean(),
  permissionLayerOk: z.boolean(),
  escalationRequired: z.boolean(),
  humanReviewRequired: z.boolean(),
  customerSafetyOk: z.boolean(),
  businessSafetyOk: z.boolean(),
  truthfulnessOk: z.boolean(),
  transparencyOk: z.boolean(),
  reasons: z.array(z.string()),
  reasoning: z.string(),
});

export const validatePolicySchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  clearanceLayer: z.enum(permissionLayerValues).optional(),
});

const policyCheckSchema = z.object({ area: z.enum(policyCheckAreaValues), passed: z.boolean(), reason: z.string() });

export const policyResultSchema = z.object({
  compliant: z.boolean(),
  checks: z.array(policyCheckSchema),
  violations: z.array(z.string()),
  reasoning: z.string(),
});

export const resolveEscalationSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
});

export const escalationResultSchema = z.object({
  target: z.enum(escalationTargetValues),
  required: z.boolean(),
  reason: z.string(),
  triggeredBy: z.array(z.string()),
});

export const buildActionSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
  escalation: escalationResultSchema,
});

export const actionResultSchema = z.object({
  action: z.enum(actionTypeValues),
  targetReferences: z.array(sourceReferenceSchema),
  reason: z.string(),
  confidence: z.enum(confidenceLevelValues),
});

export const composeResponseBlueprintSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
  escalation: escalationResultSchema,
  action: actionResultSchema,
});

export const responseBlueprintSchema = z.object({
  intent: z.string(),
  toneGuidance: z.array(z.string()),
  requiredInformation: z.array(z.string()),
  knowledgeReferences: z.array(sourceReferenceSchema),
  careReferences: z.array(sourceReferenceSchema),
  suggestedStructure: z.array(z.string()),
  restrictions: z.array(z.string()),
  transparencyRequirements: z.array(z.string()),
  escalationNotice: z.string().nullable(),
  safetyNotes: z.array(z.string()),
});

export const buildExecutionPackageSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
  escalation: escalationResultSchema,
  action: actionResultSchema,
  clearanceLayer: z.enum(permissionLayerValues).optional(),
});

export const executePipelineSchema = executionInputSchema;

// The three schemas below (auditMetadataSchema, executionExplainabilitySchema,
// and the completed executionPackageSchema) were added/completed for Module
// 8 integration — Module 7's own 8 actions never needed a full
// ExecutionPackage as *input* (only as output), so this schema was
// originally left incomplete (missing executionMetadata/audit/
// explainability/executionHints/generatedAt) since nothing exercised it.
// Module 8's staff-facing prep actions (prepareHandoff/
// prepareAnalyticsEvents/prepareReviewPackage) DO need to validate a
// caller-supplied ExecutionPackage, so this is completed here — additive
// only, no existing field's validation changed, per the Module 8 prompt's
// explicit "strictly additive exports required for Module 8 integration"
// exception to "do not redesign or modify frozen modules."
export const auditMetadataSchema = z.object({
  executionTime: z.string(),
  pipelineStages: z.array(z.string()),
  policyChecks: z.number(),
  safetyChecks: z.number(),
  versionReferences: z.array(z.string()),
  decisionReferences: z.array(z.string()),
  moduleReferences: z.array(z.string()),
  timestamp: z.string(),
  actor: z.string(),
});

export const executionExplainabilitySchema = z.object({
  whyExecuted: z.string().nullable(),
  whyBlocked: z.string().nullable(),
  whyEscalated: z.string().nullable(),
  policyTriggered: z.array(z.string()),
  safetyRuleTriggered: z.array(z.string()),
  contributingModules: z.array(z.string()),
});

export const executionPackageSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
  escalation: escalationResultSchema,
  action: actionResultSchema,
  responseBlueprint: responseBlueprintSchema,
  executionStatus: z.enum(executionStatusValues),
  executionConfidence: z.enum(confidenceLevelValues),
  executionMetadata: z.object({ clearanceLayer: z.enum(permissionLayerValues) }),
  audit: auditMetadataSchema,
  explainability: executionExplainabilitySchema,
  executionHints: z.record(z.unknown()),
  generatedAt: z.string(),
});

export const explainExecutionSchema = z.object({
  decisionPackage: decisionPackageSchema,
  safety: safetyResultSchema,
  policy: policyResultSchema,
  escalation: escalationResultSchema,
  action: actionResultSchema,
});
