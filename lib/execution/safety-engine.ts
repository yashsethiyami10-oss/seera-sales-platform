import type { DecisionPackage } from "@/lib/intelligence/types";
import type { PermissionLayer, SafetyOutcome, SafetyResult } from "./types";

/**
 * MUV AI — Execution Core (Module 7) Safety Engine.
 *
 * "This is the highest authority... If Safety blocks execution: no further
 * execution occurs. Return structured block information." In this
 * implementation every downstream stage still *runs* (same "always run
 * every stage, let upstream signals shape the conclusion" discipline
 * Module 6 used for Priority/CQ/Decision) — but a non-APPROVED outcome
 * here forces the Action Engine toward a conservative action
 * (STOP_EXECUTION/ESCALATE/COLLECT_INFORMATION/WAIT, never a customer-
 * facing recommendation) and the Response Composer toward a restricted
 * blueprint. "No further execution occurs" is enforced at the action
 * level, not by skipping pipeline stages structurally.
 *
 * Every one of the 11 named dimensions (Policy Compliance, Confidence
 * Threshold, Missing Information, Restricted Actions, Permission Layer,
 * Required Escalation, Human Review Requirement, Customer Safety,
 * Business Safety, Truthfulness, Transparency) is computed here as a
 * fixed, deterministic boolean derived only from the Decision Package
 * (Module 6's own already-computed fields) and the caller's clearance —
 * never a new judgment call about content this engine can't see.
 */

const SAFETY_MIN_CONFIDENCE_SCORE = 35;

export function validateSafety(decisionPackage: DecisionPackage, clearanceLayer: PermissionLayer): SafetyResult {
  const reasons: string[] = [];

  const confidenceThresholdMet = decisionPackage.confidence.score >= SAFETY_MIN_CONFIDENCE_SCORE;
  if (!confidenceThresholdMet) reasons.push(`confidence score ${decisionPackage.confidence.score} is below the minimum threshold (${SAFETY_MIN_CONFIDENCE_SCORE})`);

  const missingInformationBlocking = decisionPackage.requiredInformation.length > 0 && decisionPackage.confidence.level === "LOW";
  if (missingInformationBlocking) reasons.push(`${decisionPackage.requiredInformation.length} required information item(s) outstanding alongside LOW confidence`);

  const restrictedActionDetected = decisionPackage.priority.category === "SAFETY";
  if (restrictedActionDetected) reasons.push("priority category is SAFETY — restricted, cannot be auto-executed");

  const permissionLayerOk = !(
    (decisionPackage.priority.category === "BUSINESS_CRITICAL" || decisionPackage.priority.category === "SAFETY") &&
    clearanceLayer === "PUBLIC"
  );
  if (!permissionLayerOk) reasons.push(`priority category ${decisionPackage.priority.category} requires more than PUBLIC clearance`);

  const escalationRequired = decisionPackage.escalationRecommendation || decisionPackage.cqSummary.escalationNeed;
  if (escalationRequired) reasons.push("Decision Package or Care Quotient flags an escalation need");

  const humanReviewRequired =
    decisionPackage.priority.category === "SAFETY" ||
    decisionPackage.cqSummary.trustRisk === "URGENT" ||
    (decisionPackage.priority.level === "URGENT" && decisionPackage.confidence.level === "LOW");
  if (humanReviewRequired) reasons.push("urgent/high-trust-risk situation combined with insufficient confidence to proceed unsupervised");

  const customerSafetyOk = decisionPackage.priority.category !== "SAFETY";
  if (!customerSafetyOk) reasons.push("an active safety-relevant signal was classified for this request");

  const businessSafetyOk = !(decisionPackage.priority.category === "BUSINESS_CRITICAL" && decisionPackage.confidence.level === "LOW");
  if (!businessSafetyOk) reasons.push("business-critical situation with LOW confidence is not business-safe to auto-execute");

  const truthfulnessOk = decisionPackage.confidence.level !== "LOW";
  if (!truthfulnessOk) reasons.push("LOW confidence — truthfulness of an automatic response cannot be guaranteed");

  const transparencyOk = !(decisionPackage.cqSummary.transparencyNeeded && decisionPackage.confidence.level === "LOW");
  if (!transparencyOk) reasons.push("transparency is required but confidence is too low to be transparent about with certainty");

  // Safety Engine's own coarse policy read — independent of, and prior to,
  // the more detailed Policy Validator stage that follows it in the
  // pipeline. Defensive consistency check: a restricted action is only
  // "compliant" at this stage if it's already flagged for escalation.
  const policyCompliant = !restrictedActionDetected || escalationRequired;
  if (!policyCompliant) reasons.push("restricted (SAFETY-category) action was not flagged for escalation — inconsistent state");

  const outcome = deriveOutcome({
    customerSafetyOk,
    escalationRequired,
    restrictedActionDetected,
    permissionLayerOk,
    missingInformationBlocking,
    confidenceThresholdMet,
    policyCompliant,
    businessSafetyOk,
    truthfulnessOk,
    transparencyOk,
  });

  const reasoning = `Safety outcome ${outcome}, derived from ${reasons.length} flagged dimension(s) out of 11 evaluated.`;

  return {
    outcome,
    policyCompliant,
    confidenceThresholdMet,
    missingInformationBlocking,
    restrictedActionDetected,
    permissionLayerOk,
    escalationRequired,
    humanReviewRequired,
    customerSafetyOk,
    businessSafetyOk,
    truthfulnessOk,
    transparencyOk,
    reasons,
    reasoning,
  };
}

/**
 * Fixed, first-match-wins cascade — the same discipline Priority Engine
 * (Module 6) uses. Branch 1 is a defensive fallback: Module 6's own CQ
 * Engine always sets `escalationNeed: true` whenever `priority.category
 * === "SAFETY"`, so `!customerSafetyOk && !escalationRequired` is not
 * expected to fire against current Module 6 output — it is retained in
 * case that invariant ever changes, rather than assumed to hold silently.
 */
function deriveOutcome(flags: {
  customerSafetyOk: boolean;
  escalationRequired: boolean;
  restrictedActionDetected: boolean;
  permissionLayerOk: boolean;
  missingInformationBlocking: boolean;
  confidenceThresholdMet: boolean;
  policyCompliant: boolean;
  businessSafetyOk: boolean;
  truthfulnessOk: boolean;
  transparencyOk: boolean;
}): SafetyOutcome {
  if (!flags.customerSafetyOk && !flags.escalationRequired) return "BLOCKED";
  if (!flags.customerSafetyOk || flags.restrictedActionDetected) return "NEEDS_HUMAN_REVIEW";
  if (!flags.permissionLayerOk) return "RESTRICTED";
  if (flags.missingInformationBlocking) return "NEEDS_MORE_INFORMATION";
  if (flags.escalationRequired) return "ESCALATED";
  if (!flags.confidenceThresholdMet) return "DEFERRED";
  if (flags.policyCompliant && flags.businessSafetyOk && flags.truthfulnessOk && flags.transparencyOk) return "APPROVED";
  return "UNKNOWN";
}
