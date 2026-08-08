import { runRuntimePipeline } from "@/lib/runtime/runtime-orchestrator";
import type { RuntimeTurnResult } from "@/lib/runtime/types";
import type { ExecutionStatus } from "@/lib/execution/types";
import type { ExperienceRequest, ExperienceSessionRecord, WebsiteExperienceSegment, WebsiteExperienceView } from "./types";

/**
 * DEPRECATED (Phase 5.2.1, Foundation Stabilization) — this is the bridge
 * into the deprecated `lib/runtime/*` pipeline (see that file's own
 * header). `experience-orchestrator.ts`'s call into this adapter is
 * still gated behind both `RUNTIME_PIPELINE_ENABLED` and
 * `WEBSITE_RUNTIME_INTEGRATION_ENABLED` (both default `false`, unset in
 * every environment) — this file has never executed in production and
 * is not on the new canonical `lib/gateway/*` path. Kept only for
 * backward compatibility; not modified.
 */

/**
 * MUV AI — Stage 8, Production Integration, Phase 4 (Website Integration).
 *
 * The "channel adapter" for the new `lib/runtime/*` pipeline — the same
 * "channel-neutral core, per-channel adapter" separation
 * `website-channel-adapter.ts` already established for Module 8's own
 * `ExperienceResponse`. This one converts a `RuntimeTurnResult` (Stage 6C's
 * shape) into the exact same `WebsiteExperienceView` the legacy path
 * produces, so `components/muv-ai/use-muv-ai-chat.ts` and every other
 * consumer of `orchestrateExperience()`'s return value need ZERO changes
 * regardless of which path actually ran.
 *
 * This function does NOT manage session/memory persistence itself —
 * `experience-orchestrator.ts` does that once, identically, for whichever
 * path ran, so the two paths can never diverge in how they touch a
 * session record.
 *
 * Belt-and-suspenders safety: even though the runtime pipeline already
 * runs its own full Safety Runtime verification internally, this adapter
 * independently re-checks `result.safety.overallPassed` before building
 * any customer-facing view and throws if it did not pass — the caller
 * (`experience-orchestrator.ts`) catches this and falls back to the
 * legacy path rather than ever showing a customer a response this
 * runtime's own safety check refused to approve.
 */

function deriveExecutionStatus(result: RuntimeTurnResult): ExecutionStatus {
  if (!result.privacy.safeToProceed) return "BLOCKED";
  if (result.decision.requiresHumanApproval) return "NEEDS_HUMAN_REVIEW";
  if (result.intent.requiresClarification) return "NEEDS_MORE_INFORMATION";
  return "EXECUTED";
}

export async function orchestrateExperienceViaRuntime(
  request: ExperienceRequest,
  session: ExperienceSessionRecord
): Promise<WebsiteExperienceView> {
  const result = await runRuntimePipeline({
    turnId: `turn-${Date.now()}`,
    sessionId: session.id,
    customerMessage: request.customerMessage,
    customerGoal: request.customerGoal,
    memory: session.memoryItems,
    // Hardcoded, exactly like the legacy path's own ExecutionInput —
    // nothing about a customer-originated request may ever resolve to a
    // more permissive clearance than this.
    clearanceLayer: "PUBLIC",
  });

  if (!result.safety.overallPassed) {
    throw new Error(`Runtime pipeline turn failed post-generation safety verification: ${result.safety.blockedReasons.join("; ")}`);
  }

  const segments: WebsiteExperienceSegment[] = [{ kind: "MESSAGE", content: result.response.responseText }];

  for (const ref of result.response.citationsIncluded) {
    segments.push({ kind: "REFERENCE_CARD", content: ref.label ?? ref.id, meta: { referenceType: ref.type, id: ref.id } });
  }

  if (result.intent.requiresClarification && result.intent.clarificationQuestion) {
    segments.push({ kind: "FOLLOW_UP_QUESTION", content: result.intent.clarificationQuestion });
  }

  if (result.decision.requiresHumanApproval) {
    segments.push({ kind: "ESCALATION_NOTICE", content: "A team member will follow up with you shortly." });
  }

  const executionStatus = deriveExecutionStatus(result);

  return {
    sessionId: session.id,
    segments,
    requiresHandoff: result.decision.requiresHumanApproval,
    allowFollowUp: executionStatus !== "BLOCKED",
    executionStatus,
    generatedAt: result.generatedAt,
  };
}
