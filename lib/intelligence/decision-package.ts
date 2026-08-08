import type {
  ConfidenceEvaluation, CQResult, DecisionPackage, DecisionResult, EQResult,
  ExplainabilityMetadata, IntelligenceContext, MemoryResolution, PriorityResult, ReasoningTrace,
} from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Decision Package Builder.
 *
 * Pure assembly — every field here was already computed by an earlier
 * engine; this file combines them into the one structured object Module 7
 * consumes. No new computation happens here.
 *
 * "Never expose internal reasoning" — `reasoningTrace` is only populated
 * when `includeReasoningTrace` is true (the caller is staff+, decided by
 * the calling action, never by this function reading a session itself —
 * see actions/intelligence.ts).
 */

export function buildDecisionPackage(params: {
  priority: PriorityResult;
  context: IntelligenceContext;
  memory: MemoryResolution;
  eq: EQResult;
  cq: CQResult;
  decision: DecisionResult;
  confidence: ConfidenceEvaluation;
  reasoningTrace: ReasoningTrace;
  explainability: ExplainabilityMetadata;
  includeReasoningTrace: boolean;
}): DecisionPackage {
  const { priority, context, memory, eq, cq, decision, confidence, reasoningTrace, explainability, includeReasoningTrace } = params;

  const executionHints: Record<string, unknown> = {
    suggestedAction: decision.escalationRequirement ? "ESCALATE" : decision.requiredCareWorkflow ? "GUIDE_CARE_WORKFLOW" : decision.recommendedKnowledge.length > 0 ? "SHARE_KNOWLEDGE" : "ASK_CLARIFYING_QUESTION",
    targetCareWorkflowId: decision.requiredCareWorkflow?.id ?? null,
    targetKnowledgeIds: decision.recommendedKnowledge.map((k) => k.id),
    priorityLevel: priority.level,
    requiredCareLevel: cq.requiredCareLevel,
  };

  return {
    priority,
    context,
    memorySummary: { itemCount: memory.items.length, overallConfidence: memory.overallConfidence },
    eqSummary: eq,
    cqSummary: cq,
    decision,
    confidence,
    reasoningTrace: includeReasoningTrace ? reasoningTrace : null,
    knowledgeReferences: context.retrievedKnowledge.filter((r) => r.sourceType === "KNOWLEDGE").map((r) => ({ type: r.sourceType, id: r.recordId, label: r.title, linkKind: "direct" as const })),
    careReferences: context.referencedCareWorkflows,
    problemReferences: context.referencedProblems,
    productReferences: context.referencedProducts,
    outstandingQuestions: decision.informationStillNeeded,
    requiredInformation: decision.informationStillNeeded,
    escalationRecommendation: decision.escalationRequirement,
    explainability,
    executionHints,
    generatedAt: new Date().toISOString(),
  };
}
