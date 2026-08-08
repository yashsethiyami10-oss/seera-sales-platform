"use server";

import { requireStaff } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { resolveCallerClearance } from "@/lib/retrieval/permissions";
import {
  buildIntelligenceSchema,
  evaluatePrioritySchema,
  buildContextSchema,
  resolveMemorySchema,
  evaluateEmotionSchema,
  evaluateCareSchema,
  buildDecisionSchema,
  buildDecisionPackageSchema,
  evaluateConfidenceSchema,
  explainDecisionSchema,
} from "@/lib/validations/intelligence";
import { buildIntelligence as runBuildIntelligence } from "@/lib/intelligence/intelligence-orchestrator";
import { evaluatePriority as runEvaluatePriority } from "@/lib/intelligence/priority-engine";
import { buildContext as runBuildContext } from "@/lib/intelligence/context-engine";
import { resolveMemory as runResolveMemory } from "@/lib/intelligence/memory-resolver";
import { evaluateEmotion as runEvaluateEmotion } from "@/lib/intelligence/eq-engine";
import { evaluateCare as runEvaluateCare } from "@/lib/intelligence/cq-engine";
import { buildDecision as runBuildDecision } from "@/lib/intelligence/decision-engine";
import { buildDecisionPackage as runBuildDecisionPackage } from "@/lib/intelligence/decision-package";
import { evaluateConfidence as runEvaluateConfidence } from "@/lib/intelligence/confidence-engine";
import { explainDecision as runExplainDecision } from "@/lib/intelligence/explainability";

/**
 * MUV AI — Intelligence Core (Module 6). Every action is
 * `requireStaff()`-gated — unlike Module 5's deliberately anyone-can-call
 * design, this module is internal reasoning infrastructure for a
 * not-yet-built Module 7 (Execution Core), not a direct customer-facing
 * surface (see docs/phase-6/intelligence-core/architecture.md for the
 * full reasoning). All 10 actions are deterministic and read-only — none
 * calls `.create`/`.update`/`.delete` on any content model; the one
 * database touch anywhere in this module's call graph is Module 5's own
 * best-effort retrieval-telemetry write, reused unmodified, not a new
 * mutation this module introduces.
 */

export async function buildIntelligence(input: unknown) {
  try {
    await requireStaff();
    const request = buildIntelligenceSchema.parse(input);
    const { decisionPackage, clearanceLayer } = await runBuildIntelligence(request, true);
    return { success: true as const, data: { decisionPackage, clearanceLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function evaluatePriority(input: unknown) {
  try {
    await requireStaff();
    const data = evaluatePrioritySchema.parse(input);
    const result = runEvaluatePriority(data.retrievedKnowledge, data);
    return { success: true as const, data: { priority: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function buildContext(input: unknown) {
  try {
    await requireStaff();
    const data = buildContextSchema.parse(input);
    const result = runBuildContext(data.retrievedKnowledge, data);
    return { success: true as const, data: { context: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function resolveMemory(input: unknown) {
  try {
    await requireStaff();
    const data = resolveMemorySchema.parse(input);
    const clearance = await resolveCallerClearance();
    const result = runResolveMemory(data.memory, clearance);
    return { success: true as const, data: { memory: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function evaluateEmotion(input: unknown) {
  try {
    await requireStaff();
    const data = evaluateEmotionSchema.parse(input);
    const result = runEvaluateEmotion(data.customerMessage);
    return { success: true as const, data: { eq: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function evaluateCare(input: unknown) {
  try {
    await requireStaff();
    const data = evaluateCareSchema.parse(input);
    const result = runEvaluateCare(data.priority, data.eq, data.context);
    return { success: true as const, data: { cq: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function buildDecision(input: unknown) {
  try {
    await requireStaff();
    const data = buildDecisionSchema.parse(input);
    const result = runBuildDecision(data.priority, data.context, data.memory, data.eq, data.cq);
    return { success: true as const, data: { decision: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function buildDecisionPackage(input: unknown) {
  try {
    await requireStaff();
    const data = buildDecisionPackageSchema.parse(input);
    const confidence = runEvaluateConfidence(
      data.priority.evidence.length + data.eq.evidence.length + data.cq.evidence.length,
      8,
      data.decision.informationStillNeeded
    );
    const explainability = runExplainDecision(data.priority, data.eq, data.cq, data.decision, data.reasoningTrace);
    const result = runBuildDecisionPackage({ ...data, confidence, explainability, includeReasoningTrace: true });
    return { success: true as const, data: { decisionPackage: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function evaluateConfidence(input: unknown) {
  try {
    await requireStaff();
    const data = evaluateConfidenceSchema.parse(input);
    const result = runEvaluateConfidence(data.evidenceCount, data.maxPossibleEvidence, data.missingInformation);
    return { success: true as const, data: { confidence: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function explainDecision(input: unknown) {
  try {
    await requireStaff();
    const data = explainDecisionSchema.parse(input);
    const result = runExplainDecision(data.priority, data.eq, data.cq, data.decision, data.reasoningTrace);
    return { success: true as const, data: { explainability: result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
