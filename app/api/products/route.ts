import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productQuerySchema } from "@/lib/validations/product";
import { toErrorResponse, statusForError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { cached, CACHE_TAGS } from "@/lib/cache";

// Public, cacheable GET — no auth required. Only ACTIVE products are ever
// returned here regardless of query params; DRAFT/ARCHIVED products are
// only visible through the admin-only server actions.
export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const query = productQuerySchema.parse(params);

    const where: Prisma.ProductWhereInput = {
      status: "ACTIVE",
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === "name" ? { name: "asc" } : { createdAt: "desc" };
    // price-asc/price-desc sort on the client after fetching variants, since
    // "product" price is really a range across variants, not a single column.

    // Cache key includes every query param that changes the result set —
    // a search or filter combination not yet seen just costs one real query,
    // then joins the cache like any other key.
    const cacheKey = JSON.stringify(query);
    const runQuery = cached(
      async () =>
        Promise.all([
          prisma.product.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
            include: {
              category: { select: { name: true, slug: true } },
              variants: { include: { inventory: true }, orderBy: { price: "asc" } },
              reviews: { where: { status: "APPROVED" }, select: { rating: true } },
              content: { select: { shortDescription: true } },
            },
          }),
          prisma.product.count({ where }),
        ]),
      ["products-list", cacheKey],
      [CACHE_TAGS.products]
    );
    const [products, total] = await runQuery();

    const shaped = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      shortDescription: p.content?.shortDescription ?? null,
      rating: p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null,
      reviewCount: p.reviews.length,
      variants: p.variants.map((v) => ({
        id: v.id,
        size: v.size,
        price: v.price,
        mrp: v.mrp,
        inStock: (v.inventory?.quantity ?? 0) > 0,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: shaped,
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
