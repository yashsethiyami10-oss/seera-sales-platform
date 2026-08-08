import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, statusForError, NotFoundError } from "@/lib/errors";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const post = await prisma.blogPost.findUnique({
      where: { slug },
      include: { category: { select: { name: true, slug: true } }, author: { select: { name: true } } },
    });

    const isVisible =
      post && (post.status === "PUBLISHED" || (post.status === "SCHEDULED" && post.scheduledAt && post.scheduledAt <= new Date()));

    if (!isVisible) throw new NotFoundError("Article");

    return NextResponse.json({
      success: true,
      data: {
        id: post!.id,
        title: post!.title,
        slug: post!.slug,
        body: post!.body,
        category: post!.category,
        author: post!.author?.name ?? "Muv Editorial",
        publishedAt: post!.publishedAt,
        metaTitle: post!.metaTitle,
        metaDescription: post!.metaDescription,
        featuredImageUrl: post!.featuredImageUrl,
      },
    });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
