import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Real-data product catalog reads — search/lookup/category/comparison.
 * Same "real Prisma query, no fabricated data" discipline as
 * `lib/recommendations.ts` and `lib/preferences.ts`, which this file sits
 * alongside.
 *
 * Consolidates a query that existed almost identically in four places
 * before this file (`app/api/products/route.ts`, `app/api/products/
 * [slug]/route.ts`, `app/(storefront)/collections/[category]/page.tsx`,
 * `app/(storefront)/products/[slug]/page.tsx`) — this is the first single,
 * reusable read for it, not a new invention; those call sites are
 * untouched (no UI/route change), this file is additive.
 */

/**
 * Security fix (Storefront Recommendation Payload Exposure) — this used to
 * be a Prisma `include` fragment, which only adds relations on *top of*
 * every scalar column on `Product` coming back by default (the comment
 * that used to sit here was wrong: Prisma's default *is* "all scalars,"
 * `include` never narrows them). Once `Product.ingredients` started
 * holding real proprietary formulation text, every card/recommendation
 * built from this shape carried it into the page's RSC payload — never
 * rendered, but present in the raw HTML/flight data (viewable via View
 * Source/DevTools). This is now an explicit `select` allowlist instead:
 * only the fields the real `FeaturedProduct` consumers (`components/
 * storefront/featured-products.tsx`'s type, and this module's own
 * `toFeaturedProduct`-shaped callers) and `getRecommendedForYou`'s own
 * fragrance-overlap ranking (which reads `fragranceNotes` off these same
 * candidate rows before mapping) actually use. `fragranceNotes` is
 * already customer-facing (shown as the Product Specifications fragrance
 * line), not sensitive — everything else that used to ride along for
 * free (`ingredients`, `benefits`, `directions`, `safety`,
 * `fullDescription`, `metaTitle`, `metaDescription`, `hsnCode`, `gstRate`,
 * `videoUrls`, etc.) is deliberately absent. Shared by
 * `lib/recommendations.ts` (imports this export directly — the two were
 * previously byte-for-byte duplicate `include` fragments) and this file's
 * own `searchProducts`/`getProductBySlug`/`getCategoryWithProducts`/
 * `compareProducts`, plus `lib/gateway/commerce/search-engine.ts`'s
 * `fetchProductsByIdsOrdered` (the AI Gateway's Commerce tools import this
 * same constant — not wired into any live AI turn today per that module's
 * own header, but there is no reason a dormant tool should default to
 * over-fetching proprietary fields either).
 */
export const productCard = {
  id: true,
  name: true,
  slug: true,
  images: true,
  fragranceNotes: true,
  category: { select: { name: true } },
  variants: {
    orderBy: { price: "asc" as const },
    select: {
      id: true,
      size: true,
      price: true,
      mrp: true,
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  },
  reviews: { where: { status: "APPROVED" as const }, select: { rating: true } },
  content: { select: { keyBenefits: true } },
} satisfies Prisma.ProductSelect;

export type SearchProductsParams = {
  query?: string;
  categorySlug?: string;
  sort?: "featured" | "price-asc" | "price-desc" | "name";
  page?: number;
  pageSize?: number;
};

function orderByFor(sort: SearchProductsParams["sort"]): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "name":
      return { name: "asc" };
    case "featured":
      return { isFeatured: "desc" };
    default:
      // price-asc/price-desc can't be a DB-level ORDER BY — "product" price
      // is really a range across variants, not one column (exact same
      // constraint the existing app/api/products/route.ts documents at its
      // own orderBy line) — sorted after fetch below instead, using each
      // product's own cheapest variant (already loaded via `productCard`).
      return { createdAt: "desc" };
  }
}

function cheapestVariantPrice(product: { variants: { price: number }[] }): number {
  return product.variants.length > 0 ? Math.min(...product.variants.map((v) => v.price)) : Number.POSITIVE_INFINITY;
}

export async function searchProducts(params: SearchProductsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 50));

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
    ...(params.query ? { name: { contains: params.query, mode: "insensitive" } } : {}),
  };

  const isPriceSort = params.sort === "price-asc" || params.sort === "price-desc";
  const [rawItems, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: orderByFor(params.sort),
      // Price sort needs the full matching set in memory to sort by
      // cheapest-variant price before paging — every other sort can page
      // at the DB level directly.
      ...(isPriceSort ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      select: productCard,
    }),
    prisma.product.count({ where }),
  ]);

  let items = rawItems;
  if (isPriceSort) {
    const sorted = [...rawItems].sort((a, b) => {
      const diff = cheapestVariantPrice(a) - cheapestVariantPrice(b);
      return params.sort === "price-desc" ? -diff : diff;
    });
    items = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  }

  return { items, total, page, pageSize };
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug, status: "ACTIVE" },
    select: productCard,
  });
}

export async function getCategoryWithProducts(slug: string) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return null;

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", categoryId: category.id },
    orderBy: { createdAt: "desc" },
    select: productCard,
  });

  return { category, products };
}

/**
 * Comparison — no existing feature/query to reuse (confirmed: no
 * storefront comparison UI or query exists anywhere in this codebase).
 * Genuinely new, but reuses `productCard`'s established shape rather
 * than inventing a different one.
 */
export async function compareProducts(productIds: string[]) {
  const ids = [...new Set(productIds)].slice(0, 6); // sane upper bound — comparing dozens at once isn't a real use case
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: productCard,
  });

  // Preserve the caller's requested order — findMany({where:{in}}) doesn't.
  const order = new Map(ids.map((id, i) => [id, i]));
  return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
