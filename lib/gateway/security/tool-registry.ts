/**
 * MUV AI Gateway — Phase 5.7, centralized Tool Allow-List.
 *
 * The single, authoritative registry of every callable Gateway Tool
 * across Commerce (5.3), Customer (5.4), and Conversation (5.5)
 * Intelligence. Nothing may be invoked through `invokeGatewayTool()`
 * (`dispatch.ts`) unless it is listed here — "per-tool authorization"
 * and "guests may only access explicitly guest-safe commerce functions"
 * are enforced against exactly this table, not against a convention
 * scattered across three separate files.
 *
 * `access: "CUSTOMER_ONLY"` tools still enforce their own
 * `requireCustomer()`/ownership checks internally (Phase 5.4's own
 * design, unchanged) — this registry adds a second, earlier,
 * fail-fast gate in front of them, not a replacement for that check.
 *
 * Rate limits are deliberately generous for read-only catalog/knowledge
 * lookups and tighter for anything that touches a customer's own
 * account — mirrors this codebase's existing per-endpoint rate-limit
 * conventions (`actions/coupons.ts`'s `validateCoupon`, `actions/
 * auth.ts`'s `signup`), not a new scheme invented for this table.
 */
export type ToolCategory = "commerce" | "customer" | "conversation";
export type ToolAccessLevel = "GUEST_SAFE" | "CUSTOMER_ONLY";

export type ToolDefinition = {
  name: string;
  category: ToolCategory;
  access: ToolAccessLevel;
  rateLimit: { limit: number; windowMs: number };
};

function tool(name: string, category: ToolCategory, access: ToolAccessLevel, limit: number, windowMs = 60_000): ToolDefinition {
  return { name, category, access, rateLimit: { limit, windowMs } };
}

const COMMERCE_TOOLS: ToolDefinition[] = [
  tool("commerce.searchProducts", "commerce", "GUEST_SAFE", 30),
  tool("commerce.getProduct", "commerce", "GUEST_SAFE", 60),
  tool("commerce.getCategory", "commerce", "GUEST_SAFE", 60),
  tool("commerce.getProductVariants", "commerce", "GUEST_SAFE", 60),
  tool("commerce.getAvailability", "commerce", "GUEST_SAFE", 60),
  tool("commerce.getPricing", "commerce", "GUEST_SAFE", 60),
  tool("commerce.getOffers", "commerce", "GUEST_SAFE", 30),
  tool("commerce.compareProducts", "commerce", "GUEST_SAFE", 20),
  tool("commerce.getRecommendations", "commerce", "GUEST_SAFE", 30),
  tool("commerce.getRelatedProducts", "commerce", "GUEST_SAFE", 30),
  tool("commerce.priceCart", "commerce", "GUEST_SAFE", 30),
  tool("commerce.getShoppingGuidance", "commerce", "GUEST_SAFE", 20),
  tool("commerce.getCareRecommendations", "commerce", "GUEST_SAFE", 20),
  tool("commerce.getSurfaceRecommendations", "commerce", "GUEST_SAFE", 20),
  tool("commerce.getStainRecommendations", "commerce", "GUEST_SAFE", 20),
  tool("commerce.getFragranceRecommendations", "commerce", "GUEST_SAFE", 20),
  // Wishlist/recently-viewed are inherently customer-owned data, even
  // though the underlying action's own name doesn't say so — registered
  // CUSTOMER_ONLY here regardless of what a caller might assume from
  // "read" sounding safe.
  tool("commerce.getMyRecentlyViewed", "commerce", "CUSTOMER_ONLY", 30),
  tool("commerce.recordProductViewed", "commerce", "CUSTOMER_ONLY", 60),
  tool("commerce.getMyWishlist", "commerce", "CUSTOMER_ONLY", 30),
  tool("commerce.addWishlistItem", "commerce", "CUSTOMER_ONLY", 20),
  tool("commerce.removeWishlistItem", "commerce", "CUSTOMER_ONLY", 20),
  tool("commerce.isWishlisted", "commerce", "CUSTOMER_ONLY", 60),
];

const CUSTOMER_TOOLS: ToolDefinition[] = [
  tool("customer.getMyOrdersList", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getOrder", "customer", "CUSTOMER_ONLY", 30),
  tool("customer.getOrderTracking", "customer", "CUSTOMER_ONLY", 30),
  tool("customer.getPurchaseHistory", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getProfile", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getAddresses", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getSavedPreferences", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getReturnRequests", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getRefundStatus", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getMyConversations", "customer", "CUSTOMER_ONLY", 20),
  tool("customer.getMyConversationMemory", "customer", "CUSTOMER_ONLY", 20),
];

const CONVERSATION_TOOLS: ToolDefinition[] = [
  // Session-id-based, not customer-identity-based — a guest can hold a
  // valid session id the same way guest checkout holds an order id (see
  // session-manager.ts's own header comment). GUEST_SAFE here describes
  // "does not require a signed-in customer," not "requires no secret at
  // all" — the session id itself is the credential, same trust model the
  // live turn path already uses.
  tool("conversation.recoverConversation", "conversation", "GUEST_SAFE", 30),
  tool("conversation.getConversationLifecycle", "conversation", "GUEST_SAFE", 30),
  tool("conversation.getConversationMetadata", "conversation", "GUEST_SAFE", 30),
  tool("conversation.getContextWindow", "conversation", "GUEST_SAFE", 30),
  tool("conversation.getConversationSummary", "conversation", "GUEST_SAFE", 20),
  tool("conversation.streamAssistantTurn", "conversation", "GUEST_SAFE", 20),
  tool("conversation.retryAssistantTurn", "conversation", "GUEST_SAFE", 10),
  tool("conversation.regenerateAssistantTurn", "conversation", "GUEST_SAFE", 10),
];

const TOOL_REGISTRY: Map<string, ToolDefinition> = new Map(
  [...COMMERCE_TOOLS, ...CUSTOMER_TOOLS, ...CONVERSATION_TOOLS].map((t) => [t.name, t])
);

export function getToolDefinition(name: string): ToolDefinition | null {
  return TOOL_REGISTRY.get(name) ?? null;
}

export function isToolRegistered(name: string): boolean {
  return TOOL_REGISTRY.has(name);
}

export function listRegisteredTools(): ToolDefinition[] {
  return [...TOOL_REGISTRY.values()];
}

export function listGuestSafeTools(): ToolDefinition[] {
  return listRegisteredTools().filter((t) => t.access === "GUEST_SAFE");
}
