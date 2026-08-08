import { z } from "zod";

export const createReviewSchema = z.object({
  productId: z.string().cuid(),
  rating: z.number().int().min(1, "Pick at least one star").max(5),
  title: z.string().max(100).optional(),
  // Final Customer Experience Sprint, Phase 4 — only the star rating is
  // mandatory; a customer may submit a rating alone, with no written review.
  body: z.string().max(1000).optional(),
});

export const moderateReviewSchema = z.object({
  reviewId: z.string().cuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
});
