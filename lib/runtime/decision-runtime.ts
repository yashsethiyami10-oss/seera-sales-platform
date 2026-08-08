import type { DecisionResult } from "@/lib/intelligence/types";
import type { FounderReasoningResult, RuntimeDecisionResult } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Decision Runtime™.
 *
 * A thin, deliberately simple merge of Module 6's `DecisionResult` (the
 * deterministic evidence-based recommendation) with the Founder Reasoning
 * Runtime's advisory synthesis — the "Decision and Conflict Resolution"
 * stage named in FD-AIC-001's pipeline order. Conflict resolution itself
 * lives in `conflict-resolution-runtime.ts`; this module only decides
 * whether a human must approve before anything derived from `decision`
 * reaches the customer.
 */
export function runDecisionRuntime(decision: DecisionResult, founderReasoning: FounderReasoningResult): RuntimeDecisionResult {
  const requiresHumanApproval = founderReasoning.escalationTrigger || decision.escalationRequirement;

  return {
    decision,
    founderReasoning,
    finalRecommendation: founderReasoning.recommendedDecision,
    requiresHumanApproval,
  };
}
