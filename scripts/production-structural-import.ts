/**
 * MUV Production Catalog Preparation — Phase A: Safe Structural Import.
 *
 * Inserts ONLY the real category taxonomy and the homepage-section
 * visibility registry — no products, no prices, no images, no banners, no
 * marketing copy. Every write is an `upsert` keyed on a real unique column
 * (`slug` for categories, `key` for homepage sections), so this script is
 * idempotent by construction: running it any number of times converges on
 * the same 6 category rows and 8 homepage-section rows, never duplicates.
 *
 * Deliberately separate from prisma/seed.ts, which remains untouched and
 * keeps seeding its own fictional demo catalog for local dev use — this
 * script is the real-data counterpart, meant to run against production.
 *
 * Run with: npx tsx scripts/production-structural-import.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categoryData = [
  { name: "Home Care", slug: "home-care", sortOrder: 0 },
  { name: "Fabric Care", slug: "fabric-care", sortOrder: 1 },
  { name: "Body Care", slug: "body-care", sortOrder: 2 },
  { name: "Personal Care", slug: "personal-care", sortOrder: 3 },
  { name: "Car Care", slug: "car-care", sortOrder: 4 },
  { name: "Skin Care", slug: "skin-care", sortOrder: 5, comingSoon: true },
];

const sectionData = [
  { key: "hero", label: "Hero", sortOrder: 0 },
  { key: "marquee", label: "Trust Marquee", sortOrder: 1 },
  { key: "categories", label: "Categories", sortOrder: 2 },
  { key: "bestsellers", label: "Best Sellers", sortOrder: 3 },
  { key: "brandstory", label: "Brand Story", sortOrder: 4 },
  { key: "reviews", label: "Customer Reviews", sortOrder: 5 },
  { key: "business", label: "Business", sortOrder: 6 },
  { key: "newsletter", label: "Newsletter", sortOrder: 7 },
];

async function main() {
  const before = {
    categories: await prisma.category.count(),
    sections: await prisma.homepageSection.count(),
  };

  let categoriesCreated = 0;
  let categoriesUnchanged = 0;
  for (const c of categoryData) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    if (existing) categoriesUnchanged++;
    else categoriesCreated++;
  }

  let sectionsCreated = 0;
  let sectionsUnchanged = 0;
  for (const s of sectionData) {
    const existing = await prisma.homepageSection.findUnique({ where: { key: s.key } });
    await prisma.homepageSection.upsert({ where: { key: s.key }, update: {}, create: { ...s, visible: true } });
    if (existing) sectionsUnchanged++;
    else sectionsCreated++;
  }

  const after = {
    categories: await prisma.category.count(),
    sections: await prisma.homepageSection.count(),
  };

  console.log(JSON.stringify({
    before,
    after,
    thisRun: { categoriesCreated, categoriesUnchanged, sectionsCreated, sectionsUnchanged },
  }, null, 2));
}

main()
  .catch((e) => {
    console.error("STRUCTURAL IMPORT ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
