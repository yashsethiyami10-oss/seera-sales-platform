import { listRegisteredTools } from "./tool-registry";

/**
 * MUV AI Gateway — Phase 6.4, Progressive Rollout Framework.
 *
 * Deliberately mirrors `lib/production/feature-flags.ts`'s exact
 * pattern (deterministic env-var defaults + an in-memory runtime-
 * override Map, "reuse the codebase's own established feature-flag
 * shape" rather than inventing a new one) — same precedence order too:
 * runtime override > env var > default.
 *
 * This is a SEPARATE axis from `tool-registry.ts`'s GUEST_SAFE/
 * CUSTOMER_ONLY access level: a tool can be fully registered and
 * access-correct while still not yet rolled out. `dispatch.ts` checks
 * both — a tool must be registered, allowed for this caller, AND
 * enabled here before it ever runs.
 *
 * Stage 6.4 (Phase 6) kept only `commerce.searchProducts` enabled by
 * default, per its own explicit "do not enable additional tools yet."
 * AI Production Rollout v1.0, Stage 4 is the separately authorized
 * rollout step that comment anticipated — it enables the rest of the
 * GUEST_SAFE Commerce Intelligence catalog/read tools (Wave A: product/
 * category/variant/availability/pricing lookup; Wave B: recommendations/
 * comparison/related products/fragrance/surface/stain/shopping/care
 * guidance). Every one of these was already registered, access-
 * controlled, rate-limited, and unit-tested since Phase 5.3/5.7 — this
 * only flips the one additional gate (`isToolEnabled`) that was holding
 * them back from the live dispatcher. Conversation-domain tools remain
 * disabled — that is Stage 6's job.
 *
 * Stage 5 (Authenticated Customer Intelligence Rollout) enables every
 * CUSTOMER_ONLY tool in the Customer domain. Each one already enforces
 * its own authentication + ownership *inside* the underlying Server
 * Action it wraps (`lib/gateway/customer/customer-api.ts`'s own header
 * comment, and confirmed directly in `actions/orders.ts`'s
 * `getOrderById`/`getOrderTimeline`: `if (!order || order.customerId !==
 * customer.id) throw new NotFoundError("Order")` — a non-owner and a
 * nonexistent order get the identical response, never disclosing which
 * case occurred). This rollout flag is the SECOND, earlier gate (a guest
 * call is already rejected by `checkToolAccess` before this is even
 * reached), not a replacement for that ownership check.
 * `commerce.getMyWishlist`/`addWishlistItem`/`removeWishlistItem`/
 * `isWishlisted`/`getMyRecentlyViewed`/`recordProductViewed` are also
 * CUSTOMER_ONLY tools with the same real ownership enforcement, but sit
 * outside Stage 5's own explicit capability list (Order/Profile/Address/
 * Return/Refund/Conversation history) — intentionally left disabled
 * here; nothing prevents enabling them later the same way.
 */

const ROLLOUT_DEFAULTS: Record<string, boolean> = {
  "commerce.searchProducts": true,
  // Wave A — product/category/variant/availability/pricing lookup.
  "commerce.getProduct": true,
  "commerce.getCategory": true,
  "commerce.getProductVariants": true,
  "commerce.getAvailability": true,
  "commerce.getPricing": true,
  // Wave B — recommendations, comparison, guidance (customer-safe sources only).
  "commerce.getRecommendations": true,
  "commerce.compareProducts": true,
  "commerce.getRelatedProducts": true,
  "commerce.getFragranceRecommendations": true,
  "commerce.getSurfaceRecommendations": true,
  "commerce.getStainRecommendations": true,
  "commerce.getShoppingGuidance": true,
  "commerce.getCareRecommendations": true,
  // Stage 5 — authenticated Customer Intelligence (ownership-enforced
  // inside each underlying Server Action; enabled here means "reachable
  // by an authenticated customer," never "guest-safe" — checkToolAccess
  // still rejects every guest call before this is ever reached).
  "customer.getMyOrdersList": true,
  "customer.getOrder": true,
  "customer.getOrderTracking": true,
  "customer.getPurchaseHistory": true,
  "customer.getProfile": true,
  "customer.getAddresses": true,
  "customer.getSavedPreferences": true,
  "customer.getReturnRequests": true,
  "customer.getRefundStatus": true,
  "customer.getMyConversations": true,
  "customer.getMyConversationMemory": true,
};

function envKeyFor(toolName: string): string {
  return `GATEWAY_TOOL_ENABLED_${toolName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function readBoolEnv(key: string): boolean | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  return raw === "true" || raw === "1";
}

const runtimeOverrides = new Map<string, boolean>();

export function isToolEnabled(toolName: string): boolean {
  if (runtimeOverrides.has(toolName)) return runtimeOverrides.get(toolName)!;
  const envValue = readBoolEnv(envKeyFor(toolName));
  if (envValue !== undefined) return envValue;
  return ROLLOUT_DEFAULTS[toolName] ?? false;
}

/** Pure config mutation, not itself access-controlled — same convention
 * as `updateFeatureFlags()` (the gating, if any, belongs to whatever
 * future admin surface calls this, not to this function). */
export function setToolEnabled(toolName: string, enabled: boolean): void {
  runtimeOverrides.set(toolName, enabled);
}

export function getRolloutState(): { name: string; category: string; access: string; enabled: boolean }[] {
  return listRegisteredTools().map((t) => ({ name: t.name, category: t.category, access: t.access, enabled: isToolEnabled(t.name) }));
}
