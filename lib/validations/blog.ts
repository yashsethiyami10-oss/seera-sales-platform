import { z } from "zod";

export const createBlogPostSchema = z
  .object({
    title: z.string().min(3).max(150),
    slug: z.string().min(3).max(150).regex(/^[a-z0-9-]+$/),
    categoryId: z.string().cuid(),
    excerpt: z.string().max(300).optional(),
    body: z.string().min(1, "Article body can't be empty"),
    featuredImageUrl: z.string().url().optional(),
    status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).default("DRAFT"),
    scheduledAt: z.coerce.date().optional(),
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
  })
  .refine((v) => v.status !== "SCHEDULED" || v.scheduledAt, {
    message: "Pick a publish date for a scheduled post",
    path: ["scheduledAt"],
  });

export const updateBlogPostSchema = createBlogPostSchema.innerType().partial().extend({ id: z.string().cuid() });

export const blogQuerySchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
