import * as CommerceApi from "@/lib/gateway/commerce";
import * as CustomerApi from "@/lib/gateway/customer";
import * as ConversationApi from "@/lib/gateway/conversation";
import { checkToolAccess } from "./access-control";
import { checkToolRateLimit } from "./rate-limit";
import { isToolEnabled } from "./rollout";
import { isToolKillSwitchActive } from "@/lib/gateway/config";
import { emitGatewayEvent, generateRequestId } from "@/lib/gateway/observability";

/**
 * MUV AI Gateway — Phase 5.7, the real enforcement point. Everything in
 * `tool-registry.ts`/`access-control.ts`/`rate-limit.ts`/`rollout.ts` is
 * policy; this is where that policy is actually applied before a tool
 * ever runs — "per-tool authorization" and "guests may only access
 * explicitly guest-safe commerce functions" are enforced HERE, not just
 * documented in the registry.
 *
 * Phase 6.4 (Progressive Rollout Framework) added the `isToolEnabled()`
 * check below — a tool can be fully registered and access-correct while
 * still not yet rolled out. Per Stage 6.4's explicit "do not enable
 * additional tools yet," only `commerce.searchProducts` (the Stage 6.3
 * pilot) is enabled by default; every other registered tool is now
 * correctly denied here even though it was already callable before this
 * phase — this is a real, intentional narrowing of what `invokeGatewayTool`
 * will run, not a regression.
 *
 * Not called by `runAiGatewayTurn` or wired into the live turn path —
 * same status as every other Wave 1/2 module. This is the calling
 * convention a future real tool-invocation step (e.g. LLM function
 * calling, once live generation is ever activated) would use instead of
 * importing `commerceApi`/`customerApi`/`conversationApi` directly.
 *
 * Production Rollout v1.0, Stage 1 added one more check ahead of
 * everything above: `isToolKillSwitchActive()` (`lib/gateway/config.ts`)
 * — a single emergency stop for the whole tool-execution layer,
 * independent of the per-tool allow-list/rollout state this file already
 * enforced.
 */

type ToolFunction = (...args: unknown[]) => unknown;

const TOOL_FUNCTIONS: Record<string, ToolFunction> = {
  "commerce.searchProducts": CommerceApi.searchProducts as ToolFunction,
  "commerce.getProduct": CommerceApi.getProduct as ToolFunction,
  "commerce.getCategory": CommerceApi.getCategory as ToolFunction,
  "commerce.getProductVariants": CommerceApi.getProductVariants as ToolFunction,
  "commerce.getAvailability": CommerceApi.getAvailability as ToolFunction,
  "commerce.getPricing": CommerceApi.getPricing as ToolFunction,
  "commerce.getOffers": CommerceApi.getOffers as ToolFunction,
  "commerce.compareProducts": CommerceApi.compareProducts as ToolFunction,
  "commerce.getRecommendations": CommerceApi.getRecommendations as ToolFunction,
  "commerce.getRelatedProducts": CommerceApi.getRelatedProducts as ToolFunction,
  "commerce.priceCart": CommerceApi.priceCart as ToolFunction,
  "commerce.getShoppingGuidance": CommerceApi.getShoppingGuidance as ToolFunction,
  "commerce.getCareRecommendations": CommerceApi.getCareRecommendations as ToolFunction,
  "commerce.getSurfaceRecommendations": CommerceApi.getSurfaceRecommendations as ToolFunction,
  "commerce.getStainRecommendations": CommerceApi.getStainRecommendations as ToolFunction,
  "commerce.getFragranceRecommendations": CommerceApi.getFragranceRecommendations as ToolFunction,
  "commerce.getMyRecentlyViewed": CommerceApi.getMyRecentlyViewed as ToolFunction,
  "commerce.recordProductViewed": CommerceApi.recordProductViewed as ToolFunction,
  "commerce.getMyWishlist": CommerceApi.getMyWishlist as ToolFunction,
  "commerce.addWishlistItem": CommerceApi.addWishlistItem as ToolFunction,
  "commerce.removeWishlistItem": CommerceApi.removeWishlistItem as ToolFunction,
  "commerce.isWishlisted": CommerceApi.isWishlisted as ToolFunction,

  "customer.getMyOrdersList": CustomerApi.getMyOrdersList as ToolFunction,
  "customer.getOrder": CustomerApi.getOrder as ToolFunction,
  "customer.getOrderTracking": CustomerApi.getOrderTracking as ToolFunction,
  "customer.getPurchaseHistory": CustomerApi.getPurchaseHistory as ToolFunction,
  "customer.getProfile": CustomerApi.getProfile as ToolFunction,
  "customer.getAddresses": CustomerApi.getAddresses as ToolFunction,
  "customer.getSavedPreferences": CustomerApi.getSavedPreferences as ToolFunction,
  "customer.getReturnRequests": CustomerApi.getReturnRequests as ToolFunction,
  "customer.getRefundStatus": CustomerApi.getRefundStatus as ToolFunction,
  "customer.getMyConversations": CustomerApi.getMyConversations as ToolFunction,
  "customer.getMyConversationMemory": CustomerApi.getMyConversationMemory as ToolFunction,

  "conversation.recoverConversation": ConversationApi.recoverConversation as ToolFunction,
  "conversation.getConversationLifecycle": ConversationApi.getConversationLifecycle as ToolFunction,
  "conversation.getConversationMetadata": ConversationApi.getConversationMetadata as ToolFunction,
  "conversation.getContextWindow": ConversationApi.getContextWindow as ToolFunction,
  "conversation.getConversationSummary": ConversationApi.getConversationSummary as ToolFunction,
  "conversation.streamAssistantTurn": ConversationApi.streamAssistantTurn as ToolFunction,
  "conversation.retryAssistantTurn": ConversationApi.retryAssistantTurn as ToolFunction,
  "conversation.regenerateAssistantTurn": ConversationApi.regenerateAssistantTurn as ToolFunction,
};

export type GatewayToolContext = {
  isGuest: boolean;
  /** IP or another stable-per-caller identifier for rate limiting —
   * never a customer id or anything else that could double as identity. */
  identifier: string;
};

export type GatewayToolInvocationResult =
  | { success: true; data: unknown }
  | { success: false; error: { code: string; message: string } };

/**
 * The one function anything outside this module should call to run a
 * Gateway tool. Enforces, in order: tool exists in the allow-list ->
 * access level vs. guest/customer -> rate limit -> invoke. A denial at
 * any stage never calls the underlying tool function at all.
 */
export async function invokeGatewayTool(toolName: string, args: unknown[], context: GatewayToolContext): Promise<GatewayToolInvocationResult> {
  const requestId = generateRequestId();

  // Production Rollout v1.0, Stage 1 — emergency tool kill switch. Highest
  // priority, cheapest check: when active, denies every tool regardless of
  // allow-list/rollout/rate-limit state, with zero further work done.
  if (isToolKillSwitchActive()) {
    const message = "Gateway tool execution is currently disabled by the emergency kill switch";
    await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "CRITICAL", source: "security", message, metadata: { toolName } });
    return { success: false, error: { code: "TOOLS_KILLED", message } };
  }

  const access = checkToolAccess(toolName, { isGuest: context.isGuest });
  if (!access.allowed) {
    await emitGatewayEvent({
      requestId,
      eventType: access.code === "UNAUTHENTICATED" ? "AUTHENTICATION_FAILURE" : "TOOL_ERROR",
      severity: "WARN",
      source: "security",
      message: access.message,
      metadata: { toolName },
    });
    return { success: false, error: { code: access.code, message: access.message } };
  }

  if (!isToolEnabled(toolName)) {
    const message = `"${toolName}" is registered but not yet enabled for rollout`;
    await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "INFO", source: "security", message, metadata: { toolName } });
    return { success: false, error: { code: "TOOL_NOT_ENABLED", message } };
  }

  const rateLimit = checkToolRateLimit(toolName, context.identifier);
  if (!rateLimit.allowed) {
    await emitGatewayEvent({
      requestId,
      eventType: "RATE_LIMIT",
      severity: "WARN",
      source: "security",
      message: rateLimit.message,
      metadata: { toolName },
    });
    return { success: false, error: { code: rateLimit.code, message: rateLimit.message } };
  }

  const fn = TOOL_FUNCTIONS[toolName];
  if (!fn) {
    // Registered in tool-registry.ts but not wired here — a real
    // configuration gap, not a caller error; reported distinctly so it
    // can't be confused with an unregistered-tool denial.
    await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "CRITICAL", source: "security", message: `"${toolName}" is registered but has no dispatch target`, metadata: { toolName } });
    return { success: false, error: { code: "TOOL_NOT_ALLOWED", message: `"${toolName}" is not available` } };
  }

  const data = await fn(...args);
  return { success: true, data };
}
