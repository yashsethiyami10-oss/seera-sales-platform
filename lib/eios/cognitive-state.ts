import type { CQResult, ConfidenceEvaluation } from "@/lib/intelligence/types";
import type { CognitiveState } from "./types";

/**
 * EIOS Runtime — Cognitive State selection (Sprint 9). Reuses Module 6's
 * already-computed CQResult/ConfidenceEvaluation directly — this is a pure
 * mapping from those existing signals to one named state, not a new
 * scoring engine. Priority order matches CQ's own severity ordering
 * (escalation > trust/emotion > evidence limitation > confusion > default),
 * so exactly one state is ever selected, never a combination.
 */
export function selectCognitiveState(cq: CQResult, confidence: ConfidenceEvaluation): CognitiveState {
  if (cq.escalationNeed) return "ESCALATE_TO_HUMAN";
  if (cq.trustRisk === "URGENT" || cq.trustRisk === "HIGH" || cq.reassuranceNeeded) return "CAUTIOUS_REASSURING";
  if (confidence.level === "LOW") return "TRANSPARENT_LIMITED_EVIDENCE";
  if (cq.educationNeed || cq.transparencyNeeded) return "EDUCATIONAL";
  return "STANDARD";
}
