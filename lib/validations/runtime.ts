import { z } from "zod";
import { knowledgeSourceTypeValues, versionSelectorSchema } from "@/lib/validations/retrieval";

// MUV AI — Stage 6C Runtime Engineering. Validation for the single new
// internal entry point (actions/runtime.ts's `runRuntimeTurn`). Reuses
// Module 5's knowledgeSourceTypeValues/versionSelectorSchema rather than
// redefining them, same discipline every prior module's validation file
// followed.

const cuid = () => z.string().cuid();

const memoryItemSchema = z.object({
  id: z.string(),
  type: z.enum(["CONVERSATION", "SESSION", "PERSISTENT"]),
  content: z.string().max(5000),
  layer: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  confidence: z.enum(["LOW", "MODERATE", "HIGH"]).optional(),
});

const retrievalPartialSchema = z.object({
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
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const runtimeTurnInputSchema = z.object({
  turnId: z.string().min(1).max(100),
  sessionId: z.string().max(100).optional(),
  customerMessage: z.string().min(1).max(5000),
  customerGoal: z.string().max(500).optional(),
  conversationContext: z.string().max(5000).optional(),
  language: z.enum(["EN", "HI", "HINGLISH"]).optional(),
  businessContext: z.record(z.unknown()).optional(),
  institutionalContext: z.record(z.unknown()).optional(),
  websiteContext: z.record(z.unknown()).optional(),
  liveOperationalData: z.record(z.unknown()).optional(),
  memory: z.array(memoryItemSchema).max(100).optional(),
  retrieval: retrievalPartialSchema.optional(),
  clearanceLayer: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]).optional(),
});
