import { z } from "zod";

export const bannerSchema = z.object({
  type: z.enum(["HERO", "PROMO"]),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().max(40).optional(),
  ctaLink: z.string().max(200).optional(),
  active: z.boolean().default(true),
});
export const createBannerSchema = bannerSchema;
// Banner.id is `String @id @default(cuid())` in schema — cuid() is only the
// *default generator* for new rows, not a format constraint on the column.
// Seeded rows (e.g. "seed-hero-1") are valid, real primary keys that don't
// match the CUID shape, so this only checks for a non-empty id, same as
// Prisma itself does.
export const updateBannerSchema = bannerSchema.partial().extend({ id: z.string().min(1, "Invalid id") });
export const reorderBannersSchema = z.object({
  type: z.enum(["HERO", "PROMO"]),
  orderedIds: z.array(z.string().min(1, "Invalid id")),
});

export const updateSectionsSchema = z.array(
  z.object({ key: z.string(), sortOrder: z.number().int(), visible: z.boolean() })
);

export const announcementBarSchema = z.object({
  message: z.string().min(1).max(200),
  link: z.string().max(200).optional(),
  active: z.boolean(),
});

export const newsletterContentSchema = z.object({
  heading: z.string().min(1).max(100),
  subtext: z.string().min(1).max(200),
});

// Max 4 — enforced here rather than only in the admin UI, since this is
// also reachable via a direct server action call.
export const setBestSellersSchema = z.array(z.string().cuid()).max(4, "Pick at most 4 products");

export const setFeaturedSchema = z.object({ productId: z.string().cuid(), featured: z.boolean() });
