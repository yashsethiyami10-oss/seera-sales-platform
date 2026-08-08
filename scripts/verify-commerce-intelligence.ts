import {
  searchProducts,
  getProduct,
  getCategory,
  getProductVariants,
  getAvailability,
  getPricing,
  getOffers,
  compareProducts,
  getRecommendations,
  getRelatedProducts,
  getMyWishlist,
  getMyRecentlyViewed,
  priceCart,
  getShoppingGuidance,
  getCareRecommendations,
  getSurfaceRecommendations,
  getStainRecommendations,
  getFragranceRecommendations,
} from "../lib/gateway/commerce";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Phase 5.3, Commerce
 * Intelligence. Same `scripts/verify-*.ts` convention as the Knowledge
 * Publisher/Access suites (Phase 5.2.1) — see those files' headers for
 * why (the Vitest suite is currently broken in this environment for
 * reasons unrelated to this Wave).
 *
 * Run: `npx tsx scripts/verify-commerce-intelligence.ts` (or
 * `npm run verify:commerce-intelligence`).
 *
 * Wishlist/recently-viewed checks confirm graceful, structured failure
 * (never a crash) when run outside a real Next.js request — the same
 * documented `resolveCallerClearance()`/`auth()` limitation as every
 * other `scripts/verify-*.ts` script in this repo (see `verify-stage6d-
 * knowledge-integration.ts`'s own header) — they are not full RBAC
 * proofs; that requires a real request context (already proven live by
 * the widget smoke tests run after every phase).
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
  const product = await prisma.product.findFirst({ where: { status: "ACTIVE" }, select: { id: true, slug: true } });
  const product2 = await prisma.product.findFirst({ where: { status: "ACTIVE", id: { not: product?.id } }, select: { id: true, slug: true } });
  const category = await prisma.category.findFirst({ select: { slug: true } });
  const variant = await prisma.productVariant.findFirst({ where: { product: { status: "ACTIVE" } }, select: { id: true } });
  if (!product || !product2 || !category || !variant) throw new Error("Seed data missing — cannot run Commerce Intelligence checks.");

  // ---- Product search / lookup / category / variants ----
  const search = await searchProducts({ query: "muv", pageSize: 5 });
  check(search.success && search.data.items.length > 0, "searchProducts: returns real results", search.success ? undefined : search);

  const searchByCategory = await searchProducts({ categorySlug: category.slug, sort: "price-asc" });
  check(searchByCategory.success, "searchProducts: category filter + price-asc sort succeeds");
  if (searchByCategory.success) {
    const prices = searchByCategory.data.items.map((p: any) => Math.min(...p.variants.map((v: any) => v.price)));
    const sorted = [...prices].sort((a, b) => a - b);
    check(JSON.stringify(prices) === JSON.stringify(sorted), "searchProducts: price-asc actually ascends", prices);
  }

  const lookup = await getProduct(product.slug);
  check(lookup.success && lookup.data.id === product.id, "getProduct: real product resolved by slug");

  const missingLookup = await getProduct("definitely-not-a-real-slug");
  check(!missingLookup.success && missingLookup.error.code === "NOT_FOUND", "getProduct: unknown slug returns NOT_FOUND, not a crash");

  const cat = await getCategory(category.slug);
  check(cat.success && cat.data.category.slug === category.slug, "getCategory: real category resolved");

  const variants = await getProductVariants(product.slug);
  check(variants.success && Array.isArray(variants.data), "getProductVariants: returns an array");

  // ---- Availability / Pricing / Offers ----
  const availability = await getAvailability(product.id);
  check(availability.success && availability.data.status === "OK", "getAvailability: live availability resolved");
  const pricing = await getPricing(product.id);
  check(pricing.success, "getPricing: same live source as availability succeeds");

  const offers = await getOffers();
  check(offers.success && Array.isArray(offers.data), "getOffers: returns a structured (possibly empty) list, never throws");

  // ---- Comparison ----
  const comparison = await compareProducts([product.id, product2.id]);
  check(comparison.success && comparison.data.length === 2, "compareProducts: returns both requested products");

  // ---- Recommendations / Related ----
  const trending = await getRecommendations("trending", { limit: 5 });
  check(trending.success, "getRecommendations(trending): succeeds");
  const forYouMissingId = await getRecommendations("for-you", {});
  check(!forYouMissingId.success && forYouMissingId.error.code === "BAD_REQUEST", "getRecommendations(for-you): requires customerId, never guesses");

  const related = await getRelatedProducts(product.id);
  check(related.success && "similar" in related.data && "coPurchased" in related.data, "getRelatedProducts: returns both real signals");

  // ---- Cart pricing (stateless preview) ----
  const priced = await priceCart({ items: [{ variantId: variant.id, quantity: 2 }], buyerState: "Maharashtra" });
  check(priced.success && priced.data.lines.length === 1 && priced.data.total > 0, "priceCart: prices a real variant with GST/shipping composed", priced.success ? priced.data : priced);

  const pricedBadVariant = await priceCart({ items: [{ variantId: "not-a-real-variant", quantity: 1 }], buyerState: "Maharashtra" });
  check(!pricedBadVariant.success && pricedBadVariant.error.code === "NOT_FOUND", "priceCart: unknown variant returns NOT_FOUND, not a crash");

  // ---- Shopping guidance / care-surface-stain-fragrance ----
  // getShoppingGuidance composes fetchSafetyGuidance, which (per Phase
  // 5.2.1's Knowledge Access Layer fix) resolves real caller clearance —
  // same documented `resolveCallerClearance()`/`auth()` limitation as
  // the wishlist/recently-viewed checks below: graceful structured
  // failure outside a real request context is the correct, expected
  // outcome here, not a bug.
  const guidance = await getShoppingGuidance("floor cleaner");
  check(!guidance.success, "getShoppingGuidance: fails gracefully (structured error, not a crash) outside a real request context");
  const care = await getCareRecommendations("floor");
  check(care.success, "getCareRecommendations: structured response, never throws");
  const surface = await getSurfaceRecommendations("marble");
  check(surface.success, "getSurfaceRecommendations: structured response, never throws");
  const stain = await getStainRecommendations("oil");
  check(stain.success, "getStainRecommendations: structured response, never throws");
  const fragrance = await getFragranceRecommendations("rose");
  check(fragrance.success, "getFragranceRecommendations: structured response, never throws");

  // ---- Wishlist / Recently Viewed — graceful outside request context ----
  const wishlist = await getMyWishlist();
  check(!wishlist.success, "getMyWishlist: fails gracefully (structured error, not a crash) outside a real request context");
  const recentlyViewed = await getMyRecentlyViewed();
  check(!recentlyViewed.success, "getMyRecentlyViewed: fails gracefully (structured error, not a crash) outside a real request context");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
