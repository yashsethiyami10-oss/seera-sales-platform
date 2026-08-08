import { toErrorResponse, NotFoundError, AppError } from "@/lib/errors";
import { searchProducts as searchProductsCatalog, getProductBySlug, getCategoryWithProducts, compareProducts as compareProductsCatalog } from "@/lib/product-catalog";
import { listActiveOffers } from "@/lib/offers";
import { priceCart as priceCartComposition, type CartPricingInput } from "@/lib/cart-pricing";
import {
  getSimilarProducts,
  getCoPurchasedProducts,
  getTrendingProducts,
  getNewArrivals,
  getStaffPicks,
  getRecommendedForYou,
} from "@/lib/recommendations";
import { addToWishlist, removeFromWishlist, isProductWishlisted, getWishlist } from "@/actions/wishlist";
import { recordProductView, getRecentlyViewed } from "@/actions/recently-viewed";
import { fetchAvailability, fetchCareGuides, fetchSafetyGuidance } from "@/lib/gateway/knowledge";
import { instrumentToolCall, emitGatewayEvent, generateRequestId } from "@/lib/gateway/observability";
// Imports the leaf file directly, not `@/lib/gateway/security`'s barrel —
// that barrel's `dispatch.ts` imports this whole module (`lib/gateway/
// commerce`), so importing the barrel back here would be circular.
// `prompt-injection.ts` itself has no imports of its own, so this edge
// is safe.
import { detectPromptInjection } from "@/lib/gateway/security/prompt-injection";
import { runIntelligentProductSearch, fetchProductsByIdsOrdered } from "./search-engine";
import type { SearchProductsParams } from "@/lib/product-catalog";
import type { CommerceToolResult } from "./types";

/**
 * MUV AI Gateway — Phase 5.3, Commerce Intelligence.
 *
 * "Every Commerce capability must be implemented as Gateway Tool APIs.
 * Never expose direct database access." — every function below either
 * (a) calls an existing, already-real Server Action or lib function that
 * itself owns any Prisma access (`actions/wishlist.ts`, `actions/
 * recently-viewed.ts`, `lib/recommendations.ts`, the Knowledge API), or
 * (b) calls a new plain-lib function (`lib/product-catalog.ts`, `lib/
 * offers.ts`, `lib/cart-pricing.ts`) written specifically because no
 * existing function covered that read — this file itself never imports
 * `@/lib/prisma` directly. "Every tool returns a standardized response"
 * — every function returns `CommerceToolResult<T>`.
 *
 * NOT wired into the live turn path — same status as the Knowledge API
 * (Module 3) and Provider Adapter (Module 2): available, tested, unused
 * by `lib/gateway/ai-gateway.ts`'s `runAiGatewayTurn` today. Wiring
 * commerce tools into an actual AI turn is a later, separately-approved
 * step (would mean touching the Experience Orchestrator, which this
 * phase's own rules forbid).
 *
 * `getMyWishlist`/`addWishlistItem`/`removeWishlistItem`/`isWishlisted`/
 * `getMyRecentlyViewed`/`recordProductViewed` are direct re-exports (not
 * re-wrapped through `run()`) of Server Actions that already return this
 * exact `{success,data}|{success,error}` shape and already enforce
 * `requireCustomer()` internally — re-wrapping them would only add a
 * layer that does nothing.
 */

/**
 * Phase 5.6 (Observability) — every call is wrapped in
 * `instrumentToolCall` (source "commerce", event type
 * `COMMERCE_TOOL_USAGE`), which measures duration and emits one event
 * per call, classified by outcome. The `{success,data}|{success,error}`
 * shape this function returns is completely unchanged by that wrapping
 * — instrumentation is a pure side-effect, per "preserve zero behaviour
 * change."
 */
async function run<T>(toolName: string, fn: () => Promise<T>, requestId?: string): Promise<CommerceToolResult<T>> {
  return instrumentToolCall({ source: "commerce", toolName, eventType: "COMMERCE_TOOL_USAGE", requestId }, async () => {
    try {
      return { success: true, data: await fn() };
    } catch (err) {
      return toErrorResponse(err);
    }
  });
}

/**
 * Phase 5.7 (Security) — "prompt-injection detection... untrusted
 * knowledge-content handling." Applied at the two free-text entry
 * points most representative of what a future generation step would
 * eventually see (a search query, a guidance question) — detection
 * only, never blocking: nothing on this path reaches a live provider
 * today, and refusing a customer's search because it happens to contain
 * a flagged word (a false positive is entirely possible with pattern
 * matching) would be a real availability regression for zero present
 * benefit. Flagged text is only logged (fire-and-forget, via the
 * existing Phase 5.6 event pipeline), never rejected.
 */
function scanFreeTextInput(toolName: string, text: string | undefined, requestId?: string): void {
  if (!text) return;
  const scan = detectPromptInjection(text);
  if (!scan.suspicious) return;
  void emitGatewayEvent({
    requestId: requestId ?? generateRequestId(),
    eventType: "TOOL_ERROR",
    severity: "WARN",
    source: "security",
    message: `${toolName}: input matched prompt-injection pattern(s) — logged only, not blocked`,
    metadata: { toolName, matchedPatternCount: scan.matchedPatterns.length },
  });
}

// ---------------------------------------------------------------------------
// Product Search / Lookup / Category / Variant
// ---------------------------------------------------------------------------

/**
 * Production Rollout v1.0, Stage 3 (Search Intelligence Upgrade) — a
 * free-text `query` now runs through `search-engine.ts`'s deterministic,
 * multi-field, typo-tolerant scorer instead of a raw `name.contains()`
 * substring match; a plain category-browse/sort call (no `query`) is
 * completely unchanged, still delegating straight to `lib/product-
 * catalog.ts`'s own `searchProducts()`. Same output shape either way
 * (`{items, total, page, pageSize}`, plus an informational
 * `searchConfidence` on the query path) — no consumer of this function
 * needs to change.
 */
async function searchProductsIntelligently(params: SearchProductsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 50));
  const { matchedProductIds, confidence } = await runIntelligentProductSearch(params.query!);

  const total = matchedProductIds.length;
  const pageIds = matchedProductIds.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  const items = await fetchProductsByIdsOrdered(pageIds);

  return { items, total, page, pageSize, searchConfidence: confidence };
}

/**
 * Phase 6.1 (Controlled Product Search Pilot) — the optional trailing
 * `requestId` lets a caller that already has its own turn-level
 * correlation id (the pilot module) thread it into this tool's own
 * `COMMERCE_TOOL_USAGE` event, so one real customer turn produces events
 * that share one id end-to-end instead of each layer minting its own.
 * Every other existing caller omits it and is completely unaffected —
 * `instrumentToolCall` already accepted an optional `requestId` in its
 * options (Phase 5.6), this just gives `searchProducts` a way to pass
 * one in.
 */
export function searchProducts(params: SearchProductsParams = {}, requestId?: string) {
  scanFreeTextInput("searchProducts", params.query, requestId);
  const hasFreeTextQuery = Boolean(params.query?.trim());
  return run("searchProducts", () => (hasFreeTextQuery ? searchProductsIntelligently(params) : searchProductsCatalog(params)), requestId);
}

export function getProduct(slug: string) {
  return run("getProduct", async () => {
    const product = await getProductBySlug(slug);
    if (!product) throw new NotFoundError("Product");
    return product;
  });
}

export function getCategory(slug: string) {
  return run("getCategory", async () => {
    const category = await getCategoryWithProducts(slug);
    if (!category) throw new NotFoundError("Category");
    return category;
  });
}

/** Variant lookup is always in the context of its product — there is no
 * standalone "get variant by id" anywhere in this codebase (variants are
 * never fetched independently of their product); `getProduct()`'s own
 * `variants[]` (each with its own `inventory`) already is the variant
 * lookup. Exposed under its own name for a caller that only cares about
 * "what variants does this product have," not the full product record. */
export function getProductVariants(slug: string) {
  return run("getProductVariants", async () => {
    const product = await getProductBySlug(slug);
    if (!product) throw new NotFoundError("Product");
    return product.variants;
  });
}

// ---------------------------------------------------------------------------
// Availability / Pricing / MRP / Stock — live only, reusing the Knowledge
// API's existing FR-001-compliant source rather than a second one.
// ---------------------------------------------------------------------------

export function getAvailability(productId: string) {
  return run("getAvailability", () => fetchAvailability({ productId }));
}

/** Same live source as availability — price/MRP/stock are the same
 * per-variant facts, just named for a caller asking specifically about
 * pricing rather than stock. */
export const getPricing = getAvailability;

export function getOffers() {
  return run("getOffers", () => listActiveOffers());
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function compareProducts(productIds: string[]) {
  return run("compareProducts", () => compareProductsCatalog(productIds));
}

// ---------------------------------------------------------------------------
// Recommendations / Related Products
// ---------------------------------------------------------------------------

export type RecommendationKind = "trending" | "new-arrivals" | "staff-picks" | "for-you";

export function getRecommendations(kind: RecommendationKind, params: { customerId?: string; limit?: number } = {}) {
  return run("getRecommendations", async () => {
    switch (kind) {
      case "trending":
        return getTrendingProducts(params.limit);
      case "new-arrivals":
        return getNewArrivals(params.limit);
      case "staff-picks":
        return getStaffPicks(params.limit);
      case "for-you": {
        if (!params.customerId) throw new AppError("customerId is required for personalized recommendations", 400, "BAD_REQUEST");
        return getRecommendedForYou(params.customerId, params.limit);
      }
    }
  });
}

/** "Related Products" — the same real signals (`getSimilarProducts` +
 * `getCoPurchasedProducts`) already wired onto the product detail page,
 * combined into one standardized tool response instead of two. */
export function getRelatedProducts(productId: string, limit = 6) {
  return run("getRelatedProducts", async () => {
    const [similar, coPurchased] = await Promise.all([getSimilarProducts(productId, limit), getCoPurchasedProducts(productId, limit)]);
    return { similar, coPurchased };
  });
}

// ---------------------------------------------------------------------------
// Recently Viewed / Wishlist — direct re-exports, see file header.
// ---------------------------------------------------------------------------

export const getMyRecentlyViewed = getRecentlyViewed;
export const recordProductViewed = recordProductView;

export const getMyWishlist = getWishlist;
export const addWishlistItem = addToWishlist;
export const removeWishlistItem = removeFromWishlist;
export const isWishlisted = isProductWishlisted;

// ---------------------------------------------------------------------------
// Cart Read / Add / Remove — see cart-pricing.ts's own header for why
// this is a stateless pricing/validation preview, never a stored-cart
// lookup: there is no server-side Cart table by design (CLAUDE.md), and
// this phase does not add one.
// ---------------------------------------------------------------------------

export function priceCart(input: CartPricingInput) {
  return run("priceCart", () => priceCartComposition(input));
}

// ---------------------------------------------------------------------------
// Shopping Guidance / Advice / Product Selection / Care / Surface /
// Stain / Fragrance Recommendations — all backed by the Knowledge API's
// existing Care Intelligence + Product Knowledge Factory retrieval
// (Module 3), parameterized by keyword rather than a second retrieval
// implementation. Honest about today's data gap: Module 5's CareIntelligence
// DB table is empty (see Phase 5.2 audit) — these correctly return a
// structured "knowledge unavailable" response rather than fabricating
// guidance, exactly like every other Knowledge API caller.
// ---------------------------------------------------------------------------

export function getShoppingGuidance(query: string, productId?: string) {
  scanFreeTextInput("getShoppingGuidance", query);
  return run("getShoppingGuidance", async () => {
    const [careGuides, safety] = await Promise.all([
      fetchCareGuides({ productId, keywords: query }),
      fetchSafetyGuidance({ productId, keywords: query }),
    ]);
    return { careGuides, safety };
  });
}

export function getCareRecommendations(keywords: string, productId?: string) {
  return run("getCareRecommendations", () => fetchCareGuides({ productId, keywords }));
}

export function getSurfaceRecommendations(surface: string) {
  return run("getSurfaceRecommendations", () => fetchCareGuides({ keywords: `${surface} surface` }));
}

export function getStainRecommendations(stain: string) {
  return run("getStainRecommendations", () => fetchCareGuides({ keywords: `${stain} stain` }));
}

export function getFragranceRecommendations(fragrance: string) {
  return run("getFragranceRecommendations", () => fetchCareGuides({ keywords: `${fragrance} fragrance` }));
}
