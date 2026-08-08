import {
  proposeClassification,
  listPendingClassifications,
  mapTierToPermissionLayer,
} from "../lib/gateway/knowledge-governance";
import { kfDomainLayer } from "../lib/gateway/knowledge/authorization";
import { isToolEnabled, setToolEnabled, getRolloutState, invokeGatewayTool } from "../lib/gateway/security";
import { getGatewayMetricsSummary } from "../lib/gateway/observability/metrics";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Phase 6 (MUV AI Live
 * Activation), Stages 6.1/6.3/6.4/6.5. Same `scripts/verify-*.ts`
 * convention as every other permanent suite this project.
 *
 * Stage 6.2 (Provider Activation) is NOT covered here — it requires a
 * real API key in a real staging environment, which is a Founder
 * decision/action, not something this script can safely fabricate.
 *
 * Run: `npx tsx scripts/verify-live-activation.ts` (or
 * `npm run verify:live-activation`).
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

async function main() {
  // ---- Stage 6.1: Knowledge Governance — propose, list, never auto-promote ----
  const beforeLayer = kfDomainLayer("PRODUCT_KF");

  const proposal = await proposeClassification({
    targetType: "KF_DOMAIN",
    targetId: "PRODUCT_KF",
    proposedTier: "CUSTOMER",
    notes: "Verification test proposal — safe to leave PENDING_REVIEW.",
  });
  check(proposal.status === "PENDING_REVIEW", "governance: a new proposal starts PENDING_REVIEW", proposal.status);

  const pending = await listPendingClassifications();
  check(pending.some((p) => p.id === proposal.id), "governance: the new proposal appears in the pending list");

  const afterLayer = kfDomainLayer("PRODUCT_KF");
  check(afterLayer === beforeLayer, "governance: proposing a classification has ZERO effect on real enforcement (no automatic promotion)", { beforeLayer, afterLayer });

  check(mapTierToPermissionLayer("PUBLIC") === "PUBLIC", "governance: PUBLIC tier maps to PermissionLayer PUBLIC");
  check(mapTierToPermissionLayer("CUSTOMER") === "PUBLIC", "governance: CUSTOMER tier maps to PermissionLayer PUBLIC");
  check(mapTierToPermissionLayer("PARTNER") === "INTERNAL", "governance: PARTNER tier maps to PermissionLayer INTERNAL");
  check(mapTierToPermissionLayer("INTERNAL") === "INTERNAL", "governance: INTERNAL tier maps to PermissionLayer INTERNAL");
  check(mapTierToPermissionLayer("FOUNDER") === "CONFIDENTIAL", "governance: FOUNDER tier maps to PermissionLayer CONFIDENTIAL");
  check(mapTierToPermissionLayer("CONFIDENTIAL") === "CONFIDENTIAL", "governance: CONFIDENTIAL tier maps to PermissionLayer CONFIDENTIAL");

  // Re-proposing for the same target updates in place, never duplicates.
  const reproposal = await proposeClassification({ targetType: "KF_DOMAIN", targetId: "PRODUCT_KF", proposedTier: "PARTNER" });
  check(reproposal.id === proposal.id, "governance: re-proposing the same target updates the existing row, not a duplicate");
  const countForTarget = await prisma.knowledgeGovernanceClassification.count({ where: { targetType: "KF_DOMAIN", targetId: "PRODUCT_KF" } });
  check(countForTarget === 1, "governance: exactly one row exists per target", countForTarget);

  // ---- Stage 6.4: Progressive Rollout Framework ----
  check(isToolEnabled("commerce.searchProducts") === true, "rollout: the Stage 6.3 pilot tool is enabled by default");
  check(isToolEnabled("commerce.getMyWishlist") === false, "rollout: a CUSTOMER_ONLY commerce tool outside Stage 5's explicit list (wishlist) remains disabled");
  check(isToolEnabled("conversation.streamAssistantTurn") === false, "rollout: conversation tools remain disabled — that is Stage 6's own live-turn-path integration, not a rollout-flag flip");

  // AI Production Rollout v1.0, Stage 4 enabled the rest of the
  // GUEST_SAFE Commerce Intelligence catalog/read tools (Wave A + Wave
  // B), and Stage 5 enabled every CUSTOMER_ONLY Customer Intelligence
  // tool on its own explicit list — this suite's own job is only to
  // prove that no Conversation-domain tool was swept up in either
  // change (see scripts/verify-commerce-wave-rollout.ts and verify-
  // customer-wave-rollout.ts for each stage's own permanent coverage of
  // exactly which tools are enabled and why).
  const rolloutState = getRolloutState();
  const noConversationToolEnabled = rolloutState.filter((t) => t.enabled).every((t) => t.category !== "conversation");
  check(noConversationToolEnabled, "rollout: no Conversation-domain tool is enabled by any rollout stage so far", rolloutState.filter((t) => t.enabled).map((t) => t.name));

  setToolEnabled("commerce.getOffers", true);
  check(isToolEnabled("commerce.getOffers") === true, "rollout: setToolEnabled() can override a default for testing/rollout");
  setToolEnabled("commerce.getOffers", false);
  check(isToolEnabled("commerce.getOffers") === false, "rollout: override can be reverted");

  // A disabled-but-registered-and-guest-safe tool is still denied by the dispatcher.
  const disabledToolCall = await invokeGatewayTool("commerce.getOffers", [], { isGuest: true, identifier: "live-activation-test-1" });
  check(!disabledToolCall.success && disabledToolCall.error.code === "TOOL_NOT_ENABLED", "rollout: dispatcher denies a not-yet-enabled tool even though it's registered and guest-safe", disabledToolCall);

  // ---- Stage 6.3: Pilot Tool — real end-to-end execution ----
  // Storefront -> Gateway -> Dispatcher -> Commerce Intelligence -> Response
  const pilotResult = await invokeGatewayTool("commerce.searchProducts", [{ query: "muv", pageSize: 3 }], { isGuest: true, identifier: "live-activation-pilot-1" });
  check(pilotResult.success === true, "pilot: commerce.searchProducts executes end-to-end through the real dispatcher", pilotResult.success ? undefined : pilotResult);
  if (pilotResult.success) {
    const data = pilotResult.data as { success: boolean; data?: { items: unknown[] } };
    check(data.success === true, "pilot: the Commerce Intelligence response itself reports success");
    check(Array.isArray(data.data?.items) && (data.data?.items.length ?? 0) > 0, "pilot: real product search results were returned", data.data?.items?.length);
  }

  // Guest access to the pilot tool works (it's GUEST_SAFE).
  const guestPilotResult = await invokeGatewayTool("commerce.searchProducts", [{ query: "floor", pageSize: 1 }], { isGuest: true, identifier: "live-activation-pilot-2" });
  check(guestPilotResult.success === true, "pilot: guest callers can reach the pilot tool");

  // ---- Stage 6.5: Monitoring during pilot traffic ----
  const usageEventsBefore = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "COMMERCE_TOOL_USAGE" } });
  await invokeGatewayTool("commerce.searchProducts", [{ query: "rose", pageSize: 1 }], { isGuest: true, identifier: "live-activation-monitoring-1" });
  const usageEventsAfter = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "COMMERCE_TOOL_USAGE" } });
  check(usageEventsAfter > usageEventsBefore, "monitoring: real pilot traffic produces a real COMMERCE_TOOL_USAGE event");

  const securityEvents = await prisma.gatewayObservabilityEvent.findMany({ where: { source: "security" }, orderBy: { createdAt: "desc" }, take: 5 });
  check(securityEvents.length > 0, "monitoring: security checks (allow-list/rollout/rate-limit denials) are visible in the event log");

  const summary = await getGatewayMetricsSummary();
  check(summary.totalEvents > 0, "monitoring: metrics summary reflects real pilot-traffic volume", summary.totalEvents);
  check(typeof summary.byEventType.COMMERCE_TOOL_USAGE === "number" && summary.byEventType.COMMERCE_TOOL_USAGE > 0, "monitoring: metrics break out real commerce tool usage counts");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
