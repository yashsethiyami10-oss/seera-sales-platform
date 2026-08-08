import type { ExecutionPackage, ExperienceResponse, ReviewPackage } from "./types";

/**
 * MUV AI — Experience Platform (Module 8) Founder/Admin Review Preparation.
 *
 * "Founder/admin review preparation" — computation-only, no persistence
 * (a future admin UI could persist a review decision, out of scope here).
 * Bundles the full, unredacted `DecisionPackage` and `ExecutionPackage`
 * alongside what the customer actually saw (`ExperienceResponse`), so a
 * founder/reviewer can compare "what the system knew and decided" against
 * "what the customer was shown" in one place — the same full-visibility
 * principle every prior module's own Architecture Recommendations section
 * has deferred to the founder.
 */

export function buildReviewPackage(
  sessionId: string,
  executionPackage: ExecutionPackage,
  experienceResponse: ExperienceResponse
): ReviewPackage {
  const flaggedForReview =
    executionPackage.escalation.required ||
    executionPackage.executionStatus === "BLOCKED" ||
    executionPackage.executionStatus === "RESTRICTED" ||
    executionPackage.executionStatus === "NEEDS_HUMAN_REVIEW";

  return {
    sessionId,
    decisionPackage: executionPackage.decisionPackage,
    executionPackage,
    experienceResponse,
    flaggedForReview,
    generatedAt: new Date().toISOString(),
  };
}
