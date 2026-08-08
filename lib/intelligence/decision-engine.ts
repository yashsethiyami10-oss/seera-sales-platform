import type { SourceReference } from "@/lib/retrieval/types";
import { evaluateConfidence } from "./confidence-engine";
import type { CQResult, DecisionResult, EQResult, IntelligenceContext, MemoryResolution, PriorityResult } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Decision Intelligence Engine.
 *
 * "The engine recommends. It never executes." — `recommendedNextStep` is
 * always a short, plain-language *instruction label* for a future
 * Execution Core (Module 7) to act on ("Escalate to human support"), not
 * a message written for the customer to read. Nothing here calls an LLM,
 * assembles a prompt, or drafts a reply.
 */

const MAX_EXPECTED_EVIDENCE = 8;

export function buildDecision(priority: PriorityResult, context: IntelligenceContext, memory: MemoryResolution, eq: EQResult, cq: CQResult): DecisionResult {
  const recommendedKnowledge: SourceReference[] = context.retrievedKnowledge.slice(0, 3).map((r) => ({ type: r.sourceType, id: r.recordId, label: r.title, linkKind: "direct" }));

  const requiredCareWorkflow: SourceReference | null = context.referencedCareWorkflows[0] ?? null;

  const informationStillNeeded: string[] = [];
  if (context.retrievedKnowledge.length === 0) informationStillNeeded.push("No matching knowledge was retrieved — more specific detail from the customer is needed");
  if (!context.customerGoal) informationStillNeeded.push("Customer's specific goal was not provided");
  if (priority.category === "PRODUCT_ISSUE" && context.referencedProducts.length === 0) informationStillNeeded.push("Specific product reference was not identified");
  if (memory.items.length === 0) informationStillNeeded.push("No conversation memory was available for this decision");

  const escalationRequirement = cq.escalationNeed;

  let recommendedNextStep: string;
  if (escalationRequirement) {
    recommendedNextStep = "Escalate to human support";
  } else if (requiredCareWorkflow) {
    recommendedNextStep = `Guide customer through care workflow: ${requiredCareWorkflow.label ?? requiredCareWorkflow.id}`;
  } else if (recommendedKnowledge.length > 0) {
    recommendedNextStep = `Share relevant knowledge: ${recommendedKnowledge[0]!.label ?? recommendedKnowledge[0]!.id}`;
  } else {
    recommendedNextStep = "Ask a clarifying question to gather more information before proceeding";
  }

  const alternativeOptions: string[] = [];
  if (escalationRequirement) {
    alternativeOptions.push("Provide available self-service guidance first, then escalate if unresolved");
  } else {
    alternativeOptions.push("Escalate to human support if the customer indicates dissatisfaction with the recommended step");
  }
  if (recommendedKnowledge.length > 1) {
    alternativeOptions.push(`Alternative knowledge reference: ${recommendedKnowledge[1]!.label ?? recommendedKnowledge[1]!.id}`);
  }
  if (!escalationRequirement && cq.followUpImportance === "HIGH") {
    alternativeOptions.push("Schedule a follow-up regardless of immediate resolution, given high follow-up importance");
  }

  const evidenceCount = priority.evidence.length + eq.evidence.length + cq.evidence.length + context.retrievedKnowledge.length;
  const confidenceEval = evaluateConfidence(evidenceCount, MAX_EXPECTED_EVIDENCE, informationStillNeeded);

  const decisionReason = `Priority=${priority.category}/${priority.level}; EQ=${eq.state} (${eq.confidenceLevel}); CQ requiredCareLevel=${cq.requiredCareLevel}, escalationNeed=${cq.escalationNeed}; ${context.retrievedKnowledge.length} knowledge result(s) retrieved.`;

  return {
    recommendedNextStep,
    recommendedKnowledge,
    requiredCareWorkflow,
    escalationRequirement,
    informationStillNeeded,
    confidence: confidenceEval.score,
    confidenceLevel: confidenceEval.level,
    decisionReason,
    alternativeOptions,
  };
}
