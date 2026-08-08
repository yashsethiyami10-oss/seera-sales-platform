import { buildIntelligence } from "@/lib/intelligence/intelligence-orchestrator";
import type { IntelligenceRequest } from "@/lib/intelligence/types";
import { selectCognitiveState } from "./cognitive-state";
import { evaluateVerificationGate } from "./verification-gate";
import { composePersonality } from "./personality";
import type { CognitiveState, PersonalityDirective, VerificationGateResult } from "./types";

export type EiosRuntimeResult = {
  decisionPackage: Awaited<ReturnType<typeof buildIntelligence>>["decisionPackage"];
  cognitiveState: CognitiveState;
  gate: VerificationGateResult;
  personality: PersonalityDirective;
};

/**
 * EIOS Runtime — Sprint 9 single entry point. Runs Module 6's full pipeline
 * once (buildIntelligence — Knowledge Retrieval through Decision Package,
 * unmodified), then layers the three new EIOS decisions on top of its
 * output, in the fixed order the individual modules require (Cognitive
 * State needs cq+confidence; the Verification Gate needs the whole
 * DecisionPackage; Personality needs the selected Cognitive State).
 */
export async function runEiosRuntime(
  request: IntelligenceRequest,
  agent: { name: string; purpose: string; personalityProfile: unknown },
  includeReasoningTrace: boolean
): Promise<EiosRuntimeResult> {
  const { decisionPackage } = await buildIntelligence(request, includeReasoningTrace);
  const cognitiveState = selectCognitiveState(decisionPackage.cqSummary, decisionPackage.confidence);
  const gate = evaluateVerificationGate(decisionPackage);
  const personality = composePersonality(agent, cognitiveState);
  return { decisionPackage, cognitiveState, gate, personality };
}
