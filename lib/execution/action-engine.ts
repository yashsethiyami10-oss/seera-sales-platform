import type { ConfidenceLevel, DecisionPackage } from "@/lib/intelligence/types";
import type { ActionResult, ActionType, EscalationResult, PolicyResult, SafetyResult } from "./types";
import type { SourceReference } from "@/lib/retrieval/types";
import { scanTextForConfidentiality, hasBlockingConfidentialityFindings } from "@/lib/knowledge-reconciliation/confidentiality-scanner";

/**
 * MUV AI — Execution Core (Module 7) Action Engine.
 *
 * "Determine the next executable action... Do not actually execute.
 * Return structured action objects." Safety's outcome dominates the
 * cascade — this is the concrete place "if Safety blocks execution, no
 * further execution occurs" is enforced: a non-APPROVED safety outcome
 * resolves to STOP_EXECUTION / ESCALATE / COLLECT_INFORMATION / WAIT,
 * never to a customer-facing recommendation action — with exactly one
 * Founder-approved exception (`isFactualAnswerable()` below): a
 * `NEEDS_MORE_INFORMATION` outcome caused solely by Conversation-bucket
 * gaps (missing customerGoal/memory), for an otherwise knowledge-
 * sufficient, policy-compliant `PRODUCT_ISSUE` case, may still reach a
 * recommendation. Every other non-APPROVED outcome, and every other
 * priority category, is unaffected.
 */

// The two "informationStillNeeded" strings (lib/intelligence/decision-engine.ts)
// that reflect a genuine KNOWLEDGE gap rather than a Conversation-bucket one —
// kept as a literal match against decision-engine.ts's own exact text rather
// than re-deriving the condition, since this file must never duplicate
// Decision Engine logic, only read its already-computed output.
const GENUINE_KNOWLEDGE_GAPS = [
  "No matching knowledge was retrieved — more specific detail from the customer is needed",
  "Specific product reference was not identified",
];

/**
 * Founder-approved Answerability Decision (Final Surgical Implementation).
 *
 * Per the Root-Cause and Answerability Architecture reviews: Knowledge
 * Confidence and Conversation Confidence are different signals that the
 * shared Confidence Engine formula blends into one number. Two of
 * `informationStillNeeded`'s four possible entries — missing
 * `customerGoal`, missing conversation `memory` — are Conversation-bucket
 * gaps that fire on nearly every real single-turn message and can alone
 * push `confidence.level` to LOW, which Safety Engine's own
 * `missingInformationBlocking` then turns into a `NEEDS_MORE_INFORMATION`
 * outcome — blocking an answer that may be fully knowledge-sufficient.
 * This predicate does not touch Safety, Policy, Escalation, EQ, or CQ:
 * it only decides whether a `NEEDS_MORE_INFORMATION` outcome, specifically
 * caused by Conversation-bucket gaps alone, should still be treated as
 * blocking here.
 *
 * Deliberately scoped to `PRODUCT_ISSUE` only — the one category this
 * entire review was about. Every other category (`SAFETY`,
 * `BUSINESS_CRITICAL`, `SALES_OPPORTUNITY`, `COMPLAINT`, ...) keeps its
 * exact existing escalation behavior: `escalation-resolver.ts`'s
 * `deriveTarget()` returns a mandatory non-"NONE" target for those
 * categories unconditionally, before confidence is even considered, so
 * excluding them here is what guarantees this change can never weaken an
 * existing mandatory-escalation rule.
 */
function isFactualAnswerable(decisionPackage: DecisionPackage, safety: SafetyResult, policy: PolicyResult): boolean {
  if (!policy.compliant) return false;
  if (decisionPackage.priority.category !== "PRODUCT_ISSUE") return false;
  if (safety.outcome !== "APPROVED" && safety.outcome !== "NEEDS_MORE_INFORMATION") return false;

  if (safety.outcome === "NEEDS_MORE_INFORMATION") {
    const hasGenuineKnowledgeGap = decisionPackage.requiredInformation.some((item) => GENUINE_KNOWLEDGE_GAPS.includes(item));
    if (hasGenuineKnowledgeGap) return false;
  }

  // Rule 1 — a real, structural governed match: an identified product, a
  // resolved knowledge reference, or a required care workflow. Never a
  // bare retrieved-count or category-only signal; these three fields are
  // the exact ones the existing recommendation logic below already keys
  // off of (RECOMMEND_PRODUCT / RECOMMEND_KNOWLEDGE / RECOMMEND_CARE_WORKFLOW),
  // reused here rather than re-derived.
  return decisionPackage.productReferences.length > 0 || decisionPackage.knowledgeReferences.length > 0 || decisionPackage.decision.requiredCareWorkflow !== null;
}

// Final Precedence Rule Refinement — Founder-specified generic phrases
// that request confidential formulation/manufacturing information by
// CONCEPT rather than by a specific restricted chemical name (the
// existing confidentiality scanner's own vocabulary already catches the
// latter, e.g. "SLES" — see requestsConfidentialFormulation() below). A
// fixed, literal, Founder-authored list — not a new classifier or intent
// system, just an explicit substring check reused at one call site.
const CONFIDENTIAL_INTENT_PHRASES = [
  "formula",
  "formulation",
  "ingredient percentage",
  "raw material percentage",
  "manufacturing recipe",
  "manufacturing process",
  "proprietary chemistry",
  "confidential composition",
  "internal manufacturing specifications",
];

/**
 * Final Precedence Rule Refinement. "Confidentiality takes precedence
 * over Answerability": even when a question is otherwise knowledge-
 * sufficient, safety/policy-clean, and would normally answer, an explicit
 * request for confidential formulation/manufacturing information must
 * never be answered with an unrelated generic product answer — that is
 * an honesty failure, not a safety one (nothing confidential actually
 * leaks either way, since write-time redaction and the response-time
 * confidentiality backstop are both unchanged and remain the real
 * disclosure guarantee regardless of which action is chosen here). This
 * function only decides whether the CUSTOMER'S OWN QUESTION asked for
 * that category of information — reusing the existing scanner for known
 * restricted terms plus the fixed phrase list above for generic requests
 * the vocabulary-based scanner was never designed to catch.
 */
function requestsConfidentialFormulation(customerMessage: string | undefined): boolean {
  if (!customerMessage) return false;
  const lower = customerMessage.toLowerCase();
  if (CONFIDENTIAL_INTENT_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  return hasBlockingConfidentialityFindings(scanTextForConfidentiality(customerMessage, "customerMessage"));
}

export function buildAction(decisionPackage: DecisionPackage, safety: SafetyResult, policy: PolicyResult, escalation: EscalationResult, customerMessage?: string): ActionResult {
  if (safety.outcome === "BLOCKED") {
    return build("STOP_EXECUTION", [], "Safety Engine blocked execution — no action may proceed.", "LOW");
  }

  const answerable = isFactualAnswerable(decisionPackage, safety, policy);

  if (!answerable) {
    if (escalation.required || safety.outcome === "NEEDS_HUMAN_REVIEW" || safety.outcome === "RESTRICTED" || safety.outcome === "ESCALATED") {
      return build("ESCALATE", [], `Escalation required: routed to ${escalation.target}.`, "LOW");
    }
    if (safety.outcome === "NEEDS_MORE_INFORMATION") {
      return build("COLLECT_INFORMATION", [], "Safety Engine requires more information before execution can proceed.", "LOW");
    }
    if (safety.outcome === "DEFERRED") {
      return build("WAIT", [], "Confidence threshold not yet met — deferring rather than acting.", "LOW");
    }
    if (safety.outcome === "UNKNOWN") {
      return build("STOP_EXECUTION", [], "Safety outcome could not be determined — stopping conservatively rather than guessing.", "LOW");
    }
    if (!policy.compliant) {
      return build("STOP_EXECUTION", [], `Policy validation failed (${policy.violations.join(", ")}) despite Safety approval — stopping conservatively.`, "LOW");
    }
  }

  // Reaches here when `answerable` is true (a knowledge-sufficient,
  // safety/policy-clean PRODUCT_ISSUE case — the Founder-approved override),
  // OR when none of the blocking conditions above applied at all — i.e.
  // safety.outcome === "APPROVED" && policy.compliant, exactly the
  // original, unmodified precondition for everything below.

  // Final Precedence Rule Refinement — checked here, the single point
  // every path that is about to deliver product-related content passes
  // through, whether reached via the pre-existing APPROVED route or the
  // newer Answerability override above. Never reached by a turn that was
  // already going to ESCALATE/COLLECT_INFORMATION/WAIT/STOP_EXECUTION for
  // an independent reason above — "do not escalate unless existing policy
  // already requires it" holds because this check adds no new escalation,
  // it only redirects an about-to-answer turn to an honest decline.
  if (requestsConfidentialFormulation(customerMessage)) {
    return build(
      "DECLINE_CONFIDENTIAL",
      [],
      "Customer requested confidential formulation/manufacturing information — declining honestly rather than substituting an unrelated generic answer.",
      decisionPackage.confidence.level
    );
  }

  const executionConfidence = decisionPackage.confidence.level;

  if (decisionPackage.decision.requiredCareWorkflow) {
    return build("RECOMMEND_CARE_WORKFLOW", [decisionPackage.decision.requiredCareWorkflow], "A required care workflow was identified by the Decision Package.", executionConfidence);
  }
  if (decisionPackage.priority.category === "PRODUCT_ISSUE" && decisionPackage.productReferences.length > 0) {
    return build("RECOMMEND_PRODUCT", decisionPackage.productReferences, "Priority is product-anchored and specific product references were retrieved.", executionConfidence);
  }
  if (decisionPackage.knowledgeReferences.length > 0) {
    return build("RECOMMEND_KNOWLEDGE", decisionPackage.knowledgeReferences, "Relevant knowledge was retrieved and no higher-priority action applies.", executionConfidence);
  }
  if (decisionPackage.requiredInformation.length > 0) {
    return build("ASK_FOLLOW_UP_QUESTION", [], "Information is still needed to fully answer, but the situation is not blocked.", executionConfidence);
  }
  return build("ANSWER_CUSTOMER", [], "No outstanding information gaps and no more specific recommendation applies.", executionConfidence);
}

function build(action: ActionType, targetReferences: SourceReference[], reason: string, confidence: ConfidenceLevel): ActionResult {
  return { action, targetReferences, reason, confidence };
}
