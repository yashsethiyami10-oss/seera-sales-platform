import type { ConfidenceEvaluation, ConfidenceLevel } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Confidence Evaluation.
 *
 * Shared by every engine that must report a confidence figure (Decision
 * Engine directly; EQ/CQ compute their own narrower confidence inline,
 * since theirs is about a single classification rather than a synthesis
 * of many inputs — this function is specifically for combining evidence
 * *and* penalizing missing information, which only the Decision stage
 * has enough information to do).
 *
 * "Confidence must decrease when evidence is incomplete. Never
 * manufacture confidence." — the formula is a fixed, published
 * proportion-of-possible-evidence minus a fixed per-gap penalty, never a
 * number chosen to make an answer look more certain than its inputs
 * justify.
 */

const MISSING_INFO_PENALTY = 10;

export function evaluateConfidence(evidenceCount: number, maxPossibleEvidence: number, missingInformation: string[]): ConfidenceEvaluation {
  const base = maxPossibleEvidence > 0 ? (Math.min(evidenceCount, maxPossibleEvidence) / maxPossibleEvidence) * 100 : 0;
  const penalty = missingInformation.length * MISSING_INFO_PENALTY;
  const score = Math.max(0, Math.min(100, Math.round(base - penalty)));
  const level: ConfidenceLevel = score >= 70 ? "HIGH" : score >= 35 ? "MODERATE" : "LOW";

  return { score, level, evidenceCount, missingInformation };
}
