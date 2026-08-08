import type { DecisionPackage } from "@/lib/intelligence/types";
import type { PermissionLayer, PolicyCheck, PolicyResult, SafetyResult } from "./types";

/**
 * MUV AI — Execution Core (Module 7) Policy Validator.
 *
 * "Policy Validator never modifies decisions. It only validates." Every
 * check below reads the Decision Package, the Safety Result (already
 * computed by the higher-authority Safety Engine), and the caller's
 * clearance — it returns a structured `PolicyResult`, and neither this
 * function nor its caller ever writes back into the Decision Package or
 * the Safety Result.
 *
 * Seven fixed check areas, exactly as named in the module prompt.
 */

export function validatePolicy(decisionPackage: DecisionPackage, safety: SafetyResult, clearanceLayer: PermissionLayer): PolicyResult {
  const checks: PolicyCheck[] = [
    {
      area: "COMPANY_POLICY",
      passed: !(decisionPackage.priority.category === "SAFETY" && !safety.escalationRequired),
      reason: "A SAFETY-category priority must be flagged for escalation under company policy.",
    },
    {
      area: "CARE_POLICY",
      passed: !decisionPackage.cqSummary.escalationNeed || decisionPackage.escalationRecommendation,
      reason: "If Care Quotient flags an escalation need, the Decision Package's own escalation recommendation must agree.",
    },
    {
      area: "KNOWLEDGE_POLICY",
      passed: decisionPackage.outstandingQuestions.length === decisionPackage.requiredInformation.length,
      reason: "Outstanding questions and required information must stay consistent with each other.",
    },
    {
      area: "PERMISSION_LAYER",
      passed: safety.permissionLayerOk,
      reason: "Permission layer sufficiency is determined once, by the Safety Engine, and reflected here rather than re-derived.",
    },
    {
      area: "BUSINESS_RULES",
      passed: !(decisionPackage.priority.category === "BUSINESS_CRITICAL" && clearanceLayer === "PUBLIC"),
      reason: "Business-critical situations require at least INTERNAL clearance to validate for auto-execution.",
    },
    {
      area: "RESPONSE_RULES",
      passed: !decisionPackage.cqSummary.transparencyNeeded || decisionPackage.decision.decisionReason.length > 0,
      reason: "If transparency is needed, a documented decision reason must exist to build a transparent response from.",
    },
    {
      area: "SAFETY_RULES",
      passed: safety.outcome !== "BLOCKED" && safety.outcome !== "RESTRICTED",
      reason: "Policy cannot certify a request the Safety Engine has already blocked or restricted.",
    },
  ];

  const violations = checks.filter((c) => !c.passed).map((c) => c.area);
  const compliant = violations.length === 0;
  const reasoning = compliant
    ? "All 7 policy areas passed validation."
    : `${violations.length} of 7 policy area(s) failed: ${violations.join(", ")}.`;

  return { compliant, checks, violations, reasoning };
}
