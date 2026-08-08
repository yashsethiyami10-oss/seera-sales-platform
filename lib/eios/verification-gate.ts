import type { DecisionPackage } from "@/lib/intelligence/types";
import type { VerificationGateResult } from "./types";

/**
 * EIOS Runtime — Self-Verification Gate (Sprint 9). Consumes Module 6's
 * already-assembled DecisionPackage (confidence + cqSummary) — computes no
 * score of its own, only a release decision from scores Module 6 already
 * produced. "Never manufacture confidence" (Module 6's own rule) extends
 * here as "never override confidence to force a PASS."
 *
 * Three outcomes, not two: BLOCK stops release outright (LOW confidence);
 * ESCALATE means the response may still be released but flagged for human
 * follow-up (CQ says escalation is needed, independent of confidence —
 * e.g. a SAFETY-category message can be high-confidence and still require
 * escalation); PASS is the only silent, no-flag outcome.
 */
export function evaluateVerificationGate(decisionPackage: DecisionPackage): VerificationGateResult {
  const { confidence, cqSummary } = decisionPackage;

  if (confidence.level === "LOW") {
    return {
      decision: "BLOCK",
      reason: `Confidence too low to release (score ${confidence.score}, ${confidence.missingInformation.length} gap(s): ${confidence.missingInformation.join("; ") || "unspecified"})`,
      confidenceScore: confidence.score,
      confidenceLevel: confidence.level,
      escalationRecommended: cqSummary.escalationNeed,
    };
  }

  if (cqSummary.escalationNeed) {
    return {
      decision: "ESCALATE",
      reason: cqSummary.reasoning,
      confidenceScore: confidence.score,
      confidenceLevel: confidence.level,
      escalationRecommended: true,
    };
  }

  return {
    decision: "PASS",
    reason: `Confidence sufficient (score ${confidence.score}, level ${confidence.level}); no escalation signal.`,
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    escalationRecommended: false,
  };
}
