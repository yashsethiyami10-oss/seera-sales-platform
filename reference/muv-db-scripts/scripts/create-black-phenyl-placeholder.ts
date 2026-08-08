/**
 * MUV Production Catalog — Black Phenyl placeholder record.
 *
 * Per Founder Final UI Approval: create only "MUV Black Phenyl" (1L is the
 * approved pack size, per docs/knowledge-factory/products/black-phenyl/
 * 10_LIVE_DATA_MAPPING.md), status DRAFT, NO variant — no real MRP exists
 * for the 1L pack anywhere in this repository, and ProductVariant.price/mrp
 * are required non-nullable fields, so no variant can be created without
 * fabricating a number. This script creates only the Product row (the
 * "placeholder record" the Founder's instruction refers to). A follow-up
 * script, once a real MRP is supplied, should create the ProductVariant +
 * Inventory row and flip this Product's status to ACTIVE — not delete or
 * recreate this record.
 *
 * Idempotent: upserts by slug, safe to re-run.
 *
 * Run with: npx tsx scripts/create-black-phenyl-placeholder.ts
 */
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/utils/slugify";

const prisma = new PrismaClient();

async function main() {
  const category = await prisma.category.findUnique({ where: { slug: "home-care" } });
  if (!category) throw new Error("Home Care category not found — run production-structural-import.ts first");

  const name = "MUV Black Phenyl";
  const slug = slugify(name);

  const existing = await prisma.product.findUnique({ where: { slug } });

  const product = await prisma.product.upsert({
    where: { slug },
    update: {},
    create: {
      name,
      slug,
      categoryId: category.id,
      shortDescription: `${name} — full product description coming soon.`,
      status: "DRAFT",
      isFeatured: false,
    },
  });

  const variantCount = await prisma.productVariant.count({ where: { productId: product.id } });

  console.log(JSON.stringify({
    action: existing ? "ALREADY_EXISTED_UNCHANGED" : "CREATED",
    product: { id: product.id, name: product.name, slug: product.slug, status: product.status, categoryId: product.categoryId },
    variantCount,
    note: variantCount === 0
      ? "No variant created — no real MRP exists for the 1L pack anywhere in this repository. Supply a real MRP to create the 1L variant and activate this product."
      : "Unexpected: a variant already exists on this product — verify manually before assuming this script's own prior run created it.",
  }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
