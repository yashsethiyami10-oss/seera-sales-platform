import type { CQResult, DecisionResult, EQResult, ExplainabilityMetadata, PriorityResult, ReasoningTrace } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Explainability.
 *
 * "No black-box decisions." Answers the four required questions directly
 * from the already-computed stage outputs — nothing here re-derives or
 * guesses; it summarizes what the pipeline already knows about itself.
 */

export function explainDecision(priority: PriorityResult, eq: EQResult, cq: CQResult, decision: DecisionResult, trace: ReasoningTrace): ExplainabilityMetadata {
  const contributingModules: string[] = ["Priority Engine", "Context Engine"];
  if (eq.state !== "UNKNOWN") contributingModules.push("EQ Engine");
  contributingModules.push("CQ Engine", "Decision Intelligence Engine");
  if (decision.recommendedKnowledge.length > 0) contributingModules.push("Knowledge Retrieval Core (Module 5)");

  const evidence = [...priority.evidence.map((e) => `Priority: ${e}`), ...eq.evidence.map((e) => `EQ: ${e}`), ...cq.evidence.map((e) => `CQ: ${e}`)];

  const why =
    `Recommended "${decision.recommendedNextStep}" because priority was classified as ${priority.category} ` +
    `(${priority.level}), the customer's estimated communication state was ${eq.state}, and the Care Quotient ` +
    `evaluation ${cq.escalationNeed ? "flagged an escalation need" : "did not flag an escalation need"}. ` +
    `${trace.length} reasoning step(s) were recorded for this decision.`;

  return {
    why,
    evidence,
    missingInformation: decision.informationStillNeeded,
    contributingModules,
  };
}
