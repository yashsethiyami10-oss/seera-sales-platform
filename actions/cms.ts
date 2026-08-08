"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError } from "@/lib/errors";
import {
  createBannerSchema,
  updateBannerSchema,
  reorderBannersSchema,
  updateSectionsSchema,
  announcementBarSchema,
  newsletterContentSchema,
  setBestSellersSchema,
  setFeaturedSchema,
} from "@/lib/validations/cms";
import { invalidate, CACHE_TAGS } from "@/lib/cache";

function revalidateHomepage() {
  invalidate(CACHE_TAGS.homepage);
  revalidatePath("/admin/cms/homepage");
  revalidatePath("/"); // storefront homepage
}

/* ---- Banners (Hero + Promo share one table, filtered by `type`) ---- */

export async function createBanner(input: unknown) {
  try {
    await requireStaff();
    const data = createBannerSchema.parse(input);
    const maxOrder = await prisma.banner.aggregate({ where: { type: data.type }, _max: { sortOrder: true } });
    const banner = await prisma.banner.create({ data: { ...data, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 } });
    revalidateHomepage();
    return { success: true as const, data: banner };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateBanner(input: unknown) {
  try {
    await requireStaff();
    const { id, ...data } = updateBannerSchema.parse(input);
    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Banner");
    const banner = await prisma.banner.update({ where: { id }, data });
    revalidateHomepage();
    return { success: true as const, data: banner };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteBanner(id: string) {
  try {
    await requireStaff();
    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Banner");
    await prisma.banner.delete({ where: { id } });
    revalidateHomepage();
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Persists a full drag-reordered (or up/down-nudged) list in one call. */
export async function reorderBanners(input: unknown) {
  try {
    await requireStaff();
    const data = reorderBannersSchema.parse(input);

    await prisma.$transaction(
      data.orderedIds.map((id, index) =>
        prisma.banner.update({ where: { id }, data: { sortOrder: index } })
      )
    );

    revalidateHomepage();
    return { success: true as const, data: { count: data.orderedIds.length } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/* ---- Sections order/visibility ---- */

export async function updateSections(input: unknown) {
  try {
    await requireStaff();
    const sections = updateSectionsSchema.parse(input);

    await prisma.$transaction(
      sections.map((s) =>
        prisma.homepageSection.upsert({
          where: { key: s.key },
          update: { sortOrder: s.sortOrder, visible: s.visible },
          create: { key: s.key, label: s.key, sortOrder: s.sortOrder, visible: s.visible },
        })
      )
    );

    revalidateHomepage();
    return { success: true as const, data: sections };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/* ---- Announcement bar + newsletter content (singleton rows) ---- */

export async function updateAnnouncementBar(input: unknown) {
  try {
    await requireStaff();
    const data = announcementBarSchema.parse(input);
    const bar = await prisma.announcementBar.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    revalidateHomepage();
    return { success: true as const, data: bar };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateNewsletterContent(input: unknown) {
  try {
    await requireStaff();
    const data = newsletterContentSchema.parse(input);
    const content = await prisma.newsletterContent.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    revalidateHomepage();
    return { success: true as const, data: content };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/* ---- Best Sellers picker (max 4, order = array order) ---- */

export async function setBestSellers(input: unknown) {
  try {
    await requireStaff();
    const productIds = setBestSellersSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      // Clear the rank on whatever was previously selected, then assign
      // fresh ranks to exactly the new set — avoids leaving a stale rank
      // on a product that got removed from the picker.
      await tx.product.updateMany({ where: { bestSellerRank: { not: null } }, data: { bestSellerRank: null } });
      for (let i = 0; i < productIds.length; i++) {
        await tx.product.update({ where: { id: productIds[i] }, data: { bestSellerRank: i + 1 } });
      }
    });

    revalidateHomepage();
    revalidatePath("/shop");
    return { success: true as const, data: { count: productIds.length } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function setFeaturedProduct(input: unknown) {
  try {
    await requireStaff();
    const data = setFeaturedSchema.parse(input);
    const product = await prisma.product.update({ where: { id: data.productId }, data: { isFeatured: data.featured } });
    invalidate(CACHE_TAGS.products);
    revalidatePath("/admin/marketing");
    return { success: true as const, data: product };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/* ---- Categories (Category CMS) ---- */

import { z } from "zod";
const categorySchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  comingSoon: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
});

export async function createCategory(input: unknown) {
  try {
    await requireStaff();
    const data = categorySchema.parse(input);
    const category = await prisma.category.create({ data });
    invalidate(CACHE_TAGS.categories);
    revalidatePath("/admin/cms/categories");
    return { success: true as const, data: category };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateCategory(input: unknown) {
  try {
    await requireStaff();
    const { id, ...data } = categorySchema.partial().extend({ id: z.string().cuid() }).parse(input);
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Category");
    const category = await prisma.category.update({ where: { id }, data });
    invalidate(CACHE_TAGS.categories);
    revalidatePath("/admin/cms/categories");
    return { success: true as const, data: category };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteCategory(id: string) {
  try {
    await requireStaff();
    const existing = await prisma.category.findUnique({ where: { id }, include: { products: { take: 1 } } });
    if (!existing) throw new NotFoundError("Category");
    if (existing.products.length > 0) {
      throw new AppError("Move or delete this category's products first", 409, "CATEGORY_NOT_EMPTY");
    }
    await prisma.category.delete({ where: { id } });
    invalidate(CACHE_TAGS.categories);
    revalidatePath("/admin/cms/categories");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
