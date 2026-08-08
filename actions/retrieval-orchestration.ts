"use server";

import { toErrorResponse } from "@/lib/errors";
import { runOrchestrationPlanSchema } from "@/lib/validations/retrieval";
import { runOrchestrationPlan } from "@/lib/retrieval/orchestration-plan";

/**
 * MUV Intelligence Factory V4 §4 — Retrieval Orchestration Layer (EP
 * Sprint 7). Deliberately separate from actions/retrieval.ts (Module 5's
 * own raw pipeline surface) rather than added to it — orchestration is a
 * distinct caller contract (tiered, budgeted, fail-closed-on-safety) built
 * ON TOP of Module 5, not a Module 5 operation itself.
 *
 * Caller-agnostic, matching Module 5's own actions/retrieval.ts: not
 * requireStaff()-gated. Clearance is still fully enforced — every result
 * inside `results` was already filtered by Module 5's own
 * resolveCallerClearance()/layerAllowed() inside runRetrievalPipeline; this
 * action adds no additional data exposure, only orchestration behavior on
 * top of already-cleared results.
 */
export async function getOrchestratedIntelligence(input: unknown) {
  try {
    const data = runOrchestrationPlanSchema.parse(input);
    const outcome = await runOrchestrationPlan(data);
    return { success: true as const, data: outcome };
  } catch (err) {
    return toErrorResponse(err);
  }
}
