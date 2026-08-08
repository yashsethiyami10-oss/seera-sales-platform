import type { DecisionPackage } from "@/lib/intelligence/types";
import type {
  ActionResult, AuditMetadata, EscalationResult, ExecutionExplainability, ExecutionPackage,
  ExecutionStatus, PermissionLayer, PolicyResult, ResponseBlueprint, SafetyResult,
} from "./types";

/**
 * MUV AI — Execution Core (Module 7) Execution Package Builder.
 *
 * Pure assembly — every field here was already computed by an earlier
 * stage; this file combines them into the one structured object a future
 * integration layer (WhatsApp/Email/Website/Admin — none built yet)
 * consumes. No new computation happens here except the fixed
 * `deriveExecutionStatus` mapping, which is a direct, documented
 * reflection of the Safety Engine's own outcome — never an independent
 * judgment.
 */

export function buildExecutionPackage(params: {
  decisionPackage: DecisionPackage;
  safety: SafetyResult;
  policy: PolicyResult;
  escalation: EscalationResult;
  action: ActionResult;
  responseBlueprint: ResponseBlueprint;
  clearanceLayer: PermissionLayer;
  audit: AuditMetadata;
  explainability: ExecutionExplainability;
}): ExecutionPackage {
  const { decisionPackage, safety, policy, escalation, action, responseBlueprint, clearanceLayer, audit, explainability } = params;

  const executionStatus = deriveExecutionStatus(safety, escalation);

  const executionHints: Record<string, unknown> = {
    suggestedAction: action.action,
    escalationTarget: escalation.target,
    executionStatus,
    requiresHumanReview: safety.humanReviewRequired,
  };

  return {
    decisionPackage,
    safety,
    policy,
    escalation,
    action,
    responseBlueprint,
    executionStatus,
    executionConfidence: action.confidence,
    executionMetadata: { clearanceLayer },
    audit,
    explainability,
    executionHints,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Fixed, first-match-wins cascade over the Safety Engine's own outcome —
 * `ExecutionStatus` is deliberately shaped as a near-mirror of
 * `SafetyOutcome` since Safety is "the highest authority," with one
 * addition: `escalation.required` can independently produce `ESCALATED`
 * even from an otherwise-APPROVED safety read (e.g. a sales opportunity
 * routed to the sales team is a legitimate escalation, not a safety
 * concern).
 */
function deriveExecutionStatus(safety: SafetyResult, escalation: EscalationResult): ExecutionStatus {
  if (safety.outcome === "BLOCKED") return "BLOCKED";
  if (safety.outcome === "RESTRICTED") return "RESTRICTED";
  if (safety.outcome === "NEEDS_MORE_INFORMATION") return "NEEDS_MORE_INFORMATION";
  if (safety.outcome === "NEEDS_HUMAN_REVIEW") return "NEEDS_HUMAN_REVIEW";
  if (safety.outcome === "DEFERRED") return "DEFERRED";
  if (escalation.required || safety.outcome === "ESCALATED") return "ESCALATED";
  if (safety.outcome === "APPROVED") return "EXECUTED";
  return "BLOCKED"; // UNKNOWN safety outcome — never leave execution status ambiguous.
}

/** Shared by `executePipeline()` and the `buildExecutionPackage` action so
 * both build audit metadata identically rather than duplicating the shape. */
export function buildAuditMetadata(
  decisionPackage: DecisionPackage,
  policy: PolicyResult,
  pipelineStages: string[]
): AuditMetadata {
  const now = new Date().toISOString();
  return {
    executionTime: now,
    pipelineStages,
    policyChecks: policy.checks.length,
    safetyChecks: 11,
    versionReferences: [...decisionPackage.knowledgeReferences, ...decisionPackage.careReferences].map((r) => r.id),
    decisionReferences: [decisionPackage.decision.decisionReason],
    moduleReferences: ["Module 5 - Knowledge Retrieval Core", "Module 6 - Intelligence Core", "Module 7 - Execution Core"],
    timestamp: now,
    actor: "system",
  };
}
