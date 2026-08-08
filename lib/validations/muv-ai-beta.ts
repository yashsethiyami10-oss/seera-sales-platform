import { z } from "zod";

// MUV AI Website Integration — Wave 2. Validation for the new,
// Wave-2-owned actions in actions/muv-ai-beta.ts. This file does not
// touch lib/validations/experience.ts (frozen, Module 8) — it defines its
// own schemas for its own new capabilities.

export const submitMuvAiFeedbackSchema = z.object({
  sessionId: z.string().min(1),
  turnReference: z.string().min(1).max(80),
  helpful: z.boolean(),
});

export const requestMuvAiHandoffSchema = z
  .object({
    sessionId: z.string().min(1),
    contactEmail: z.string().email().max(200).optional(),
    contactPhone: z.string().min(6).max(20).optional(),
    message: z.string().max(1000).optional(),
  })
  .refine((data) => !!data.contactEmail || !!data.contactPhone, {
    message: "Provide an email or phone number so we can reach you.",
  });

// Fixed, closed set — "operational events needed for beta evaluation," not
// an open string a caller can use to inject arbitrary event types.
export const muvAiEventTypeValues = [
  "WIDGET_OPENED",
  "SESSION_STARTED",
  "MESSAGE_SUBMITTED",
  "RESPONSE_COMPLETED",
  "RESPONSE_FAILED",
  "RETRY_USED",
  "SUGGESTED_QUESTION_SELECTED",
  "FEEDBACK_SUBMITTED",
  "ESCALATION_OFFERED",
  "HANDOFF_REQUESTED",
  "HANDOFF_COMPLETED",
  "HANDOFF_FAILED",
  "CONVERSATION_RESET",
] as const;

export const logMuvAiEventSchema = z.object({
  type: z.enum(muvAiEventTypeValues),
  sessionId: z.string().max(80).optional(),
  // Structural properties only — never raw message content. Capped small:
  // this is a fixed, closed set of operational counters/labels, not a
  // general-purpose payload.
  properties: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

const executionStatusValues = [
  "EXECUTED", "BLOCKED", "ESCALATED", "DEFERRED",
  "NEEDS_MORE_INFORMATION", "NEEDS_HUMAN_REVIEW", "RESTRICTED",
] as const;

export const getMuvAiTurnDiagnosticsSchema = z.object({
  sessionId: z.string().min(1),
  executionStatus: z.enum(executionStatusValues),
  requiresHandoff: z.boolean(),
  allowFollowUp: z.boolean(),
  segmentKinds: z.array(z.string()).max(50),
  durationMs: z.number().min(0).max(600000),
  generatedAt: z.string(),
});
