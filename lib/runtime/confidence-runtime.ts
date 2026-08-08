import { evaluateConfidence } from "@/lib/intelligence/confidence-engine";
import type { ConflictResolutionOutcome, RuntimeConfidenceResult, RuntimeKnowledgeResult, SourceAgreement } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Confidence Runtime™.
 *
 * Reuses Module 6's `evaluateConfidence()` (fixed evidence-proportion
 * formula, penalized per missing-information gap) as the base score, then
 * adds two runtime-specific signals that module never had: a grounding
 * score (what fraction of retrieved results actually have real, non-zero
 * deterministic retrieval confidence) and source agreement (derived from
 * Conflict Resolution's actual detected conflicts, not a guess).
 */
export function evaluateRuntimeConfidence(
  retrievedResults: RuntimeKnowledgeResult[],
  evidenceCount: number,
  maxPossibleEvidence: number,
  missingInformation: string[],
  conflicts: ConflictResolutionOutcome
): RuntimeConfidenceResult {
  const base = evaluateConfidence(evidenceCount, maxPossibleEvidence, missingInformation);

  const groundingScore = retrievedResults.length
    ? Math.round((retrievedResults.filter((r) => r.confidence > 0).length / retrievedResults.length) * 100)
    : 0;

  let sourceAgreement: SourceAgreement;
  if (retrievedResults.length === 0) sourceAgreement = "NO_SOURCE";
  else if (retrievedResults.length === 1) sourceAgreement = "SINGLE_SOURCE";
  else sourceAgreement = conflicts.conflictsDetected.length > 0 ? "CONFLICTING" : "AGREEING";

  // Confidence must decrease when sources conflict or nothing was
  // retrieved — never manufacture confidence to compensate.
  let adjustedScore = base.score;
  if (sourceAgreement === "CONFLICTING") adjustedScore = Math.max(0, adjustedScore - 20);
  if (sourceAgreement === "NO_SOURCE") adjustedScore = Math.min(adjustedScore, 20);
  if (groundingScore < 50) adjustedScore = Math.min(adjustedScore, groundingScore);

  const level = adjustedScore >= 70 ? "HIGH" : adjustedScore >= 35 ? "MODERATE" : "LOW";

  return {
    score: adjustedScore,
    level,
    groundingScore,
    sourceAgreement,
    belowThreshold: adjustedScore < 35,
    missingInformation,
  };
}
