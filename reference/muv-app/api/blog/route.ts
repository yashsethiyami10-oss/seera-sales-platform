import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, statusForError } from "@/lib/errors";
import { blogQuerySchema } from "@/lib/validations/blog";
import { paginationMeta, toSkipTake } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const query = blogQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { skip, take } = toSkipTake(query);

    // A post counts as publicly visible if it's PUBLISHED, or SCHEDULED with
    // a due date already in the past — see the scheduling note in
    // app/actions/blog.ts for why this check exists here rather than relying
    // solely on a background job to have already flipped `status`.
    const where = {
      OR: [{ status: "PUBLISHED" as const }, { status: "SCHEDULED" as const, scheduledAt: { lte: new Date() } }],
      ...(query.category ? { category: { slug: query.category } } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip,
        take,
        include: { category: { select: { name: true, slug: true } }, author: { select: { name: true } } },
      }),
      prisma.blogPost.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        featuredImageUrl: p.featuredImageUrl,
        category: p.category,
        author: p.author?.name ?? "Muv Editorial",
        publishedAt: p.publishedAt,
      })),
      pagination: paginationMeta(query, total),
    });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
