import { prisma } from "@/lib/prisma";

export type CustomerPreferences = {
  favoriteCategorySlugs: string[];
  favoriteFragrances: string[];
  averageBudget: number | null;
  preferredSizes: string[];
  shoppingFrequencyDays: number | null;
  recentlyPurchasedProductIds: string[];
  wishlistConversionRate: number | null;
};

function topN(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key);
}

/**
 * Computed on read from existing Order/OrderItem/Wishlist rows — no new
 * mutable "preferences" columns on Customer, so this can never drift out of
 * sync with what a customer actually did. Every field here is a real
 * aggregation, not an inferred/fabricated score.
 */
export async function getCustomerPreferences(customerId: string): Promise<CustomerPreferences> {
  const [orders, wishlist, paidOrders] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, status: { not: "CANCELLED" } },
      select: {
        createdAt: true,
        items: { select: { sizeAtPurchase: true, variant: { select: { product: { select: { id: true, categoryId: true, category: { select: { slug: true } }, fragranceNotes: true } } } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.wishlist.findMany({
      where: { customerId },
      select: { productId: true, product: { select: { categoryId: true, category: { select: { slug: true } }, fragranceNotes: true } } },
    }),
    prisma.order.findMany({ where: { customerId, paymentStatus: "PAID" }, select: { total: true } }),
  ]);

  const categoryCounts = new Map<string, number>();
  const fragranceCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const purchasedProductIds: string[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      const slug = item.variant.product.category.slug;
      categoryCounts.set(slug, (categoryCounts.get(slug) ?? 0) + 1);
      sizeCounts.set(item.sizeAtPurchase, (sizeCounts.get(item.sizeAtPurchase) ?? 0) + 1);
      (item.variant.product.fragranceNotes ?? "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => fragranceCounts.set(t, (fragranceCounts.get(t) ?? 0) + 1));
      purchasedProductIds.push(item.variant.product.id);
    }
  }

  for (const w of wishlist) {
    const slug = w.product.category.slug;
    categoryCounts.set(slug, (categoryCounts.get(slug) ?? 0) + 1);
    (w.product.fragranceNotes ?? "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => fragranceCounts.set(t, (fragranceCounts.get(t) ?? 0) + 1));
  }

  const averageBudget = paidOrders.length > 0 ? Math.round(paidOrders.reduce((sum, o) => sum + o.total, 0) / paidOrders.length) : null;

  // Median gap between consecutive orders — a steadier "shopping frequency"
  // signal than a simple average, which one very old or very recent order
  // can otherwise skew heavily.
  let shoppingFrequencyDays: number | null = null;
  if (orders.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const prevOrder = orders[i - 1]!;
      const currOrder = orders[i]!;
      gaps.push((currOrder.createdAt.getTime() - prevOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    shoppingFrequencyDays = Math.round(gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!);
  }

  const wishlistedIds = new Set(wishlist.map((w) => w.productId));
  const purchasedIds = new Set(purchasedProductIds);
  const converted = [...wishlistedIds].filter((id) => purchasedIds.has(id)).length;
  const wishlistConversionRate = wishlistedIds.size > 0 ? Math.round((converted / wishlistedIds.size) * 100) / 100 : null;

  return {
    favoriteCategorySlugs: topN(categoryCounts, 3),
    favoriteFragrances: topN(fragranceCounts, 5),
    averageBudget,
    preferredSizes: topN(sizeCounts, 3),
    shoppingFrequencyDays,
    recentlyPurchasedProductIds: [...new Set(purchasedProductIds)].slice(-5).reverse(),
    wishlistConversionRate,
  };
}
