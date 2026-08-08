import type { DecisionPackage } from "@/lib/intelligence/types";
import { validateSafety } from "./safety-engine";
import { validatePolicy } from "./policy-validator";
import { resolveEscalation } from "./escalation-resolver";
import { buildAction } from "./action-engine";
import { composeResponseBlueprint } from "./response-composer";
import { explainExecution } from "./execution-explainability";
import { buildExecutionPackage, buildAuditMetadata } from "./execution-package";
import type {
  ActionResult, EscalationResult, ExecutionInput, ExecutionPackage, PermissionLayer,
  PolicyResult, ResponseBlueprint, SafetyResult,
} from "./types";

/**
 * MUV AI — Execution Core (Module 7) orchestrator. Runs the frozen
 * pipeline in the exact required order — Safety Engine → Policy
 * Validation → Escalation Resolution → Action Engine → Response
 * Composer → Execution Package — as discrete, sequential steps, the same
 * discipline Module 6's own `buildIntelligence()` used for its 8 stages.
 *
 * Fully synchronous: unlike Module 6 (which had to reach into Module 5's
 * database-backed retrieval for its first stage), Execution Core never
 * retrieves knowledge or touches a database at all — it is a pure
 * function of the caller-supplied Decision Package and clearance layer.
 * "No mutations. No external integrations." is true structurally, not
 * just by convention.
 *
 * CORRECTED (post-founder-review): "If Safety blocks execution, no
 * further execution occurs" is now a true short-circuit, not just a
 * conservative conclusion reached after every stage still runs. When
 * Safety's outcome is BLOCKED or RESTRICTED, this function returns
 * immediately via `buildSafetyShortCircuitPackage()` below — it never
 * calls `validatePolicy()`, `resolveEscalation()`, `buildAction()`, or
 * `composeResponseBlueprint()` for those two outcomes. The other 6
 * outcomes (APPROVED, NEEDS_HUMAN_REVIEW, NEEDS_MORE_INFORMATION,
 * ESCALATED, DEFERRED, UNKNOWN) are unaffected — they still run the full
 * 5-stage pipeline exactly as before, and rely on the Action Engine's own
 * existing conservative-action cascade (STOP_EXECUTION for UNKNOWN,
 * ESCALATE for NEEDS_HUMAN_REVIEW, etc. — see `actions.md`) rather than a
 * structural short-circuit. Only BLOCKED/RESTRICTED are true
 * "no further execution occurs" cases, matching exactly what the module
 * prompt states and nothing broader.
 */
export function executePipeline(input: ExecutionInput): ExecutionPackage {
  const { decisionPackage } = input;
  const clearanceLayer = input.clearanceLayer ?? "PUBLIC";
  const stages: string[] = [];

  // Stage: Safety Engine (highest authority)
  const safety = validateSafety(decisionPackage, clearanceLayer);
  stages.push("safety-engine");

  if (safety.outcome === "BLOCKED" || safety.outcome === "RESTRICTED") {
    return buildSafetyShortCircuitPackage(decisionPackage, safety, clearanceLayer, stages);
  }

  // Stage: Policy Validation
  const policy = validatePolicy(decisionPackage, safety, clearanceLayer);
  stages.push("policy-validator");

  // Stage: Escalation Resolution
  const escalation = resolveEscalation(decisionPackage, safety, policy);
  stages.push("escalation-resolver");

  // Stage: Action Engine
  const action = buildAction(decisionPackage, safety, policy, escalation, input.customerMessage);
  stages.push("action-engine");

  // Stage: Response Composer
  const responseBlueprint = composeResponseBlueprint(decisionPackage, safety, policy, escalation, action);
  stages.push("response-composer");

  const explainability = explainExecution(safety, policy, escalation, action, decisionPackage);
  const audit = buildAuditMetadata(decisionPackage, policy, stages);

  // Stage: Execution Package
  return buildExecutionPackage({
    decisionPackage, safety, policy, escalation, action, responseBlueprint, clearanceLayer, audit, explainability,
  });
}

/**
 * "If Safety blocks execution, no further execution occurs." Called only
 * when `safety.outcome` is BLOCKED or RESTRICTED, and it never calls
 * `validatePolicy()`, `resolveEscalation()`, `buildAction()`, or
 * `composeResponseBlueprint()` — those four functions are simply not
 * invoked on this path, not run-and-then-overridden. Evaluating Business
 * Rules, Response Rules, or an Action recommendation against a request
 * Safety has already disqualified would contradict Safety's own status
 * as "the highest authority."
 *
 * Every field the (unchanged) `ExecutionPackage` type still requires is
 * populated with a minimal, explicitly-labeled "not evaluated" structure
 * instead — never the output of actually running that stage. `stages`
 * (passed in containing only `"safety-engine"`) becomes
 * `audit.pipelineStages`, and `policy.checks` is deliberately `[]` (so
 * `audit.policyChecks` is `0`, not the normal path's `7`) — both are the
 * concrete, testable evidence that no downstream stage actually ran, per
 * founder review's own requirement.
 */
function buildSafetyShortCircuitPackage(
  decisionPackage: DecisionPackage,
  safety: SafetyResult,
  clearanceLayer: PermissionLayer,
  stages: string[]
): ExecutionPackage {
  const policy: PolicyResult = {
    compliant: false,
    checks: [],
    violations: ["POLICY_VALIDATION_NOT_RUN_SAFETY_SHORT_CIRCUIT"],
    reasoning: `Policy Validation was not run — Safety Engine outcome (${safety.outcome}) short-circuited the pipeline before this stage could execute.`,
  };

  const escalation: EscalationResult = {
    target: safety.outcome === "BLOCKED" ? "SAFETY_REVIEW" : "FOUNDER_REVIEW",
    required: true,
    reason: `Safety Engine outcome ${safety.outcome} requires human review before this request can proceed further.`,
    triggeredBy: safety.reasons,
  };

  const action: ActionResult = {
    action: "STOP_EXECUTION",
    targetReferences: [],
    reason: `Safety Engine outcome ${safety.outcome} — no action may be taken; the Action Engine was not run.`,
    confidence: "LOW",
  };

  const responseBlueprint: ResponseBlueprint = {
    intent: "No customer-facing response may be generated — execution was blocked by the Safety Engine before the Response Composer would normally run.",
    toneGuidance: [],
    requiredInformation: [],
    knowledgeReferences: [],
    careReferences: [],
    suggestedStructure: [],
    restrictions: ["Execution blocked by Safety Engine — no customer-facing response may be generated.", ...safety.reasons],
    transparencyRequirements: [],
    escalationNotice: `Escalation to ${escalation.target} is required: ${escalation.reason}`,
    safetyNotes: safety.reasons,
  };

  const explainability = explainExecution(safety, policy, escalation, action, decisionPackage);
  const audit = buildAuditMetadata(decisionPackage, policy, stages);

  return buildExecutionPackage({
    decisionPackage, safety, policy, escalation, action, responseBlueprint, clearanceLayer, audit, explainability,
  });
}
