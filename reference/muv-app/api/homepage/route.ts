import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, statusForError } from "@/lib/errors";
import { cached, CACHE_TAGS } from "@/lib/cache";

/**
 * One aggregate endpoint for everything the homepage needs from the CMS,
 * rather than five separate round-trips (banners, sections, announcement,
 * newsletter, best sellers) — the homepage renders as one Server Component
 * anyway, so there's no benefit to the client waterfalling multiple fetches
 * for content that's always needed together.
 */
const getHomepageContent = cached(
  async () => {
    const [heroBanners, promoBanners, sections, announcement, newsletter, bestSellers] = await Promise.all([
      prisma.banner.findMany({ where: { type: "HERO", active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.banner.findMany({ where: { type: "PROMO", active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.homepageSection.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.announcementBar.findUnique({ where: { id: "singleton" } }),
      prisma.newsletterContent.findUnique({ where: { id: "singleton" } }),
      prisma.product.findMany({
        where: { bestSellerRank: { not: null }, status: "ACTIVE" },
        orderBy: { bestSellerRank: "asc" },
        include: { variants: { orderBy: { price: "asc" }, take: 1 } },
      }),
    ]);

    return { heroBanners, promoBanners, sections, announcement, newsletter, bestSellers };
  },
  ["homepage-content"],
  [CACHE_TAGS.homepage]
);

export async function GET() {
  try {
    const data = await getHomepageContent();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
