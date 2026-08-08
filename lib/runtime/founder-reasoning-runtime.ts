import type { CQResult, DecisionResult, EQResult, PriorityResult } from "@/lib/intelligence/types";
import { getActiveFounderDecisions, findApplicableFounderDecisions } from "./founder-decision-registry";
import type { FounderReasoningResult, IntentResult, RuntimeContext } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Founder Reasoning Runtime™.
 *
 * Resolves CF-04 from ENGINEERING_TEST_REPORT.md: "must operationalize the
 * Founder Constitution/Pipeline/reasoning KOs, not rely only on the old
 * fixed Priority/EQ/CQ tables." This module does not discard Module 6's
 * Priority/EQ/CQ/Decision engines (they remain the deterministic evidence
 * base) — it adds a synthesis layer on top that: (a) always surfaces the
 * Founder Decision Registry entries that govern the reasoning *process*
 * itself (FD-AIC-001/002/003/004 — currently the only entries, all
 * AI-governance decisions, not customer-content decisions), (b) looks up
 * any content-specific Founder Decision matching the request's domains,
 * and (c) composes the required advisory fields (options, trade-offs,
 * risks, customer/business/long-term impact) from the real Priority/EQ/CQ
 * evidence rather than a static lookup table.
 *
 * STAGE 6D UPDATE: the Founder Constitution (13 Articles) and the 10
 * Founder Intelligence Engines are now real-indexed from
 * `docs/founder-intelligence-knowledge-factory/` via
 * `knowledge-factory-loader.ts`/`knowledge-factory-retrieval.ts`, and
 * whatever real Constitution Articles / Engine KOs the Semantic Retrieval
 * Engine actually matched for this request (in `context.semanticRetrieval
 * .results`) are surfaced below in `principlesApplied`, clearly labeled
 * and never treated as fact-arbitration authority (see
 * `conflict-resolution-runtime.ts`'s dedicated exclusion). This module
 * still never cites a Constitution Article or Engine KO that retrieval did
 * not actually return this turn — "principles applied" is scoped to what
 * was actually retrieved, never a fabricated citation of the full 13/10 set.
 *
 * "Must remain advisory where human approval required" — `advisoryOnly` is
 * hardcoded `true`; nothing in this module or its caller acts on
 * `recommendedDecision` automatically.
 */
export async function runFounderReasoning(
  priority: PriorityResult,
  eq: EQResult,
  cq: CQResult,
  decision: DecisionResult,
  context: RuntimeContext,
  intent: IntentResult
): Promise<FounderReasoningResult> {
  const governingDecisions = await getActiveFounderDecisions();
  const domainKeywords = intent.domains.map((d) => d.toLowerCase().replace(/_/g, " "));
  const contentDecisions = await findApplicableFounderDecisions(domainKeywords);

  const applicable = [...new Map([...governingDecisions, ...contentDecisions].map((d) => [d.decisionId, d])).values()];

  const factsRetrieved = context.semanticRetrieval.results.slice(0, 10).map((r) => `[${r.sourceType}] ${r.title}${r.summary ? ` — ${r.summary}` : ""}`);

  // Stage 6D — real Founder Constitution/Engine content actually matched
  // by retrieval this turn (never the full 13/10 set regardless of what
  // was asked). Labeled "guides reasoning only" per FD-AIC-002's own
  // clarifying nuance; conflict-resolution-runtime.ts enforces the same
  // rule structurally so this label is descriptive, not the only guard.
  const founderIntelligenceKOs = context.semanticRetrieval.results.filter(
    (r) => (r.internalMetadata as Record<string, unknown> | null)?.["koFactoryDomain"] === "FOUNDER_INTELLIGENCE_KF"
  );

  const principlesApplied = [
    ...applicable.map((d) => `${d.decisionId}: ${d.title}`),
    ...founderIntelligenceKOs.map((r) => `${r.recordId}: ${r.title} (Founder Intelligence — guides reasoning only, never overwrites verified domain facts)`),
  ];

  const options: string[] = [decision.recommendedNextStep, ...decision.alternativeOptions];

  const tradeOffs: string[] = [];
  if (cq.escalationNeed) tradeOffs.push("Escalating now increases response time but reduces risk of an unresolved safety/trust issue.");
  if (decision.informationStillNeeded.length) tradeOffs.push(`Answering immediately risks incompleteness — missing: ${decision.informationStillNeeded.join(", ")}.`);
  if (context.semanticRetrieval.fellBackToDeterministic) tradeOffs.push("Retrieval fell back to the deterministic keyword/tag path — broader domain matching may have missed relevant knowledge.");

  const risks: string[] = [];
  if (priority.category === "SAFETY" || intent.safetySensitive) risks.push("Safety-sensitive topic — an incorrect or ungrounded answer could cause real customer harm.");
  if (intent.isComplaint) risks.push("Complaint context — mishandling risks trust/brand damage beyond this single interaction.");
  if (context.semanticRetrieval.results.length === 0) risks.push("No repository knowledge was retrieved — any generated response risks being unsupported.");
  // Stage 8 — the Customer Care Knowledge Factory introduced real,
  // proportionally frequent Gap Records (Returns/Replacement/Refund/
  // Warranty/Escalation Matrix/Customer Happiness — 6 of its 22 KOs).
  // Retrieving one is not a retrieval failure (it's real, honest content:
  // "this is a documented gap") but it must never be presented with the
  // same confidence as a real policy answer — flagged here so downstream
  // reasoning and response assembly both see it.
  const gapRecordResults = context.semanticRetrieval.results.filter((r) => (r.internalMetadata as Record<string, unknown> | null)?.["isGapRecord"] === true);
  if (gapRecordResults.length > 0) {
    risks.push(`Retrieved evidence includes ${gapRecordResults.length} unresolved Founder Decision Required gap record(s) (${gapRecordResults.map((r) => r.recordId).join(", ")}) — must never be presented as a definitive policy answer.`);
  }

  const customerImpact = cq.escalationNeed
    ? "High — customer needs reassurance and a clear path to human support."
    : intent.isComplaint
      ? "Moderate to high — customer trust is at stake; tone and resolution speed matter."
      : "Standard — customer is seeking information, not in a heightened emotional state.";

  const businessImpact = priority.category === "BUSINESS_CRITICAL" || priority.category === "SALES_OPPORTUNITY"
    ? "Meaningful — this interaction affects a commercial outcome (sale, retention, or institutional relationship)."
    : "Limited direct business impact beyond standard customer service quality.";

  const longTermImpact = intent.domains.includes("FOUNDER_INTELLIGENCE") || intent.domains.includes("INSTITUTIONAL_SALES")
    ? "Sets precedent for how similar strategic/institutional requests are handled — worth Founder visibility if repeated."
    : "Routine — unlikely to set precedent beyond this interaction.";

  // Stage 8 — if every real result retrieved for this turn is a Gap
  // Record (nothing else was found at all), the honest answer has no
  // useful content in it — escalate to a human rather than hand the
  // customer a "this isn't documented yet" non-answer with no next step.
  const gapRecordOnly = gapRecordResults.length > 0 && gapRecordResults.length === context.semanticRetrieval.results.length;
  const escalationTrigger = cq.escalationNeed || intent.requiresEscalation || (intent.safetySensitive && decision.confidenceLevel === "LOW") || gapRecordOnly;

  const recommendedDecision = escalationTrigger
    ? `Escalate: ${decision.recommendedNextStep}. Do not let the AI resolve this alone.`
    : decision.recommendedNextStep;

  return {
    factsRetrieved,
    principlesApplied,
    options,
    tradeOffs,
    risks,
    customerImpact,
    businessImpact,
    longTermImpact,
    recommendedDecision,
    confidence: decision.confidenceLevel,
    escalationTrigger,
    advisoryOnly: true,
    applicableFounderDecisions: applicable.map((d) => d.decisionId),
    reasoning: `Synthesized from Priority (${priority.category}/${priority.level}), EQ (${eq.state}), CQ (care level ${cq.requiredCareLevel}), and Decision (confidence ${decision.confidenceLevel}) evidence, plus ${applicable.length} applicable Founder Decision Registry entr${applicable.length === 1 ? "y" : "ies"}.`,
  };
}
