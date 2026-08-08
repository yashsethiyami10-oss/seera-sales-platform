"use server";

import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/production/feature-flags";
import { runtimeTurnInputSchema } from "@/lib/validations/runtime";
import { runRuntimePipeline } from "@/lib/runtime/runtime-orchestrator";
import { getActiveFounderDecisions } from "@/lib/runtime/founder-decision-registry";

/**
 * MUV AI — Stage 6C Runtime Engineering. The only entry point into
 * `lib/runtime/*`. Every action here is `requireStaff()`-gated (same
 * "internal reasoning infrastructure, not yet customer-facing" precedent
 * Module 6's `actions/intelligence.ts` set), and `runRuntimeTurn` itself is
 * additionally gated behind the `RUNTIME_PIPELINE_ENABLED` feature flag
 * (default `false`) per FD-AIC-003 (Production Protection) — "no new
 * runtime module may go live until... explicit Founder go-live
 * authorization is issued." Flipping that flag true only unblocks this
 * staff-only internal testing surface; the live customer-facing
 * `orchestrateExperience()` path never reads it and is unaffected.
 */

export async function runRuntimeTurn(input: unknown) {
  try {
    await requireStaff();
    const flags = getFeatureFlags();
    if (!flags.RUNTIME_PIPELINE_ENABLED) {
      throw new ForbiddenError("Runtime pipeline is not enabled (RUNTIME_PIPELINE_ENABLED feature flag is off — see FD-AIC-003, Production Protection).");
    }
    const data = runtimeTurnInputSchema.parse(input);
    const result = await runRuntimePipeline(data);
    return { success: true as const, data: { result } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Read-only — for internal verification/testing, not flag-gated (it never
 * runs the pipeline, only inspects what already ran). */
export async function getRuntimeAuditTrail(turnId: string) {
  try {
    await requireStaff();
    const entries = await prisma.runtimeAuditLog.findMany({ where: { turnId }, orderBy: { createdAt: "desc" } });
    return { success: true as const, data: { entries } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getRuntimeFeatureFlags() {
  try {
    await requireStaff();
    return { success: true as const, data: { flags: getFeatureFlags() } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getFounderDecisionRegistrySnapshot() {
  try {
    await requireStaff();
    const decisions = await getActiveFounderDecisions();
    return { success: true as const, data: { decisions } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getLearningCandidateQueue(status?: "OPEN" | "REVIEWED_APPROVED" | "REVIEWED_REJECTED" | "DEFERRED") {
  try {
    await requireStaff();
    const candidates = await prisma.learningCandidate.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { success: true as const, data: { candidates } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
