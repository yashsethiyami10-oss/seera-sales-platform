import type { DecisionPackage } from "@/lib/intelligence/types";
import type { EscalationResult, EscalationTarget, PolicyResult, SafetyResult } from "./types";

/**
 * MUV AI — Execution Core (Module 7) Escalation Resolver.
 *
 * "Determine whether execution should escalate... Support structured
 * metadata only." Fixed, first-match-wins cascade over the 8 named
 * targets — mirrors the Priority Engine's (Module 6) cascade discipline.
 * Escalation Resolver does not decide *what* happens after escalation
 * (that's the Action Engine, next stage); it only decides *whether* and
 * *to whom*.
 */

export function resolveEscalation(decisionPackage: DecisionPackage, safety: SafetyResult, policy: PolicyResult): EscalationResult {
  const triggeredBy: string[] = [];
  if (safety.outcome !== "APPROVED") triggeredBy.push(`safety outcome: ${safety.outcome}`);
  if (!policy.compliant) triggeredBy.push(`policy violations: ${policy.violations.join(", ")}`);
  if (decisionPackage.cqSummary.escalationNeed) triggeredBy.push("Care Quotient escalation need");
  if (decisionPackage.escalationRecommendation) triggeredBy.push("Decision Package escalation recommendation");

  const target = deriveTarget(decisionPackage, safety);
  const required = target !== "NONE";

  const reason = required
    ? `Escalation routed to ${target} based on ${triggeredBy.length > 0 ? triggeredBy.join("; ") : "priority classification"}.`
    : "No escalation signal was found — safety approved, no outstanding policy violation, no Care Quotient or Decision escalation need.";

  return { target, required, reason, triggeredBy };
}

function deriveTarget(decisionPackage: DecisionPackage, safety: SafetyResult): EscalationTarget {
  if (decisionPackage.priority.category === "SAFETY") return "SAFETY_REVIEW";
  if (safety.outcome === "NEEDS_HUMAN_REVIEW") return "FOUNDER_REVIEW";
  if (decisionPackage.priority.category === "BUSINESS_CRITICAL") {
    return decisionPackage.context.institutionalContext ? "INSTITUTIONAL_SALES" : "FOUNDER_REVIEW";
  }
  if (decisionPackage.priority.category === "SALES_OPPORTUNITY") return "SALES_TEAM";
  if (decisionPackage.priority.category === "PRODUCT_ISSUE") {
    // Founder Publishing Review — Runtime Answer-Delivery Correction, Issue 1.
    // "PRODUCT_ISSUE" here does not mean an actual reported issue — Priority
    // Engine (Module 6) assigns it to ANY turn anchored to retrieved product/
    // problem intelligence (see priority-engine.ts's `hasProductOrProblem`),
    // which is the ordinary case for an everyday "tell me about X" question.
    // Escalating every one of those unconditionally meant a successful,
    // fully-approved, well-evidenced retrieval could never reach a customer
    // as an answer. Every case that should still force human escalation
    // already does, and is untouched by this carve-out: SAFETY and
    // BUSINESS_CRITICAL are checked above and return first; NEEDS_HUMAN_REVIEW
    // is checked above; `safety.outcome === "APPROVED"` below is only ever
    // true when Safety Engine's own escalationRequired flag (Care
    // Quotient/Decision escalation need) is false and every one of its 11
    // dimensions is clean (see safety-engine.ts's deriveOutcome) — so a
    // conflicting/unsafe/low-confidence/policy-violating turn can never take
    // this branch. An unresolved source conflict never reaches this point at
    // all, by construction: population never creates a ProductIntelligence
    // row for a conflicted product (see the Founder Validation Manifest).
    const hasConcreteReferences = decisionPackage.productReferences.length > 0 || decisionPackage.knowledgeReferences.length > 0;
    const answerableWithoutEscalation = safety.outcome === "APPROVED" && decisionPackage.confidence.level === "HIGH" && hasConcreteReferences;
    if (!answerableWithoutEscalation) return "TECHNICAL_TEAM";
  } else if (decisionPackage.priority.category === "COMPLAINT") {
    return "CUSTOMER_SUPPORT";
  }
  if (decisionPackage.escalationRecommendation) return "CUSTOMER_SUPPORT";
  return "NONE";
}
