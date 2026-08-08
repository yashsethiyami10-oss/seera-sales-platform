import { z } from "zod";
import { knowledgeSourceTypeValues } from "@/lib/validations/retrieval";
import { executionPackageSchema } from "@/lib/validations/execution";

// MUV AI — Experience Platform (Module 8). Validation for every action's
// input. Reuses executionPackageSchema (Module 7, completed for this
// integration — see lib/validations/execution.ts) and
// knowledgeSourceTypeValues (Module 5) rather than redefining them.

const executionStatusValues = [
  "EXECUTED", "BLOCKED", "ESCALATED", "DEFERRED",
  "NEEDS_MORE_INFORMATION", "NEEDS_HUMAN_REVIEW", "RESTRICTED",
] as const;

const referenceTypeValues = [...knowledgeSourceTypeValues, "PRODUCT"] as const;

export const startSessionSchema = z.object({
  channel: z.string().max(50).optional(),
});

export const closeSessionSchema = z.object({
  sessionId: z.string(),
});

export const orchestrateExperienceSchema = z.object({
  sessionId: z.string(),
  customerMessage: z.string().min(1).max(2000),
  customerGoal: z.string().max(500).optional(),
});

const experienceContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MESSAGE"), text: z.string() }),
  z.object({ type: z.literal("REFERENCE_CARD"), referenceType: z.enum(referenceTypeValues), id: z.string(), label: z.string() }),
  z.object({ type: z.literal("FOLLOW_UP_QUESTION"), question: z.string() }),
  z.object({ type: z.literal("ESCALATION_NOTICE"), message: z.string() }),
]);

export const experienceResponseSchema = z.object({
  sessionId: z.string(),
  blocks: z.array(experienceContentBlockSchema),
  requiresHandoff: z.boolean(),
  allowFollowUp: z.boolean(),
  toneHint: z.array(z.string()),
  executionStatus: z.enum(executionStatusValues),
  generatedAt: z.string(),
});

export const adaptForWebsiteSchema = z.object({
  experienceResponse: experienceResponseSchema,
});

export const prepareHandoffSchema = z.object({
  sessionId: z.string(),
  executionPackage: executionPackageSchema,
});

export const captureFeedbackSchema = z.object({
  sessionId: z.string(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
}).refine((data) => data.rating !== undefined || data.comment !== undefined, {
  message: "Provide a rating, a comment, or both.",
});

export const prepareAnalyticsEventsSchema = z.object({
  sessionId: z.string(),
  executionPackage: executionPackageSchema,
});

export const prepareReviewPackageSchema = z.object({
  sessionId: z.string(),
  executionPackage: executionPackageSchema,
  experienceResponse: experienceResponseSchema,
});
