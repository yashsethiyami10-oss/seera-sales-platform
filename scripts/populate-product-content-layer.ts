/**
 * MUV Production Customer Content Layer — population script.
 *
 * Populates `ProductContent` rows from ONLY customer-safe content actually
 * found in the Knowledge Library during direct investigation of this
 * repository (docs/knowledge-factory/products/*). Every string below is a
 * near-verbatim, minimally-trimmed extract from a real "Content:" section —
 * NOT authored/invented copy. Trimming removed exactly three categories,
 * per the Founder's explicit rule, and nothing else:
 *   1. Raw material / chemical abbreviations (SLES, CAPB, CDEA, HEC, IPA, ...)
 *   2. Any quantity or percentage figure (e.g. "1% Salicylic Acid", "28% active")
 *   3. A real competitor brand reference found in one source ("Harpic Floral",
 *      Toilet Cleaner's SOP-stated fragrance name) — excluded as a trademark/
 *      competitor-reference risk, not a formulation risk, but excluded for
 *      the same reason: not safe to publish as MUV's own customer copy.
 *
 * Fields left null below are NOT filled with placeholder text (per explicit
 * instruction) — no source was found for them. See
 * PRODUCTION_CONTENT_ARCHITECTURE_REPORT.md for the full per-field, per-
 * family disclosure of what's populated vs. genuinely pending.
 *
 * Idempotent (upsert by productId), never touches Product's own price/sku/
 * inventory/images/category/status — this script only ever writes to the
 * `product_content` table.
 *
 * Run with: npx tsx scripts/populate-product-content-layer.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ContentEntry = {
  slug: string;
  shortDescription: string;
  seoTitle: string;
  searchKeywords: string[];
  sourceFile: string;
};

const entries: ContentEntry[] = [
  {
    slug: "muv-indian-rose-liquid-detergent",
    shortDescription: "A fabric-care liquid laundry detergent in the Indian Rose variant — pink/yellow colour, Rose Petal fragrance — available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV Indian Rose Liquid Detergent",
    searchKeywords: ["MUV", "Indian Rose", "Liquid Detergent", "Fabric Care", "laundry detergent"],
    sourceFile: "docs/knowledge-factory/products/liquid-detergent/02_Product_Description.md#KO-LD-DESC-001; 10_Product_Variants.md",
  },
  {
    slug: "muv-cool-water-liquid-detergent",
    shortDescription: "A fabric-care liquid laundry detergent in the Cool Water variant — blue colour, DM Comfort fragrance — available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV Cool Water Liquid Detergent",
    searchKeywords: ["MUV", "Cool Water", "Liquid Detergent", "Fabric Care", "laundry detergent"],
    sourceFile: "docs/knowledge-factory/products/liquid-detergent/02_Product_Description.md#KO-LD-DESC-001; 10_Product_Variants.md",
  },
  {
    slug: "muv-lavender-garden-liquid-detergent",
    shortDescription: "A fabric-care liquid laundry detergent in the Lavender Garden variant — lavender colour, Lavender Eco fragrance — available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV Lavender Garden Liquid Detergent",
    searchKeywords: ["MUV", "Lavender Garden", "Liquid Detergent", "Fabric Care", "laundry detergent"],
    sourceFile: "docs/knowledge-factory/products/liquid-detergent/02_Product_Description.md#KO-LD-DESC-001; 10_Product_Variants.md",
  },
  {
    slug: "muv-toilet-cleaner",
    shortDescription: "MUV Toilet Cleaner is a Home Care acid-based toilet bowl cleaner, sold as a single formulation in two pack sizes — 500 ml and 5 Litre.",
    seoTitle: "MUV Toilet Cleaner",
    searchKeywords: ["MUV", "Toilet Cleaner", "Home Care", "acid-based cleaner"],
    sourceFile: "docs/knowledge-factory/products/toilet-cleaner/02_Product_Description.md#KO-TC-DESC-001 (fragrance name excluded — source SOP names a competitor brand, not safe to publish)",
  },
  {
    slug: "muv-dishwash-gel",
    shortDescription: "MUV Dishwash Gel is a Home Care liquid dishwashing gel, sold as a single lemon-fragranced, yellow-coloured formulation in three pack sizes — 500 ml, 1 Litre, and 5 Litre.",
    seoTitle: "MUV Dishwash Gel",
    searchKeywords: ["MUV", "Dishwash Gel", "Home Care", "dishwashing liquid"],
    sourceFile: "docs/knowledge-factory/products/dishwash-gel/03_Product_Description.md#KO-DW-DESC-001",
  },
  {
    slug: "muv-bathroom-cleaner",
    shortDescription: "MUV Fresh Bathroom Cleaner is a Home Care acid-based bathroom surface cleaner, sold in a single 500 ml pack size.",
    seoTitle: "MUV Fresh Bathroom Cleaner",
    searchKeywords: ["MUV", "Bathroom Cleaner", "Home Care", "acid-based cleaner"],
    sourceFile: "docs/knowledge-factory/products/fresh-bathroom-cleaner/03_Product_Description.md#KO-BC-DESC-001",
  },
  {
    slug: "muv-glass-cleaner",
    shortDescription: "MUV Glass Cleaner is a liquid glass and mirror surface cleaner, sold in a single 500 ml pack size.",
    seoTitle: "MUV Glass Cleaner",
    searchKeywords: ["MUV", "Glass Cleaner", "Home Care", "mirror cleaner"],
    sourceFile: "docs/knowledge-factory/products/crystal-glass-cleaner/03_Product_Description.md#KO-GC-DESC-001 (performance claim excluded — stated as an internal QC target, not an approved customer claim)",
  },
  {
    slug: "muv-velvet-mist-floor-cleaner",
    shortDescription: "A fragranced liquid floor-surface cleaner in the Velvet Mist variant — Lavender colour — available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV Velvet Mist Floor Cleaner",
    searchKeywords: ["MUV", "Velvet Mist", "Floor Cleaner", "Home Care"],
    sourceFile: "docs/knowledge-factory/products/floor-cleaner/03_Product_Description.md#KO-FC-DESC-001",
  },
  {
    slug: "muv-cloud-walk-floor-cleaner",
    shortDescription: "A fragranced liquid floor-surface cleaner in the Cloud Walk variant — Blue colour — available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV Cloud Walk Floor Cleaner",
    searchKeywords: ["MUV", "Cloud Walk", "Floor Cleaner", "Home Care"],
    sourceFile: "docs/knowledge-factory/products/floor-cleaner/03_Product_Description.md#KO-FC-DESC-001",
  },
  {
    slug: "muv-car-wash",
    shortDescription: "MUV Car Wash is a liquid exterior vehicle wash, sold in 500 ml and 5 Litre pack sizes.",
    seoTitle: "MUV Car Wash",
    searchKeywords: ["MUV", "Car Wash", "Car Care", "vehicle wash"],
    sourceFile: "docs/knowledge-factory/products/car-wash/03_Product_Intelligence.md#KO-CW-INTEL-001 (raw-material naming and finish-agent details excluded)",
  },
  {
    slug: "muv-white-phenyl",
    shortDescription: "MUV White Phenyl is a milky white phenyl floor cleaner formulated with a pine oil emulsion system, available in 1 Litre and 5 Litre pack sizes.",
    seoTitle: "MUV White Phenyl",
    searchKeywords: ["MUV", "White Phenyl", "Home Care", "floor cleaner", "disinfectant"],
    sourceFile: "docs/knowledge-factory/products/white-phenyl/03_Product_Intelligence.md#KO-WP-INTEL-001",
  },
  {
    slug: "muv-black-phenyl",
    shortDescription: "MUV Black Phenyl is a black-phenyl-concentrate-based floor cleaner and disinfectant.",
    seoTitle: "MUV Black Phenyl",
    searchKeywords: ["MUV", "Black Phenyl", "Home Care", "floor cleaner", "disinfectant"],
    sourceFile: "docs/knowledge-factory/products/black-phenyl/03_Product_Intelligence.md#KO-BP-INTEL-001",
  },
  {
    slug: "muv-bleach",
    shortDescription: "MUV Bleach is a sodium hypochlorite based bleach for household cleaning and whitening applications, sold in a 500 ml pack size.",
    seoTitle: "MUV Bleach",
    searchKeywords: ["MUV", "Bleach", "Home Care", "sodium hypochlorite", "whitening"],
    sourceFile: "docs/knowledge-factory/products/pure-bleach/03_Product_Intelligence.md#KO-PB-INTEL-001",
  },
  {
    slug: "muv-life-shield-hand-wash",
    shortDescription: "A pearlescent liquid hand wash in the Life Shield variant, available in 250 ml and 500 ml pack sizes.",
    seoTitle: "MUV Life Shield Hand Wash",
    searchKeywords: ["MUV", "Life Shield", "Hand Wash", "Personal Care"],
    sourceFile: "docs/knowledge-factory/products/hand-wash/03_Product_Intelligence.md#KO-HW-INTEL-001 (raw-material naming excluded)",
  },
  {
    slug: "muv-silk-blossom-hand-wash",
    shortDescription: "A pearlescent liquid hand wash in the Silk Blossom variant, available in a 500 ml pack size.",
    seoTitle: "MUV Silk Blossom Hand Wash",
    searchKeywords: ["MUV", "Silk Blossom", "Hand Wash", "Personal Care"],
    sourceFile: "docs/knowledge-factory/products/hand-wash/03_Product_Intelligence.md#KO-HW-INTEL-001 (raw-material naming excluded)",
  },
  {
    slug: "muv-ocean-fresh-hand-wash",
    shortDescription: "A pearlescent liquid hand wash in the Ocean Fresh variant, available in 500 ml and 5 Litre pack sizes.",
    seoTitle: "MUV Ocean Fresh Hand Wash",
    searchKeywords: ["MUV", "Ocean Fresh", "Hand Wash", "Personal Care"],
    sourceFile: "docs/knowledge-factory/products/hand-wash/03_Product_Intelligence.md#KO-HW-INTEL-001 (raw-material naming excluded)",
  },
  {
    slug: "muv-citrus-blast-hand-wash",
    shortDescription: "A pearlescent liquid hand wash in the Citrus Blast variant, available in 250 ml, 500 ml, and 5 Litre pack sizes.",
    seoTitle: "MUV Citrus Blast Hand Wash",
    searchKeywords: ["MUV", "Citrus Blast", "Hand Wash", "Personal Care"],
    sourceFile: "docs/knowledge-factory/products/hand-wash/03_Product_Intelligence.md#KO-HW-INTEL-001 (raw-material naming excluded)",
  },
  {
    slug: "muv-crimson-veil-body-wash",
    shortDescription: "MUV Body Wash in the Crimson Veil variant, available in 250 ml and 950 ml pack sizes.",
    seoTitle: "MUV Crimson Veil Body Wash",
    searchKeywords: ["MUV", "Crimson Veil", "Body Wash", "Body Care"],
    sourceFile: "docs/knowledge-factory/products/body-wash/03_Product_Intelligence.md#KO-BW-INTEL-001 (percentages, raw-material naming, and the internal 'safe' QC term excluded per that file's own governance note)",
  },
  {
    slug: "muv-velvet-oak-body-wash",
    shortDescription: "MUV Body Wash in the Velvet Oak variant, available in 250 ml and 950 ml pack sizes.",
    seoTitle: "MUV Velvet Oak Body Wash",
    searchKeywords: ["MUV", "Velvet Oak", "Body Wash", "Body Care"],
    sourceFile: "docs/knowledge-factory/products/body-wash/03_Product_Intelligence.md#KO-BW-INTEL-001 (percentages, raw-material naming, and the internal 'safe' QC term excluded per that file's own governance note)",
  },
  {
    slug: "muv-midnight-frost-body-wash",
    shortDescription: "MUV Body Wash in the Midnight Frost variant, available in 250 ml and 950 ml pack sizes.",
    seoTitle: "MUV Midnight Frost Body Wash",
    searchKeywords: ["MUV", "Midnight Frost", "Body Wash", "Body Care"],
    sourceFile: "docs/knowledge-factory/products/body-wash/03_Product_Intelligence.md#KO-BW-INTEL-001 (percentages, raw-material naming, and the internal 'safe' QC term excluded per that file's own governance note)",
  },
];

async function main() {
  let created = 0;
  let alreadyExisted = 0;
  let skippedNoProduct = 0;

  for (const entry of entries) {
    const product = await prisma.product.findUnique({ where: { slug: entry.slug } });
    if (!product) {
      console.log(`SKIP (no product row found for slug): ${entry.slug}`);
      skippedNoProduct++;
      continue;
    }

    const existing = await prisma.productContent.findUnique({ where: { productId: product.id } });

    await prisma.productContent.upsert({
      where: { productId: product.id },
      update: {}, // never overwrite an existing row — matches the "never overwrite Founder-approved values" rule
      create: {
        productId: product.id,
        shortDescription: entry.shortDescription,
        // longDescription, keyBenefits, howToUse, careInstructions, storage,
        // safetyInformation, productHighlights, faq, seoDescription: left
        // null — no safe source content was found for these fields in any
        // family investigated. Not placeholder text; genuinely absent.
        seoTitle: entry.seoTitle,
        searchKeywords: entry.searchKeywords,
        approvalStatus: "PENDING", // Founder has not explicitly signed off field-by-field yet — see report
        sourceProvenance: { shortDescription: entry.sourceFile, seoTitle: "product name (already Founder-approved via Production Catalog import)", searchKeywords: "derived from real product name/category/variant terms" },
      },
    });

    if (existing) alreadyExisted++;
    else created++;
  }

  console.log(JSON.stringify({ created, alreadyExisted, skippedNoProduct, totalEntries: entries.length }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
