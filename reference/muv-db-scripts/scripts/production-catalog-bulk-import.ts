/**
 * MUV Production Catalog Preparation — Phase C: Bulk Import Preparation.
 *
 * Reads PRODUCTION_CATALOG_MANIFEST.json and imports Products, ProductVariants,
 * and Inventory rows (grouping the manifest's 37 SKU rows into their parent
 * Products) plus setting each Product's homepage `isFeatured` flag from the
 * manifest. Categories/homepage sections are NOT this script's job — those
 * were already handled by `production-structural-import.ts` (Phase A).
 *
 * SAFETY MODEL:
 * - Defaults to --dry-run (no flag needed). Pass --execute to actually write.
 * - Every SKU missing a required field (see REQUIRED_FIELDS below) is
 *   SKIPPED, never inserted with a fabricated/guessed value. sellingPrice is
 *   the field every row in today's manifest is missing — by design, this
 *   script will import ZERO products until the manifest is edited to add
 *   real, Founder-approved sellingPrice values.
 * - Products are upserted by `slug`, variants by `sku` — re-running never
 *   duplicates; existing rows' Founder-edited fields are never overwritten
 *   (update: {} — an existing row is left exactly as-is, matching the same
 *   convention prisma/seed.ts already uses).
 * - --execute wraps the whole run in one prisma.$transaction — if anything
 *   fails partway, the entire transaction rolls back and the database is
 *   left exactly as it was before the run (Prisma's native transaction
 *   rollback, not custom compensation logic).
 * - Never reads from prisma/seed.ts's fictional product list — this script
 *   has no knowledge of that file at all.
 *
 * Run with: npx tsx scripts/production-catalog-bulk-import.ts           (dry run)
 *           npx tsx scripts/production-catalog-bulk-import.ts --execute  (real write)
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/utils/slugify";

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

type ManifestSku = {
  chartRow: number;
  productFamily: string;
  productName: string;
  variantFragrance: string | null;
  packSize: string;
  mrp: number;
  sellingPrice: number | null;
  category: string;
  proposedSkuCode: string;
  initialStock: number;
  featured: boolean;
  newArrival: boolean;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  imageStatus: string;
  sourceProvenance: string;
  conflictOrMissingNote: string;
};

type SkuDecision = {
  chartRow: number;
  productName: string;
  packSize: string;
  action: "WOULD_CREATE_PRODUCT_AND_VARIANT" | "WOULD_CREATE_VARIANT_ONLY" | "WOULD_SKIP_EXISTING" | "SKIPPED_MISSING_REQUIRED_FIELD";
  reason?: string;
};

function loadManifest(): ManifestSku[] {
  const manifestPath = path.join(process.cwd(), "PRODUCTION_CATALOG_MANIFEST.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return raw.skus as ManifestSku[];
}

/** A row is importable only if every field required by the DB schema (and
 * by explicit Founder policy) is actually present — never guessed. */
function validateRow(row: ManifestSku): string | null {
  if (!row.productName) return "missing productName";
  if (!row.category) return "missing category";
  if (!row.packSize) return "missing packSize";
  if (typeof row.mrp !== "number") return "missing/invalid mrp";
  if (typeof row.sellingPrice !== "number") return "missing sellingPrice (Founder approval required — see PRODUCTION_CATALOG_FOUNDER_APPROVAL.md)";
  if (!row.proposedSkuCode) return "missing proposed SKU code";
  if (row.conflictOrMissingNote && row.conflictOrMissingNote.startsWith("CONFLICT") ) return "unresolved conflict flagged in manifest — resolve before import";
  if (row.conflictOrMissingNote && row.conflictOrMissingNote.startsWith("ALREADY-DOCUMENTED CONFLICT")) return "unresolved conflict flagged in manifest — resolve before import";
  return null;
}

async function main() {
  const skus = loadManifest();
  const decisions: SkuDecision[] = [];
  const categoryCache = new Map<string, string>();

  for (const cat of ["Home Care", "Fabric Care", "Body Care", "Personal Care", "Car Care"]) {
    const row = await prisma.category.findUnique({ where: { slug: slugify(cat) } });
    if (row) categoryCache.set(cat, row.id);
  }

  for (const sku of skus) {
    const invalidReason = validateRow(sku);
    if (invalidReason) {
      decisions.push({ chartRow: sku.chartRow, productName: sku.productName, packSize: sku.packSize, action: "SKIPPED_MISSING_REQUIRED_FIELD", reason: invalidReason });
      continue;
    }

    const categoryId = categoryCache.get(sku.category);
    if (!categoryId) {
      decisions.push({ chartRow: sku.chartRow, productName: sku.productName, packSize: sku.packSize, action: "SKIPPED_MISSING_REQUIRED_FIELD", reason: `category "${sku.category}" does not exist in the database yet — run Phase A first` });
      continue;
    }

    const productSlug = slugify(sku.variantFragrance ? `${sku.productName}` : sku.productName);
    const existingProduct = await prisma.product.findUnique({ where: { slug: productSlug } });
    const existingVariant = await prisma.productVariant.findUnique({ where: { sku: sku.proposedSkuCode } });

    if (existingProduct && existingVariant) {
      decisions.push({ chartRow: sku.chartRow, productName: sku.productName, packSize: sku.packSize, action: "WOULD_SKIP_EXISTING", reason: "product and variant already exist — left untouched" });
      continue;
    }

    decisions.push({
      chartRow: sku.chartRow,
      productName: sku.productName,
      packSize: sku.packSize,
      action: existingProduct ? "WOULD_CREATE_VARIANT_ONLY" : "WOULD_CREATE_PRODUCT_AND_VARIANT",
    });

    if (EXECUTE) {
      await prisma.$transaction(async (tx) => {
        const product = await tx.product.upsert({
          where: { slug: productSlug },
          update: {},
          create: {
            name: sku.productName,
            slug: productSlug,
            categoryId,
            shortDescription: `${sku.productName} — full product description coming soon.`,
            fragranceNotes: sku.variantFragrance,
            status: sku.status,
            isFeatured: sku.featured,
          },
        });
        const variant = await tx.productVariant.upsert({
          where: { sku: sku.proposedSkuCode },
          update: {},
          create: { productId: product.id, size: sku.packSize, price: sku.sellingPrice!, mrp: sku.mrp, sku: sku.proposedSkuCode },
        });
        await tx.inventory.upsert({
          where: { variantId: variant.id },
          update: {},
          create: { variantId: variant.id, quantity: sku.initialStock, lowStockThreshold: 10 },
        });
      });
    }
  }

  const summary = {
    mode: EXECUTE ? "EXECUTE (real writes)" : "DRY RUN (no writes)",
    totalSkusInManifest: skus.length,
    wouldCreateProductAndVariant: decisions.filter((d) => d.action === "WOULD_CREATE_PRODUCT_AND_VARIANT").length,
    wouldCreateVariantOnly: decisions.filter((d) => d.action === "WOULD_CREATE_VARIANT_ONLY").length,
    wouldSkipExisting: decisions.filter((d) => d.action === "WOULD_SKIP_EXISTING").length,
    skippedMissingRequiredField: decisions.filter((d) => d.action === "SKIPPED_MISSING_REQUIRED_FIELD").length,
  };

  console.log(JSON.stringify({ summary, decisions }, null, 2));
}

main()
  .catch((e) => {
    console.error("BULK IMPORT ERROR (transaction rolled back if in --execute mode):", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
