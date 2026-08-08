import type { CQResult, EQResult, IntelligenceContext, IntelligenceLevel, PriorityResult } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Care Quotient Engine (CQ).
 *
 * "CQ does NOT generate responses. Return only structured
 * recommendations." — every field below is a flag or a level, never a
 * sentence a customer would read. Deterministic rule table over
 * Priority + EQ + Context, evaluated in the fixed pipeline order the
 * spec requires (CQ runs after EQ, and reads Priority computed earlier).
 */

const HIGH_URGENCY_CATEGORIES = ["SAFETY", "CUSTOMER_RISK", "COMPLAINT"];
const NEGATIVE_STATES = ["ANGRY", "FRUSTRATED", "CONCERNED", "NEGATIVE"];
const CONFUSION_STATES = ["CONFUSED", "CURIOUS"];

function boolLevel(a: boolean, b: boolean): IntelligenceLevel {
  if (a && b) return "URGENT";
  if (a || b) return "HIGH";
  return "MEDIUM";
}

export function evaluateCare(priority: PriorityResult, eq: EQResult, context: IntelligenceContext): CQResult {
  const evidence: string[] = [];

  const isHighUrgencyPriority = HIGH_URGENCY_CATEGORIES.includes(priority.category) || priority.level === "URGENT" || priority.level === "HIGH";
  if (isHighUrgencyPriority) evidence.push(`priority: ${priority.category} (${priority.level})`);

  const isNegativeEmotion = NEGATIVE_STATES.includes(eq.state);
  if (isNegativeEmotion) evidence.push(`emotional signal: ${eq.state}`);

  const isConfused = CONFUSION_STATES.includes(eq.state);
  if (isConfused) evidence.push(`emotional signal: ${eq.state}`);

  const hasEscalatingCareWorkflow = context.retrievedKnowledge.some((r) => {
    const meta = r.internalMetadata as Record<string, unknown> | null;
    return meta?.escalationRequired === true;
  });
  if (hasEscalatingCareWorkflow) evidence.push("a retrieved care workflow flags escalationRequired");

  const requiredCareLevel = boolLevel(isHighUrgencyPriority, isNegativeEmotion);
  const escalationNeed = priority.category === "SAFETY" || hasEscalatingCareWorkflow || (isHighUrgencyPriority && isNegativeEmotion);
  if (escalationNeed && priority.category === "SAFETY") evidence.push("safety-category priority always requires escalation review");

  const empathyLevel: IntelligenceLevel = isNegativeEmotion ? (priority.level === "URGENT" ? "URGENT" : "HIGH") : isConfused ? "MEDIUM" : "LOW";
  const transparencyNeeded = isConfused || isNegativeEmotion || priority.category === "COMPLAINT";
  const reassuranceNeeded = isNegativeEmotion || priority.category === "SAFETY" || priority.category === "CUSTOMER_RISK";
  const educationNeed = isConfused || priority.category === "PRODUCT_ISSUE";
  const followUpImportance: IntelligenceLevel = escalationNeed ? "HIGH" : priority.category === "COMPLAINT" ? "HIGH" : "MEDIUM";
  const supportPriority: IntelligenceLevel = priority.level;
  const trustRisk: IntelligenceLevel = priority.category === "SAFETY" ? "URGENT" : priority.category === "COMPLAINT" || isNegativeEmotion ? "HIGH" : "LOW";
  const customerEffort: IntelligenceLevel = context.retrievedKnowledge.length === 0 ? "HIGH" : isConfused ? "MEDIUM" : "LOW";

  const reasoning = `Care level derived from priority (${priority.category}/${priority.level}) and emotional signal (${eq.state}, confidence ${eq.confidenceLevel}). ${escalationNeed ? "Escalation recommended." : "No escalation indicated by current signals."}`;

  return {
    requiredCareLevel,
    reassuranceNeeded,
    transparencyNeeded,
    escalationNeed,
    empathyLevel,
    followUpImportance,
    educationNeed,
    supportPriority,
    trustRisk,
    customerEffort,
    reasoning,
    evidence,
  };
}
