import type { ActionType, ExecutionPackage, ExperienceContentBlock, ExperienceResponse } from "./types";
import type { RetrievalResult } from "@/lib/retrieval/types";

/**
 * MUV AI — Experience Platform (Module 8) Response Model.
 *
 * "Safe customer-facing rendering from approved execution data." This is
 * the one place in Module 8 where the boundary between Module 7's
 * staff-facing `ExecutionPackage` and genuinely customer-safe content is
 * enforced. Deliberately does NOT read `executionPackage.safety.reasons`,
 * `.policy.violations`, `.responseBlueprint.safetyNotes`,
 * `.responseBlueprint.restrictions`, or `.responseBlueprint.escalationNotice`
 * anywhere — those are internal/staff-facing strings (see Module 7's own
 * `response-blueprint.md`) and must never reach a customer. Every
 * customer-visible string here comes from a small, fixed lookup table
 * (`CUSTOMER_MESSAGE_BY_ACTION`), never from Module 6/7's own internal
 * reasoning text.
 *
 * "This module must not bypass Module 7 safety": this function trusts
 * `executionPackage.action.action` as the single source of truth for what
 * is safe to render. It never re-evaluates `executionStatus`/`safety`
 * itself to decide whether to show content — the Action Engine (Module 7)
 * already guarantees a non-`APPROVED` safety outcome only ever produces a
 * conservative action (`STOP_EXECUTION`/`ESCALATE`/`COLLECT_INFORMATION`/
 * `WAIT`), so trusting `action.action` here is equivalent to trusting
 * Safety's own verdict, one level removed.
 */

// Stabilization fix: ASK_FOLLOW_UP_QUESTION and COLLECT_INFORMATION also
// push a FOLLOW_UP_QUESTION block below (see buildExperienceResponse) —
// this table's own text for those two actions previously *also* asked
// for more detail ("Could you share a bit more detail..." /
// "...could you share more detail?"), so the customer saw two separate
// chat bubbles asking the same thing for one turn. These two entries are
// now a plain acknowledgment, never a question themselves, so the
// FOLLOW_UP_QUESTION block remains the one and only actual ask.
const CUSTOMER_MESSAGE_BY_ACTION: Record<ActionType, string> = {
  ANSWER_CUSTOMER: "Here's what we found for you:",
  ASK_FOLLOW_UP_QUESTION: "Happy to help with that.",
  RECOMMEND_PRODUCT: "Here's a product that matches what you're looking for:",
  RECOMMEND_CARE_WORKFLOW: "Here's a suggested routine that should help:",
  RECOMMEND_KNOWLEDGE: "Here's some information that should help:",
  ESCALATE: "Thanks for reaching out — we're connecting you with our team, who will follow up shortly.",
  STOP_EXECUTION: "We're not able to process this request automatically right now. Our team has been notified and will follow up.",
  COLLECT_INFORMATION: "We'd like to help you with this.",
  WAIT: "Thanks for your patience — we're reviewing this and will get back to you shortly.",
  DECLINE_CONFIDENTIAL: "That's proprietary formulation and manufacturing information, so we're not able to share it — happy to help with anything else about the product, though.",
};

const FOLLOW_UP_QUESTION_BY_ACTION: Partial<Record<ActionType, string>> = {
  ASK_FOLLOW_UP_QUESTION: "What would you like to know more about?",
  COLLECT_INFORMATION: "Could you tell us more about your situation?",
};

const GENERIC_ESCALATION_NOTICE = "A team member will follow up with you shortly.";

// Final Precedence Rule Refinement — the Founder-approved Answerability
// override (lib/execution/action-engine.ts::isFactualAnswerable) can leave
// `escalation.required` true (computed independently by the Escalation
// Resolver *before* the override applies) even though the actual delivered
// action is a genuine answer or an honest decline, not a real escalation.
// Showing "a team member will follow up" in that case would be false — no
// team member is ever notified for these five action types. Structurally
// safe to exclude only these: any pre-existing (non-override) path to one
// of them already required `escalation.required === false` (Safety's own
// `deriveOutcome` returns "ESCALATED" — never "APPROVED" — whenever an
// escalation is genuinely needed, and `buildAction` returns `ESCALATE`
// before ever reaching these), so a stale `true` here can only be a
// leftover from the override, never a real signal to be worked around.
const ACTIONS_ANSWERABILITY_CAN_PRODUCE: ActionType[] = ["RECOMMEND_PRODUCT", "RECOMMEND_KNOWLEDGE", "RECOMMEND_CARE_WORKFLOW", "ANSWER_CUSTOMER", "DECLINE_CONFIDENTIAL"];

/**
 * `governedContent`, when supplied, is Module 6's own `context.retrievedKnowledge`
 * (Founder Validation & Safe UAT Activation, Block B1) — never a raw
 * Product/ProductContent/PublishedKnowledgeRecord row. The caller
 * (experience-orchestrator.ts) only supplies it after resolving the turn's
 * REAL, server-derived session role via `resolveCallerClearance()` and
 * confirming it is ADMIN/STAFF; every other caller passes nothing, and this
 * function's behavior is then byte-for-byte identical to before Block B1.
 * Only `summary`/`title` (already governed, already the four-intelligence-
 * layer output) are ever read from it — no raw source field, no reasoning
 * text, no restricted section.
 */
export function buildExperienceResponse(sessionId: string, executionPackage: ExecutionPackage, governedContent?: RetrievalResult[]): ExperienceResponse {
  const { action, escalation, executionStatus, responseBlueprint } = executionPackage;
  const blocks: ExperienceContentBlock[] = [];

  blocks.push({ type: "MESSAGE", text: CUSTOMER_MESSAGE_BY_ACTION[action.action] });

  for (const ref of action.targetReferences) {
    const match = governedContent?.find((r) => r.sourceType === ref.type && r.recordId === ref.id);
    blocks.push({
      type: "REFERENCE_CARD",
      referenceType: ref.type,
      id: ref.id,
      label: ref.label ?? ref.id,
      ...(match?.summary ? { content: match.summary } : {}),
    });
  }

  const followUpQuestion = FOLLOW_UP_QUESTION_BY_ACTION[action.action];
  if (followUpQuestion) {
    blocks.push({ type: "FOLLOW_UP_QUESTION", question: followUpQuestion });
  }

  if (escalation.required && !ACTIONS_ANSWERABILITY_CAN_PRODUCE.includes(action.action)) {
    blocks.push({ type: "ESCALATION_NOTICE", message: GENERIC_ESCALATION_NOTICE });
  }

  return {
    sessionId,
    blocks,
    requiresHandoff: escalation.required,
    allowFollowUp: action.action !== "STOP_EXECUTION",
    toneHint: responseBlueprint.toneGuidance,
    executionStatus,
    generatedAt: new Date().toISOString(),
  };
}
