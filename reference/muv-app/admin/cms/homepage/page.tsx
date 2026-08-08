import { prisma } from "@/lib/prisma";
import { HomepageCmsClient } from "@/components/admin/homepage-cms-client";

export default async function AdminHomepageCmsPage() {
  const [banners, sections, announcementBar, newsletterContent, products] = await Promise.all([
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.homepageSection.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.announcementBar.findUnique({ where: { id: "singleton" } }),
    prisma.newsletterContent.findUnique({ where: { id: "singleton" } }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, isFeatured: true, bestSellerRank: true } }),
  ]);

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Homepage CMS</h1>
      <HomepageCmsClient
        banners={banners}
        sections={sections}
        announcementBar={announcementBar}
        newsletterContent={newsletterContent}
        products={products}
      />
    </div>
  );
}
