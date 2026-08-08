import type { DecisionPackage } from "@/lib/intelligence/types";
import type { SourceReference } from "@/lib/retrieval/types";
import type { ActionResult, ActionType, EscalationResult, PolicyResult, ResponseBlueprint, SafetyResult } from "./types";

/**
 * MUV AI — Execution Core (Module 7) Response Composer.
 *
 * "This module does NOT generate customer language. It builds a Response
 * Blueprint." Every field here is a structural instruction for a future
 * LLM integration to follow — an intent label, tone words, a structure
 * outline, restriction strings — never a sentence written for a customer
 * to read.
 */

const INTENT_BY_ACTION: Record<ActionType, string> = {
  ANSWER_CUSTOMER: "Directly answer the customer's request using retrieved knowledge.",
  ASK_FOLLOW_UP_QUESTION: "Ask a clarifying follow-up question before a full answer can be given.",
  RECOMMEND_PRODUCT: "Recommend the identified product(s).",
  RECOMMEND_CARE_WORKFLOW: "Guide the customer through the identified care workflow.",
  RECOMMEND_KNOWLEDGE: "Share the retrieved knowledge relevant to the request.",
  ESCALATE: "Notify the customer that this request is being routed to a human team.",
  STOP_EXECUTION: "Do not generate a response — execution was stopped by Safety or Policy.",
  COLLECT_INFORMATION: "Request the specific missing information needed to proceed.",
  WAIT: "Do not respond yet — confidence is insufficient to act.",
  DECLINE_CONFIDENTIAL: "Politely decline to share confidential formulation/manufacturing information — do not substitute a generic product answer for what was actually asked.",
};

const STRUCTURE_BY_ACTION: Record<ActionType, string[]> = {
  ANSWER_CUSTOMER: ["acknowledge the request", "answer using referenced knowledge", "offer a follow-up"],
  ASK_FOLLOW_UP_QUESTION: ["acknowledge the request", "ask the clarifying question"],
  RECOMMEND_PRODUCT: ["acknowledge the request", "recommend the product(s)", "explain relevance"],
  RECOMMEND_CARE_WORKFLOW: ["acknowledge the request", "introduce the care workflow", "outline next steps"],
  RECOMMEND_KNOWLEDGE: ["acknowledge the request", "share the relevant knowledge", "offer a follow-up"],
  ESCALATE: ["acknowledge the request", "explain that this is being escalated", "set an expectation for follow-up"],
  STOP_EXECUTION: [],
  COLLECT_INFORMATION: ["acknowledge the request", "state what information is needed"],
  WAIT: [],
  DECLINE_CONFIDENTIAL: ["acknowledge the request", "state that formulation/manufacturing details cannot be shared", "offer to help with anything else about the product"],
};

export function composeResponseBlueprint(
  decisionPackage: DecisionPackage,
  safety: SafetyResult,
  policy: PolicyResult,
  escalation: EscalationResult,
  action: ActionResult
): ResponseBlueprint {
  const showKnowledge = action.action === "RECOMMEND_KNOWLEDGE" || action.action === "ANSWER_CUSTOMER";
  const showCare = action.action === "RECOMMEND_CARE_WORKFLOW";

  const knowledgeReferences: SourceReference[] = showKnowledge ? decisionPackage.knowledgeReferences : [];
  const careReferences: SourceReference[] = showCare ? decisionPackage.careReferences : [];

  const toneGuidance: string[] = [];
  if (decisionPackage.cqSummary.reassuranceNeeded) toneGuidance.push("reassuring");
  if (decisionPackage.cqSummary.empathyLevel === "HIGH" || decisionPackage.cqSummary.empathyLevel === "URGENT") toneGuidance.push("empathetic");
  if (decisionPackage.cqSummary.transparencyNeeded) toneGuidance.push("transparent");
  if (decisionPackage.cqSummary.trustRisk === "HIGH" || decisionPackage.cqSummary.trustRisk === "URGENT") toneGuidance.push("calm and precise");
  if (toneGuidance.length === 0) toneGuidance.push("neutral");

  const restrictions: string[] = [];
  if (!safety.truthfulnessOk) restrictions.push("Do not state claims with unverified confidence.");
  if (!safety.transparencyOk) restrictions.push("Must disclose uncertainty explicitly rather than implying certainty.");
  for (const area of policy.violations) restrictions.push(`Must not proceed without resolving policy area: ${area}.`);
  if (action.action === "STOP_EXECUTION") restrictions.push("No customer-facing response may be generated for this request.");

  const transparencyRequirements: string[] = [];
  if (decisionPackage.cqSummary.transparencyNeeded) transparencyRequirements.push("Disclose the basis and confidence level of the response.");
  if (escalation.required) transparencyRequirements.push("State plainly that this request required escalation.");

  const escalationNotice = escalation.required ? `Escalation to ${escalation.target} is required: ${escalation.reason}` : null;

  return {
    intent: INTENT_BY_ACTION[action.action],
    toneGuidance,
    requiredInformation: decisionPackage.requiredInformation,
    knowledgeReferences,
    careReferences,
    suggestedStructure: STRUCTURE_BY_ACTION[action.action],
    restrictions,
    transparencyRequirements,
    escalationNotice,
    safetyNotes: safety.reasons,
  };
}
