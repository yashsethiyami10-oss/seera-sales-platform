"use server";

import { requireStaff } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import {
  validateSafetySchema,
  validatePolicySchema,
  resolveEscalationSchema,
  buildActionSchema,
  composeResponseBlueprintSchema,
  buildExecutionPackageSchema,
  executePipelineSchema,
  explainExecutionSchema,
} from "@/lib/validations/execution";
import { validateSafety as runValidateSafety } from "@/lib/execution/safety-engine";
import { validatePolicy as runValidatePolicy } from "@/lib/execution/policy-validator";
import { resolveEscalation as runResolveEscalation } from "@/lib/execution/escalation-resolver";
import { buildAction as runBuildAction } from "@/lib/execution/action-engine";
import { composeResponseBlueprint as runComposeResponseBlueprint } from "@/lib/execution/response-composer";
import { buildExecutionPackage as runBuildExecutionPackage, buildAuditMetadata } from "@/lib/execution/execution-package";
import { executePipeline as runExecutePipeline } from "@/lib/execution/execution-orchestrator";
import { explainExecution as runExplainExecution } from "@/lib/execution/execution-explainability";

/**
 * MUV AI — Execution Core (Module 7). Every action is `requireStaff()`-
 * gated, the same rationale as Module 6: this is internal policy/safety
 * infrastructure, not a direct customer-facing surface. All 8 actions are
 * deterministic and synchronous — none touches a database or an external
 * integration; this module only computes over a caller-supplied Decision
 * Package (Module 6's output type) and a clearance layer. No mutation
 * anywhere in this module's call graph, unlike Module 6, which still had
 * Module 5's best-effort retrieval-telemetry write somewhere upstream of
 * it — Execution Core doesn't call Module 5 or Module 6 at all, it only
 * consumes their already-produced output types.
 */

export async function validateSafety(input: unknown) {
  try {
    await requireStaff();
    const data = validateSafetySchema.parse(input);
    const clearanceLayer = data.clearanceLayer ?? "PUBLIC";
    const result = runValidateSafety(data.decisionPackage, clearanceLayer);
    return { success: true as const, data: { safety: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function validatePolicy(input: unknown) {
  try {
    await requireStaff();
    const data = validatePolicySchema.parse(input);
    const clearanceLayer = data.clearanceLayer ?? "PUBLIC";
    const result = runValidatePolicy(data.decisionPackage, data.safety, clearanceLayer);
    return { success: true as const, data: { policy: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function resolveEscalation(input: unknown) {
  try {
    await requireStaff();
    const data = resolveEscalationSchema.parse(input);
    const result = runResolveEscalation(data.decisionPackage, data.safety, data.policy);
    return { success: true as const, data: { escalation: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function buildAction(input: unknown) {
  try {
    await requireStaff();
    const data = buildActionSchema.parse(input);
    const result = runBuildAction(data.decisionPackage, data.safety, data.policy, data.escalation);
    return { success: true as const, data: { action: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function composeResponseBlueprint(input: unknown) {
  try {
    await requireStaff();
    const data = composeResponseBlueprintSchema.parse(input);
    const result = runComposeResponseBlueprint(data.decisionPackage, data.safety, data.policy, data.escalation, data.action);
    return { success: true as const, data: { responseBlueprint: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function buildExecutionPackage(input: unknown) {
  try {
    await requireStaff();
    const data = buildExecutionPackageSchema.parse(input);
    const clearanceLayer = data.clearanceLayer ?? "PUBLIC";
    const responseBlueprint = runComposeResponseBlueprint(data.decisionPackage, data.safety, data.policy, data.escalation, data.action);
    const explainability = runExplainExecution(data.safety, data.policy, data.escalation, data.action, data.decisionPackage);
    const audit = buildAuditMetadata(data.decisionPackage, data.policy, [
      "safety-engine", "policy-validator", "escalation-resolver", "action-engine", "response-composer",
    ]);
    const result = runBuildExecutionPackage({
      decisionPackage: data.decisionPackage,
      safety: data.safety,
      policy: data.policy,
      escalation: data.escalation,
      action: data.action,
      responseBlueprint,
      clearanceLayer,
      audit,
      explainability,
    });
    return { success: true as const, data: { executionPackage: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function executePipeline(input: unknown) {
  try {
    await requireStaff();
    const data = executePipelineSchema.parse(input);
    const result = runExecutePipeline({ decisionPackage: data.decisionPackage, clearanceLayer: data.clearanceLayer });
    return { success: true as const, data: { executionPackage: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function explainExecution(input: unknown) {
  try {
    await requireStaff();
    const data = explainExecutionSchema.parse(input);
    const result = runExplainExecution(data.safety, data.policy, data.escalation, data.action, data.decisionPackage);
    return { success: true as const, data: { explainability: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
