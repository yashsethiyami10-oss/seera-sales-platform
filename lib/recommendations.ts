import { prisma } from "@/lib/prisma";
import { getCustomerPreferences } from "@/lib/preferences";
// Security fix (Storefront Recommendation Payload Exposure) — this file
// used to define its own byte-for-byte duplicate of `lib/product-catalog
// .ts`'s `productCard`, as a bare Prisma `include` fragment. `include`
// only ADDS relations on top of every scalar column Prisma returns by
// default — it never narrows them — so once `Product.ingredients` held
// real proprietary formulation text, every recommendation card built from
// this shape carried it (and `benefits`/`directions`/`safety`/etc.) into
// the page's RSC payload, never rendered but present in the raw HTML/
// flight data. Now importing the one shared, explicit `select` allowlist
// instead of keeping a second copy that could drift out of sync with it.
import { productCard } from "@/lib/product-catalog";

/**
 * Real-data recommendation engine — every function here is a Prisma query
 * over actual orders/wishlist/browsing rows, never a static or fabricated
 * list. No ML model, no external service, per the phase brief's own "no
 * external AI service" / "real data only" constraints.
 */

/** Same category, or at least one overlapping fragrance token — the two
 * real signals of "similar" this catalog's schema actually supports. */
export async function getSimilarProducts(productId: string, limit = 6) {
  const source = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true, fragranceNotes: true } });
  if (!source) return [];

  const fragranceTokens = (source.fragranceNotes ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  return prisma.product.findMany({
    where: {
      id: { not: productId },
      status: "ACTIVE",
      OR: [
        { categoryId: source.categoryId },
        ...(fragranceTokens.length > 0 ? fragranceTokens.map((t) => ({ fragranceNotes: { contains: t, mode: "insensitive" as const } })) : []),
      ],
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: productCard,
  });
}

/** Real order co-occurrence: which other products showed up in the same
 * orders as this one. Powers both "Customers Also Bought" (wider list) and
 * "Frequently Bought Together" (top few) from one query — no separate
 * business logic duplicated for the second label. */
export async function getCoPurchasedProducts(productId: string, limit = 6) {
  const orderIds = (
    await prisma.orderItem.findMany({
      where: { variant: { productId } },
      select: { orderId: true },
      distinct: ["orderId"],
    })
  ).map((o) => o.orderId);

  if (orderIds.length === 0) return [];

  const coItems = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds }, variant: { productId: { not: productId } } },
    select: { variant: { select: { productId: true } } },
  });

  const counts = new Map<string, number>();
  for (const item of coItems) {
    const pid = item.variant.productId;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);

  const products = await prisma.product.findMany({ where: { id: { in: rankedIds }, status: "ACTIVE" }, select: productCard });
  // Re-sort to the co-purchase ranking — `findMany({ where: { in } })` doesn't
  // preserve the order of the id list.
  const order = new Map(rankedIds.map((id, i) => [id, i]));
  return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Real order volume in the trailing window — not a fabricated "trending"
 * badge. Falls back to newest when there's not yet enough order history to
 * rank by, same honesty pattern as the admin dashboard's best-sellers. */
export async function getTrendingProducts(limit = 8, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } },
    select: { quantity: true, variant: { select: { productId: true } } },
  });

  const counts = new Map<string, number>();
  for (const item of items) {
    const pid = item.variant.productId;
    counts.set(pid, (counts.get(pid) ?? 0) + item.quantity);
  }

  if (counts.size === 0) return getNewArrivals(limit);

  const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  const products = await prisma.product.findMany({ where: { id: { in: rankedIds }, status: "ACTIVE" }, select: productCard });
  const order = new Map(rankedIds.map((id, i) => [id, i]));
  return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getNewArrivals(limit = 8) {
  return prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: limit, select: productCard });
}

/** "Staff Picks" is the existing admin-curated Featured flag
 * (Product.isFeatured) — the same real signal the homepage's existing
 * Featured section and Phase 13A's admin toggle already use, just relabeled
 * here rather than reimplemented. */
export async function getStaffPicks(limit = 8) {
  return prisma.product.findMany({ where: { isFeatured: true, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: limit, select: productCard });
}

/** Blends the customer's real purchase/wishlist/browsing categories
 * (getCustomerPreferences) into a ranked product list — never a black-box
 * score, just "products in the categories this customer actually engages
 * with, that they haven't already bought." Falls back to Trending for a
 * customer with no signal yet (new account), rather than an empty section. */
export async function getRecommendedForYou(customerId: string, limit = 8) {
  const prefs = await getCustomerPreferences(customerId);
  if (prefs.favoriteCategorySlugs.length === 0) return getTrendingProducts(limit);

  const purchasedProductIds = (
    await prisma.orderItem.findMany({
      where: { order: { customerId } },
      select: { variant: { select: { productId: true } } },
    })
  ).map((i) => i.variant.productId);

  const candidates = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: purchasedProductIds },
      category: { slug: { in: prefs.favoriteCategorySlugs } },
    },
    take: limit * 2,
    select: productCard,
  });

  // Products whose fragrance overlaps a favorite fragrance rank first among
  // the category-matched candidates — a second real, cheap-to-compute signal
  // layered on top of category, still no ML involved.
  const ranked = candidates
    .map((p) => ({
      product: p,
      score: (prefs.favoriteFragrances.some((f) => p.fragranceNotes?.toLowerCase().includes(f.toLowerCase())) ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.product);

  return ranked.length > 0 ? ranked : getTrendingProducts(limit);
}
