import type { DecisionPackage } from "@/lib/intelligence/types";
import type { ActionResult, EscalationResult, ExecutionExplainability, PolicyResult, SafetyResult } from "./types";

/**
 * MUV AI — Execution Core (Module 7) Explainability.
 *
 * "Never expose internal reasoning. No chain-of-thought." Answers the
 * four required questions (why executed / why blocked / why escalated /
 * which policy or safety rule triggered) directly from the already-
 * computed Safety, Policy, Escalation, and Action results — nothing here
 * is re-derived or guessed.
 */

export function explainExecution(
  safety: SafetyResult,
  policy: PolicyResult,
  escalation: EscalationResult,
  action: ActionResult,
  decisionPackage: DecisionPackage
): ExecutionExplainability {
  const executed = safety.outcome === "APPROVED" && policy.compliant && !escalation.required && action.action !== "STOP_EXECUTION";

  const whyExecuted = executed
    ? `Action "${action.action}" was executed because Safety approved the request, Policy validated all 7 areas, and no escalation was required. ${action.reason}`
    : null;

  const whyBlocked =
    safety.outcome === "BLOCKED" || action.action === "STOP_EXECUTION"
      ? `Execution was stopped. Safety outcome: ${safety.outcome}. ${safety.reasons.length > 0 ? safety.reasons.join("; ") + "." : ""}`
      : null;

  const whyEscalated = escalation.required ? `Escalated to ${escalation.target}: ${escalation.reason}` : null;

  const contributingModules = [
    "Intelligence Core (Module 6)",
    "Safety Engine",
    "Policy Validator",
    "Escalation Resolver",
    "Action Engine",
    "Response Composer",
  ];

  return {
    whyExecuted,
    whyBlocked,
    whyEscalated,
    policyTriggered: policy.violations,
    safetyRuleTriggered: safety.reasons,
    contributingModules,
  };
}
