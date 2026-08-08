/**
 * Sprint 2 Part 3 — attribute each product's already-uploaded Cloudinary
 * images (Product.images, from Execution Sprint 1) to the correct
 * ProductVariant, using the exact same deterministic folder mapping and
 * file ordering the original upload used (scripts/import-product-images.ts
 * — FOLDER_MAP + listImageFilesRecursive). No re-upload, no new Cloudinary
 * assets: Product.images is already the concatenation of each source
 * folder's files in folder-number order, so this script re-derives each
 * folder's file COUNT from the same local source folders (still present at
 * product-images-import/, gitignored) and slices the existing URL array
 * accordingly — guaranteed consistent with what's already live because it's
 * the same source of truth, not a re-guess.
 *
 * Product.images itself is left untouched — it remains the catalog-wide
 * fallback for card-style surfaces. This only populates the new, additive
 * ProductVariant.images column.
 *
 * Idempotent: skips any variant that already has images.length > 0.
 * Defaults to dry-run. Pass EXECUTE=1 to write for real.
 * Run with: npx tsx scripts/sprint2-variant-image-split.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROOT = path.join(__dirname, "..", "product-images-import", "Product images");

// Identical to scripts/import-product-images.ts's FOLDER_MAP.
const FOLDER_MAP: Record<number, { slug: string; size: string } | null> = {
  1: { slug: "muv-indian-rose-liquid-detergent", size: "1L" },
  2: { slug: "muv-indian-rose-liquid-detergent", size: "5L" },
  3: { slug: "muv-cool-water-liquid-detergent", size: "1L" },
  4: { slug: "muv-cool-water-liquid-detergent", size: "5L" },
  5: { slug: "muv-lavender-garden-liquid-detergent", size: "1L" },
  6: { slug: "muv-lavender-garden-liquid-detergent", size: "5L" },
  7: { slug: "muv-toilet-cleaner", size: "500ml" },
  8: { slug: "muv-toilet-cleaner", size: "5L" },
  9: { slug: "muv-dishwash-gel", size: "500ml" },
  10: { slug: "muv-dishwash-gel", size: "1L" },
  11: { slug: "muv-dishwash-gel", size: "5L" },
  12: { slug: "muv-bathroom-cleaner", size: "500ml" },
  13: { slug: "muv-glass-cleaner", size: "500ml" },
  14: { slug: "muv-velvet-mist-floor-cleaner", size: "1L" },
  15: { slug: "muv-cloud-walk-floor-cleaner", size: "1L" },
  16: { slug: "muv-velvet-mist-floor-cleaner", size: "5L" },
  17: { slug: "muv-cloud-walk-floor-cleaner", size: "5L" },
  18: { slug: "muv-car-wash", size: "500ml" },
  19: { slug: "muv-car-wash", size: "5L" },
  20: { slug: "muv-white-phenyl", size: "1L" },
  21: { slug: "muv-white-phenyl", size: "5L" },
  22: null,
  23: { slug: "muv-bleach", size: "500ml" },
  24: { slug: "muv-life-shield-hand-wash", size: "250ml" },
  25: { slug: "muv-life-shield-hand-wash", size: "500ml" },
  26: { slug: "muv-silk-blossom-hand-wash", size: "500ml" },
  27: { slug: "muv-ocean-fresh-hand-wash", size: "500ml" },
  28: { slug: "muv-ocean-fresh-hand-wash", size: "5L" },
  29: { slug: "muv-citrus-blast-hand-wash", size: "250ml" },
  30: { slug: "muv-citrus-blast-hand-wash", size: "500ml" },
  31: { slug: "muv-citrus-blast-hand-wash", size: "5L" },
  32: { slug: "muv-crimson-veil-body-wash", size: "250ml" },
  33: { slug: "muv-crimson-veil-body-wash", size: "950ml" },
  34: { slug: "muv-velvet-oak-body-wash", size: "250ml" },
  35: { slug: "muv-velvet-oak-body-wash", size: "950ml" },
  36: { slug: "muv-midnight-frost-body-wash", size: "250ml" },
  37: { slug: "muv-midnight-frost-body-wash", size: "950ml" },
};

function countImageFilesRecursive(dir: string): number {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) count += countImageFilesRecursive(full);
    else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name)) count++;
  }
  return count;
}

async function main() {
  const execute = process.env.EXECUTE === "1";
  const dirEntries = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory());

  // Rebuild, per product slug, the ordered list of (size, fileCount) —
  // same ascending-folder-number order the original upload concatenated.
  const bySlug = new Map<string, { folderNum: number; size: string; count: number }[]>();
  for (const entry of dirEntries) {
    const m = entry.name.match(/^(\d+)\s+/);
    const num = m ? parseInt(m[1]!, 10) : NaN;
    const mapping = FOLDER_MAP[num];
    if (!mapping) continue;
    const count = countImageFilesRecursive(path.join(ROOT, entry.name));
    const list = bySlug.get(mapping.slug) ?? [];
    list.push({ folderNum: num, size: mapping.size, count });
    bySlug.set(mapping.slug, list);
  }

  const report: any[] = [];

  for (const [slug, folders] of bySlug) {
    folders.sort((a, b) => a.folderNum - b.folderNum);
    const product = await prisma.product.findUnique({ where: { slug }, include: { variants: true } });
    if (!product) {
      report.push({ slug, error: "product not found" });
      continue;
    }
    const totalExpected = folders.reduce((s, f) => s + f.count, 0);
    if (product.images.length !== totalExpected) {
      report.push({ slug, error: `Product.images has ${product.images.length} entries, expected ${totalExpected} from source folders — skipping to avoid a bad slice` });
      continue;
    }

    let cursor = 0;
    const productReport: any = { slug, variants: [] };
    for (const f of folders) {
      const slice = product.images.slice(cursor, cursor + f.count);
      cursor += f.count;
      const variant = product.variants.find((v) => v.size === f.size);
      if (!variant) {
        productReport.variants.push({ size: f.size, error: "no matching ProductVariant" });
        continue;
      }
      if (variant.images.length > 0) {
        productReport.variants.push({ size: f.size, status: "SKIPPED — already has images", existingCount: variant.images.length });
        continue;
      }
      productReport.variants.push({ size: f.size, status: execute ? "UPDATED" : "[DRY RUN] would update", count: slice.length, cover: slice[0] });
      if (execute) {
        await prisma.productVariant.update({ where: { id: variant.id }, data: { images: slice } });
      }
    }
    report.push(productReport);
  }

  console.log(JSON.stringify({ mode: execute ? "EXECUTE" : "DRY_RUN", report }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
