import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---- Database-safety gate: read-only, but still confirm the target host. ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
console.log("[payload-safety] Resolved read target host:", resolvedHost);
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart.`);
}

import { prisma } from "@/lib/prisma";
import {
  getSimilarProducts,
  getCoPurchasedProducts,
  getTrendingProducts,
  getNewArrivals,
  getStaffPicks,
  getRecommendedForYou,
} from "@/lib/recommendations";
import { searchProducts, getProductBySlug, getCategoryWithProducts, compareProducts, productCard } from "@/lib/product-catalog";

/**
 * Regression guard for the Storefront Recommendation Payload Exposure fix.
 * Fails if any recommendation/product-card query ever starts returning
 * `Product`'s internal/proprietary scalar columns again — checked at the
 * object-key level (not just string search), since a key can be present
 * and merely null/empty and still be the wrong shape to expose.
 */
const FORBIDDEN_KEYS = [
  "ingredients",
  "benefits",
  "directions",
  "safety",
  "fullDescription",
  "shortDescription",
  "metaTitle",
  "metaDescription",
  "hsnCode",
  "gstRate",
  "videoUrl",
  "videoUrls",
  "brand",
  "weight",
];

function assertNoForbiddenKeys(label: string, obj: unknown) {
  if (!obj || typeof obj !== "object") return;
  const keys = Object.keys(obj as Record<string, unknown>);
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(keys, `${label} unexpectedly has key "${forbidden}"`).not.toContain(forbidden);
  }
}

describe("Product-card / recommendation payloads never expose internal Product fields", () => {
  let sampleProductId: string;
  let sampleProductSlug: string;
  let sampleCategorySlug: string;

  beforeAll(async () => {
    const sample = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", name: "Muv Radiance Car Wash" },
      select: { id: true, slug: true, category: { select: { slug: true } } },
    });
    sampleProductId = sample.id;
    sampleProductSlug = sample.slug;
    sampleCategorySlug = sample.category.slug;
  });

  it("the shared productCard select itself does not request any forbidden field", () => {
    const flatKeys = Object.keys(productCard);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(flatKeys, `productCard select unexpectedly requests "${forbidden}"`).not.toContain(forbidden);
    }
    // The one non-obvious inclusion (fragranceNotes) must be deliberate, not
    // an oversight — it's already customer-facing (Product Specifications),
    // and getRecommendedForYou's own ranking logic reads it off these rows.
    expect(Object.keys(productCard)).toContain("fragranceNotes");
  });

  it("getSimilarProducts", async () => {
    const results = await getSimilarProducts(sampleProductId, 4);
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) assertNoForbiddenKeys("getSimilarProducts item", r);
  }, 20000);

  it("getCoPurchasedProducts", async () => {
    const results = await getCoPurchasedProducts(sampleProductId, 4);
    for (const r of results) assertNoForbiddenKeys("getCoPurchasedProducts item", r);
  }, 20000);

  it("getTrendingProducts", async () => {
    const results = await getTrendingProducts(4);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) assertNoForbiddenKeys("getTrendingProducts item", r);
  }, 20000);

  it("getNewArrivals", async () => {
    const results = await getNewArrivals(4);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) assertNoForbiddenKeys("getNewArrivals item", r);
  }, 20000);

  it("getStaffPicks", async () => {
    const results = await getStaffPicks(4);
    for (const r of results) assertNoForbiddenKeys("getStaffPicks item", r);
  }, 20000);

  it("getRecommendedForYou falls back to Trending safely for a signal-less customer id", async () => {
    // No real customer with preferences needed to prove the shape — the
    // fallback path (getTrendingProducts) already exercises the same select.
    const results = await getRecommendedForYou("nonexistent-customer-id", 4);
    for (const r of results) assertNoForbiddenKeys("getRecommendedForYou item", r);
  }, 20000);

  it("searchProducts", async () => {
    const { items } = await searchProducts({ pageSize: 4 });
    expect(items.length).toBeGreaterThan(0);
    for (const r of items) assertNoForbiddenKeys("searchProducts item", r);
  }, 20000);

  it("getProductBySlug", async () => {
    const product = await getProductBySlug(sampleProductSlug);
    expect(product).toBeTruthy();
    assertNoForbiddenKeys("getProductBySlug", product);
    // Content stays restricted to keyBenefits only, matching the card shape.
    if (product?.content) {
      expect(Object.keys(product.content)).toEqual(["keyBenefits"]);
    }
  }, 20000);

  it("getCategoryWithProducts", async () => {
    const result = await getCategoryWithProducts(sampleCategorySlug);
    expect(result).toBeTruthy();
    for (const r of result?.products ?? []) assertNoForbiddenKeys("getCategoryWithProducts item", r);
  }, 20000);

  it("compareProducts", async () => {
    const results = await compareProducts([sampleProductId]);
    for (const r of results) assertNoForbiddenKeys("compareProducts item", r);
  }, 20000);
});
