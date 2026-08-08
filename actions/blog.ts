"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { createBlogPostSchema, updateBlogPostSchema } from "@/lib/validations/blog";
import { invalidate, CACHE_TAGS } from "@/lib/cache";
import { withLogging } from "@/lib/logger";

export const createBlogPost = withLogging("createBlogPost", async (input: unknown) => {
  try {
    const user = await requireStaff();
    const data = createBlogPostSchema.parse(input);

    const post = await prisma.blogPost.create({
      data: {
        ...data,
        authorId: user.id,
        // PUBLISHED is set the moment it's created that way; SCHEDULED posts
        // get publishedAt filled in later by the scheduler (see note below).
        publishedAt: data.status === "PUBLISHED" ? new Date() : null,
      },
    });

    invalidate(CACHE_TAGS.blogList);
    revalidatePath("/admin/blog");
    revalidatePath("/journal");
    return { success: true as const, data: post };
  } catch (err) {
    return toErrorResponse(err);
  }
});

export const updateBlogPost = withLogging("updateBlogPost", async (input: unknown) => {
  try {
    await requireStaff();
    const { id, ...data } = updateBlogPostSchema.parse(input);

    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Article");

    const wasUnpublished = existing.status !== "PUBLISHED";
    const isNowPublished = data.status === "PUBLISHED";

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        ...data,
        // Only stamp publishedAt the moment it *transitions* to PUBLISHED —
        // re-saving an already-published post must not reset its publish date.
        publishedAt: wasUnpublished && isNowPublished ? new Date() : existing.publishedAt,
      },
    });

    invalidate(CACHE_TAGS.blogList, CACHE_TAGS.blogPost(existing.slug));
    revalidatePath("/admin/blog");
    revalidatePath(`/journal/${existing.slug}`);
    return { success: true as const, data: post };
  } catch (err) {
    return toErrorResponse(err);
  }
});

export const deleteBlogPost = withLogging("deleteBlogPost", async (id: string) => {
  try {
    await requireStaff();
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Article");

    await prisma.blogPost.delete({ where: { id } });
    invalidate(CACHE_TAGS.blogList, CACHE_TAGS.blogPost(existing.slug));
    revalidatePath("/admin/blog");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
});

/**
 * SCHEDULING NOTE: a SCHEDULED post only becomes visible on the storefront
 * once something flips its status to PUBLISHED at (or after) `scheduledAt`.
 * This app has no background job runner, so that flip needs one of:
 *   (a) a Vercel Cron job hitting a protected route every few minutes that
 *       runs the query below, or
 *   (b) a database trigger, or
 *   (c) checking `scheduledAt <= now()` directly in the public blog query
 *       instead of relying on `status` alone (simplest — see app/api/blog/route.ts,
 *       which does exactly this rather than depending on a cron job existing).
 */
export const publishDueScheduledPosts = withLogging("publishDueScheduledPosts", async () => {
  const due = await prisma.blogPost.updateMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    data: { status: "PUBLISHED" },
  });
  if (due.count > 0) invalidate(CACHE_TAGS.blogList);
  return { success: true as const, data: { publishedCount: due.count } };
});
