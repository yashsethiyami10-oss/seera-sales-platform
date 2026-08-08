import type { ConfidenceLevel, DecisionPackage } from "@/lib/intelligence/types";
import type { PermissionLayer, SourceReference } from "@/lib/retrieval/types";

/**
 * MUV AI — Execution Core (Module 7) shared types.
 *
 * `ConfidenceLevel`/`PermissionLayer`/`SourceReference`/`DecisionPackage` are
 * reused directly from Module 6 and Module 5 rather than redefined — the
 * same cross-module reuse discipline every prior module followed. Every
 * enum-shaped field below ("no free-text statuses") is a fixed string
 * union, matching the module prompt's explicit requirement for Safety
 * Outcomes and extended to every other categorical field in this module
 * for the same explainability reason.
 */

export type { PermissionLayer };

// ---------------------------------------------------------------------------
// Safety Engine
// ---------------------------------------------------------------------------

/** "No free-text statuses." Exactly the 8 named in the module prompt. */
export type SafetyOutcome =
  | "APPROVED"
  | "BLOCKED"
  | "NEEDS_HUMAN_REVIEW"
  | "NEEDS_MORE_INFORMATION"
  | "RESTRICTED"
  | "ESCALATED"
  | "DEFERRED"
  | "UNKNOWN";

export type SafetyResult = {
  outcome: SafetyOutcome;
  policyCompliant: boolean;
  confidenceThresholdMet: boolean;
  missingInformationBlocking: boolean;
  restrictedActionDetected: boolean;
  permissionLayerOk: boolean;
  escalationRequired: boolean;
  humanReviewRequired: boolean;
  customerSafetyOk: boolean;
  businessSafetyOk: boolean;
  truthfulnessOk: boolean;
  transparencyOk: boolean;
  reasons: string[];
  reasoning: string;
};

// ---------------------------------------------------------------------------
// Policy Validator
// ---------------------------------------------------------------------------

export type PolicyCheckArea =
  | "COMPANY_POLICY"
  | "CARE_POLICY"
  | "KNOWLEDGE_POLICY"
  | "PERMISSION_LAYER"
  | "BUSINESS_RULES"
  | "RESPONSE_RULES"
  | "SAFETY_RULES";

export type PolicyCheck = { area: PolicyCheckArea; passed: boolean; reason: string };

export type PolicyResult = {
  compliant: boolean;
  checks: PolicyCheck[];
  violations: string[];
  reasoning: string;
};

// ---------------------------------------------------------------------------
// Escalation Resolver
// ---------------------------------------------------------------------------

export type EscalationTarget =
  | "NONE"
  | "CUSTOMER_SUPPORT"
  | "TECHNICAL_TEAM"
  | "SALES_TEAM"
  | "INSTITUTIONAL_SALES"
  | "FOUNDER_REVIEW"
  | "SAFETY_REVIEW"
  | "FUTURE_TEAM";

export type EscalationResult = {
  target: EscalationTarget;
  required: boolean;
  reason: string;
  triggeredBy: string[];
};

// ---------------------------------------------------------------------------
// Action Engine
// ---------------------------------------------------------------------------

export type ActionType =
  | "ANSWER_CUSTOMER"
  | "ASK_FOLLOW_UP_QUESTION"
  | "RECOMMEND_PRODUCT"
  | "RECOMMEND_CARE_WORKFLOW"
  | "RECOMMEND_KNOWLEDGE"
  | "ESCALATE"
  | "STOP_EXECUTION"
  | "COLLECT_INFORMATION"
  | "WAIT"
  /** Final Precedence Rule Refinement — a governed, honest refusal:
   * the customer explicitly asked for confidential formulation/
   * manufacturing information. Distinct from STOP_EXECUTION (which
   * customer-facing copy frames as "our team has been notified and will
   * follow up" — a promise of human follow-up this case must never make,
   * per the Founder's explicit "do not escalate unless existing policy
   * already requires it") and from ESCALATE (same reason). */
  | "DECLINE_CONFIDENTIAL";

/** "Return structured action objects." Never executed here — this is a
 * recommendation for a future integration layer to carry out. */
export type ActionResult = {
  action: ActionType;
  targetReferences: SourceReference[];
  reason: string;
  confidence: ConfidenceLevel;
};

// ---------------------------------------------------------------------------
// Response Composer — a blueprint, never customer language
// ---------------------------------------------------------------------------

export type ResponseBlueprint = {
  intent: string;
  toneGuidance: string[];
  requiredInformation: string[];
  knowledgeReferences: SourceReference[];
  careReferences: SourceReference[];
  suggestedStructure: string[];
  restrictions: string[];
  transparencyRequirements: string[];
  escalationNotice: string | null;
  safetyNotes: string[];
};

// ---------------------------------------------------------------------------
// Execution Package
// ---------------------------------------------------------------------------

export type ExecutionStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "ESCALATED"
  | "DEFERRED"
  | "NEEDS_MORE_INFORMATION"
  | "NEEDS_HUMAN_REVIEW"
  | "RESTRICTED";

/** "No customer-sensitive logging." Every field here is structural
 * metadata about the pipeline run itself, never message content. */
export type AuditMetadata = {
  executionTime: string;
  pipelineStages: string[];
  policyChecks: number;
  safetyChecks: number;
  versionReferences: string[];
  decisionReferences: string[];
  moduleReferences: string[];
  timestamp: string;
  actor: string;
};

export type ExecutionExplainability = {
  whyExecuted: string | null;
  whyBlocked: string | null;
  whyEscalated: string | null;
  policyTriggered: string[];
  safetyRuleTriggered: string[];
  contributingModules: string[];
};

export type ExecutionPackage = {
  decisionPackage: DecisionPackage;
  safety: SafetyResult;
  policy: PolicyResult;
  escalation: EscalationResult;
  action: ActionResult;
  responseBlueprint: ResponseBlueprint;
  executionStatus: ExecutionStatus;
  executionConfidence: ConfidenceLevel;
  executionMetadata: { clearanceLayer: PermissionLayer };
  audit: AuditMetadata;
  explainability: ExecutionExplainability;
  executionHints: Record<string, unknown>;
  generatedAt: string;
};

export type ExecutionInput = {
  decisionPackage: DecisionPackage;
  /** Defaults to "PUBLIC" — the most conservative assumption — when the
   * caller doesn't supply one. Never inferred as elevated. */
  clearanceLayer?: PermissionLayer;
  /** Final Precedence Rule Refinement — the caller's own raw message text,
   * threaded through only so the Action Engine can check it against the
   * existing confidentiality vocabulary before answering (never stored,
   * never re-derived, never used for anything else). `DecisionPackage`
   * itself carries no raw message field, so this is passed alongside it
   * rather than requiring a Module 6 change. Optional — omitted entirely
   * leaves every existing caller (tests, EIOS) byte-for-byte unaffected. */
  customerMessage?: string;
};
