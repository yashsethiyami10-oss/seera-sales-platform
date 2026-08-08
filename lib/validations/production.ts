import { z } from "zod";

// MUV AI — Production Readiness & AI Governance (Module 9). Most of this
// module's actions take no caller-supplied input at all (operational
// status queries, matching the module prompt's own literal `functionName()`
// signatures) — only `updateFeatureFlags` genuinely needs one.

export const updateFeatureFlagsSchema = z
  .object({
    EXPERIENCE_PLATFORM: z.boolean().optional(),
    FOUNDER_REVIEW: z.boolean().optional(),
    ANALYTICS: z.boolean().optional(),
    FEEDBACK: z.boolean().optional(),
    FUTURE_CHANNELS: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one feature flag to update." });
