import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getFeatureFlags } from "@/lib/production/feature-flags";
import { buildIntelligence } from "@/lib/intelligence/intelligence-orchestrator";
import { executePipeline } from "@/lib/execution/execution-orchestrator";
import { getSession, touchSession } from "./session-manager";
import { buildExperienceResponse } from "./response-model";
import { adaptForWebsite } from "./website-channel-adapter";
import { orchestrateExperienceViaRuntime } from "./runtime-channel-adapter";
import { runProductSearchPilotTurn } from "@/lib/gateway/pilot/product-search-pilot";
import { isAiKillSwitchActive, isRolloutEligible } from "@/lib/gateway/config";
import { emitGatewayEvent, generateRequestId } from "@/lib/gateway/observability";
import { resolveCallerClearance } from "@/lib/retrieval/permissions";
import type { ExperienceRequest, ExperienceSessionRecord, MemoryItem, WebsiteExperienceView } from "./types";

/**
 * MUV AI — Experience Platform (Module 8) Experience Orchestrator.
 *
 * Implements the Frozen Flow exactly: Customer Input → Experience Request
 * → Modules 5–7 → Execution Package → Experience Orchestrator → Channel
 * Adapter → Experience Response.
 *
 * "This module must not retrieve knowledge" / "must not perform
 * intelligence reasoning": this function never touches Module 5 directly
 * (Module 6's own `buildIntelligence()` already reuses Module 5's
 * retrieval pipeline internally — the same "collapsed box" the Frozen Flow
 * diagram itself draws as one step, "Modules 5–7"). Module 6's and
 * Module 7's own *library* functions are called directly, unmodified —
 * never their Server Actions, which are `requireStaff()`-gated (internal
 * reasoning/policy infrastructure — see their own architecture.md files).
 * Module 8's own actions must be callable by customers/anonymous website
 * visitors, so calling the library functions directly (mirroring Module
 * 5's own customer-facing RBAC shape, not Module 6/7's staff-only one) is
 * the only way this module's actions can work at all — see
 * `docs/phase-8/experience-platform/architecture.md`.
 *
 * "Must not alter decisions or bypass Module 7 safety": this function
 * never inspects or branches on `decisionPackage`/`executionPackage`
 * fields itself — it passes them straight into `buildExperienceResponse()`
 * (Module 8's own single point of customer-safe rendering) and trusts
 * that function's own safety discipline entirely.
 *
 * `clearanceLayer` is always hardcoded to `"PUBLIC"` here — customer
 * -originated Experience Requests never receive anything other than the
 * most conservative clearance passed into Module 7's Safety Engine. This
 * is deliberate and non-configurable from this function's caller: nothing
 * about a customer's own message should ever be able to unlock an
 * INTERNAL/CONFIDENTIAL-gated permission-layer check.
 *
 * STAGE 8 ADDITION (Production Integration, Phase 4 — Website
 * Integration): `orchestrateExperience()` now has two possible paths.
 * `orchestrateExperienceLegacy()` below is the ORIGINAL Frozen Flow
 * described above, extracted verbatim into its own function — not one
 * line of its logic changed. It remains the default, and the ONLY path
 * that ever runs unless BOTH `RUNTIME_PIPELINE_ENABLED` AND
 * `WEBSITE_RUNTIME_INTEGRATION_ENABLED` feature flags are true (both
 * default `false`). When both are true, the new `lib/runtime/*` pipeline
 * (Stage 6C-6E, now with the Customer Care Knowledge Factory wired in —
 * Stage 8 Phase 2) runs instead, via `orchestrateExperienceViaRuntime()`
 * (`runtime-channel-adapter.ts`) — and if THAT throws for any reason
 * (including its own internal safety verification refusing the turn),
 * this function catches it and falls back to the legacy path rather than
 * ever surfacing an error to a customer that the legacy path would not
 * have produced. This is the concrete mechanism behind "no regression to
 * the existing customer experience": with both flags at their default
 * `false`, this function's behavior is byte-for-byte identical to before
 * Stage 8; with the flags on, a runtime-path failure degrades to the
 * pre-Stage-8 behavior rather than a broken experience.
 *
 * PHASE 6.1 ADDITION (Controlled Product Search Pilot): a third,
 * independent branch, gated by its own `PILOT_PRODUCT_SEARCH_ENABLED`
 * flag (default false) and checked only when the Stage 8 runtime flags
 * above are NOT both on. Routes through `lib/gateway/pilot/product-
 * search-pilot.ts`, which itself calls the Security Dispatcher
 * (`invokeGatewayTool`) for the one allow-listed pilot capability
 * (`commerce.searchProducts`) and the Provider Adapter for a grounded
 * reply. Same fallback discipline as the runtime pipeline: any failure
 * inside the pilot (no configured provider, tool denial, generation
 * error) is caught here and degrades to `orchestrateExperienceLegacy`
 * unchanged — a pilot failure is never visible to the customer as
 * anything other than the pre-existing deterministic reply.
 *
 * Production Rollout v1.0, Stage 13 (Controlled Production Release)
 * added the final condition: `isRolloutEligible()` (`lib/gateway/
 * config.ts`) — deterministic percentage bucketing plus an internal
 * allow-list, keyed by the caller's real customerId when logged in or
 * their session id as a guest. `GATEWAY_ROLLOUT_PERCENTAGE` defaults to
 * 100 (unrestricted) so this is a no-op until a production deploy step
 * deliberately narrows it — the actual "internal/founder allow-list
 * first, then gradual expansion" mechanism this stage's own release
 * plan calls for.
 */

const MAX_SESSION_MEMORY_ITEMS = 20;

export async function orchestrateExperience(request: ExperienceRequest): Promise<WebsiteExperienceView> {
  const session = await getSession(request.sessionId);
  if (session.status !== "ACTIVE") {
    throw new AppError("This session is no longer active.", 410, "SESSION_INACTIVE");
  }

  const flags = getFeatureFlags();
  let view: WebsiteExperienceView;

  if (flags.RUNTIME_PIPELINE_ENABLED && flags.WEBSITE_RUNTIME_INTEGRATION_ENABLED) {
    try {
      view = await orchestrateExperienceViaRuntime(request, session);
    } catch (err) {
      logger.error("experience:runtime-path-failed-falling-back-to-legacy", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
      view = await orchestrateExperienceLegacy(request, session);
    }
  } else if (flags.PILOT_PRODUCT_SEARCH_ENABLED && !isAiKillSwitchActive() && isRolloutEligible(session.customerId ?? session.id)) {
    try {
      view = await runProductSearchPilotTurn(request, session);
    } catch (err) {
      logger.error("experience:pilot-product-search-failed-falling-back-to-legacy", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Production Rollout v1.0, Stage 9 — a fallback activation is a
      // real operational event, not just an app-log line. Uses the
      // existing TOOL_ERROR event type (no schema/enum change — the
      // frozen Observability architecture is untouched) with
      // `metadata.fallback: true` as the distinguishing marker a
      // dashboard/metrics query can filter on.
      void emitGatewayEvent({
        requestId: generateRequestId(),
        eventType: "TOOL_ERROR",
        severity: "WARN",
        source: "gateway",
        message: "Pilot fell back to the legacy deterministic path",
        metadata: { fallback: true, capability: "product-search-pilot" },
      });
      view = await orchestrateExperienceLegacy(request, session);
    }
  } else {
    view = await orchestrateExperienceLegacy(request, session);
  }

  // Shared, single point of session/memory persistence — both paths reach
  // here through the same code, so they can never diverge in how they
  // touch a session record. Unchanged from the pre-Stage-8 logic.
  const newMemoryItem: MemoryItem = {
    id: `turn-${Date.now()}`,
    type: "CONVERSATION",
    content: request.customerMessage,
    layer: "PUBLIC",
    createdAt: new Date().toISOString(),
  };
  const updatedMemory = [...session.memoryItems, newMemoryItem].slice(-MAX_SESSION_MEMORY_ITEMS);
  await touchSession(session.id, updatedMemory);

  return view;
}

/** The original, pre-Stage-8 Frozen Flow — extracted unchanged from what
 * was previously the body of `orchestrateExperience()` itself. Still the
 * default and only path unless both Stage 8 feature flags are on. */
async function orchestrateExperienceLegacy(request: ExperienceRequest, session: ExperienceSessionRecord): Promise<WebsiteExperienceView> {
  // Stage: Modules 5-7 (collapsed per the Frozen Flow — Module 6 reuses
  // Module 5 internally; Module 8 never calls Module 5 directly)
  const { decisionPackage } = await buildIntelligence(
    {
      retrieval: { keywords: request.customerMessage },
      customerMessage: request.customerMessage,
      customerGoal: request.customerGoal,
      conversationContext: session.memoryItems.map((m) => m.content).join(" "),
      memory: session.memoryItems,
    },
    false // never expose Module 6's staff-only reasoning trace on this customer-facing path
  );

  const executionPackage = executePipeline({
    decisionPackage,
    // Unchanged by Block B1 below — the Safety Engine's own clearance stays
    // hardcoded PUBLIC for every caller, staff included. Nothing about who
    // is asking ever unlocks a different retrieval/safety outcome; only the
    // rendering step immediately below can additionally surface content
    // that was already retrieved under that same PUBLIC-clearance decision.
    clearanceLayer: "PUBLIC",
    // Final Precedence Rule Refinement — read-only: the Action Engine only
    // checks this against the existing confidentiality vocabulary before
    // deciding whether to answer; nothing about retrieval or safety changes.
    customerMessage: request.customerMessage,
  });

  // Founder Validation & Safe UAT Activation, Block B1 — "full governed
  // answer content, Founder/UAT clearance only." `resolveCallerClearance()`
  // self-resolves via a fresh `auth()` call (Module 5's own, already-tested
  // primitive — see lib/retrieval/permissions.ts); it is never derived from
  // anything the client sent. An ordinary customer/anonymous/guest turn
  // resolves to CUSTOMER/ANONYMOUS here and `governedContent` stays
  // undefined, so `buildExperienceResponse()` behaves exactly as it did
  // before this block existed.
  const clearance = await resolveCallerClearance();
  const governedContent = clearance.role === "ADMIN" || clearance.role === "STAFF" ? decisionPackage.context.retrievedKnowledge : undefined;

  // Stage: Experience Orchestrator's own output — the channel-neutral Experience Response
  const experienceResponse = buildExperienceResponse(session.id, executionPackage, governedContent);

  // Stage: Channel Adapter -> Experience Response
  return adaptForWebsite(experienceResponse);
}
