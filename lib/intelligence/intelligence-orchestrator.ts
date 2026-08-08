import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import { resolveCallerClearance } from "@/lib/retrieval/permissions";
import { evaluatePriority } from "./priority-engine";
import { buildContext } from "./context-engine";
import { resolveMemory } from "./memory-resolver";
import { evaluateEmotion } from "./eq-engine";
import { evaluateCare } from "./cq-engine";
import { buildDecision } from "./decision-engine";
import { explainDecision } from "./explainability";
import { buildDecisionPackage } from "./decision-package";
import type { DecisionPackage, IntelligenceRequest, ReasoningStep, ReasoningTrace } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) orchestrator. Runs the frozen
 * pipeline in the exact required order — Knowledge Retrieval → Priority →
 * Context → Memory → EQ → CQ → Decision → Decision Package — as discrete,
 * commented, sequential steps, the same discipline Module 5's own
 * `runRetrievalPipeline` used for its 8 stages.
 *
 * Knowledge Retrieval is stage one: this reuses Module 5's
 * `runRetrievalPipeline` completely unmodified, rather than querying
 * content models again — the exact "reuse before rewrite" Module 5 itself
 * was built on. The caller's own resolved clearance (via
 * `resolveCallerClearance()`, the same function Module 5 uses) governs
 * what gets retrieved; since every one of this module's Server Actions is
 * `requireStaff()`-gated (see actions/intelligence.ts), that clearance is
 * always at least STAFF, so the Priority/CQ engines below reliably have
 * the internal signals (riskLevel, escalationRequired) they need to
 * reason correctly — this module deliberately does *not* run at
 * anonymous/public clearance the way Module 5's own actions do, since it
 * is internal reasoning infrastructure for a not-yet-built Module 7, not
 * a direct customer-facing surface itself (see architecture.md).
 */
export async function buildIntelligence(request: IntelligenceRequest, includeReasoningTrace: boolean): Promise<{ decisionPackage: DecisionPackage; clearanceLayer: string }> {
  const trace: ReasoningTrace = [];
  const step = (stage: string, summary: string) => trace.push({ stage, summary } satisfies ReasoningStep);

  // Stage: Knowledge Retrieval
  const { results: retrievedKnowledge, clearance } = await runRetrievalPipeline("buildIntelligence", request.retrieval, { resolveRelationshipsForTop: 3 });
  step("knowledge-retrieval", `Retrieved ${retrievedKnowledge.length} knowledge result(s) across requested source types.`);

  // Stage: Priority Engine
  const priority = evaluatePriority(retrievedKnowledge, {
    customerMessage: request.customerMessage,
    customerGoal: request.customerGoal,
    businessContext: request.businessContext ?? null,
    institutionalContext: request.institutionalContext ?? null,
  });
  step("priority", `Priority classified as ${priority.category} (${priority.level}).`);

  // Stage: Context Engine
  const context = buildContext(retrievedKnowledge, {
    conversationContext: request.conversationContext,
    customerGoal: request.customerGoal,
    businessContext: request.businessContext,
    institutionalContext: request.institutionalContext,
    websiteContext: request.websiteContext,
  });
  step("context", `Context assembled: ${context.referencedProducts.length} product ref(s), ${context.referencedProblems.length} problem ref(s), ${context.referencedCareWorkflows.length} care workflow ref(s).`);

  // Stage: Memory Resolver
  const memory = resolveMemory(request.memory, clearance);
  step("memory", `Resolved ${memory.items.length} memory item(s) (${memory.excludedCount} excluded); overall confidence ${memory.overallConfidence}.`);

  // Stage: Emotional Intelligence (EQ)
  const eq = evaluateEmotion(request.customerMessage);
  step("eq", `Emotional signal estimated as ${eq.state} (confidence ${eq.confidenceLevel}).`);

  // Stage: Care Quotient (CQ)
  const cq = evaluateCare(priority, eq, context);
  step("cq", `Required care level ${cq.requiredCareLevel}; escalation need: ${cq.escalationNeed}.`);

  // Stage: Decision Intelligence
  const decision = buildDecision(priority, context, memory, eq, cq);
  step("decision", `Recommended next step: "${decision.recommendedNextStep}" (confidence ${decision.confidenceLevel}).`);

  const explainability = explainDecision(priority, eq, cq, decision, trace);

  // Stage: Decision Package
  const decisionPackage = buildDecisionPackage({
    priority,
    context,
    memory,
    eq,
    cq,
    decision,
    confidence: { score: decision.confidence, level: decision.confidenceLevel, evidenceCount: priority.evidence.length + eq.evidence.length + cq.evidence.length, missingInformation: decision.informationStillNeeded },
    reasoningTrace: trace,
    explainability,
    includeReasoningTrace,
  });

  return { decisionPackage, clearanceLayer: clearance.maxLayer };
}
