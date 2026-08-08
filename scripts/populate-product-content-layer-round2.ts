/**
 * Production Customer Content Layer — Round 2 population.
 *
 * Adds `seoDescription` and `faq` to the 20 `ProductContent` rows created in
 * Round 1 (scripts/populate-product-content-layer.ts). Does NOT touch
 * shortDescription/seoTitle/searchKeywords already populated — this script
 * only ever sets fields that are currently null, and only where genuinely
 * safe, sourced content was found.
 *
 * Full investigation result (see PRODUCTION_CONTENT_ROUND2_REPORT.md for the
 * complete evidence): after re-checking every family's FAQ/Safety/Usage
 * files specifically for the newly-requested fields (Full Description, Key
 * Benefits, How To Use, Safety Information, Storage Information, Suitable
 * For, Product Highlights, FAQ), only two things were found to be genuinely
 * safe AND genuinely available for every product:
 *   1. A real "what sizes are available" FAQ answer — sourced directly from
 *      this product's own already-imported, Founder-approved ProductVariant
 *      rows (not from the Knowledge Library text, which is redundant here).
 *   2. A real "how much does it cost" FAQ answer that correctly defers to
 *      the live price shown on the page — never quotes a number, per
 *      FR-001/FR-002 (the same rule already governing the AI runtime).
 * Everything else requested (Full Description, Key Benefits, How To Use,
 * Safety Information, Storage Information, Suitable For, Product
 * Highlights) was re-checked per family and remains genuinely unsourced —
 * every family's own files say "REQUIRES FOUNDER INPUT" / "Unknown" for
 * these specific fields, not just in Round 1's sample, but confirmed again
 * this pass. Not populated. Not placeholder text. Genuinely absent.
 *
 * seoDescription is populated as an exact copy of the already-approved
 * shortDescription — mechanical reuse of existing approved text, not new
 * authorship, a standard and safe SEO practice.
 *
 * ONE exception to the "nothing else was found" rule above: MUV Bleach
 * (slug muv-bleach) has a genuinely real, verbatim-sourced, finished-product
 * storage instruction and a mixing-safety rule — SOP section 7, quoted in
 * full in docs/knowledge-factory/products/pure-bleach/08_Safety.md
 * (KO-PB-SAFETY-001/003): "Store below 30°C away from direct sunlight." and
 * "Do not mix with acids or ammonia-based cleaners." This is finished-
 * product handling guidance, not a manufacturing formula/quantity, so it
 * does not fall under the excluded categories. It is deliberately NOT
 * generalized to any other product (e.g. Toilet Cleaner's own source file
 * explicitly forbids asserting a mixing-hazard claim that isn't sourced in
 * that product's own package, even though it would be generally true of
 * acid-based cleaners — see toilet-cleaner/09_Golden_Questions.md GQ-06).
 *
 * Idempotent: only writes to rows where the target field is currently null.
 * Run with: npx tsx scripts/populate-product-content-layer-round2.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FAMILY_SPECIFIC_SAFE_CONTENT: Record<string, { storage?: string; safetyInformation?: string; source: string }> = {
  "muv-bleach": {
    storage: "Store below 30°C, away from direct sunlight.",
    safetyInformation: "Do not mix with acids or ammonia-based cleaners.",
    source: "docs/knowledge-factory/products/pure-bleach/08_Safety.md — KO-PB-SAFETY-001/003, verbatim SOP §7 (Store below 30°C away from direct sunlight. Do not mix with acids or ammonia-based cleaners.)",
  },
};

function sizeLabel(sizes: string[]): string {
  if (sizes.length === 1) return sizes[0]!;
  if (sizes.length === 2) return `${sizes[0]} and ${sizes[1]}`;
  return `${sizes.slice(0, -1).join(", ")}, and ${sizes[sizes.length - 1]}`;
}

async function main() {
  const products = await prisma.product.findMany({
    include: { content: true, variants: { orderBy: { price: "asc" } } },
  });

  let updated = 0;
  let skippedNoContent = 0;
  let skippedAlreadySet = 0;
  let skippedDraft = 0;

  for (const product of products) {
    if (product.status === "DRAFT") {
      // Black Phenyl — Founder explicitly requires it "remains untouched" this round.
      skippedDraft++;
      continue;
    }

    if (!product.content) {
      skippedNoContent++;
      continue;
    }

    const familyOverride = FAMILY_SPECIFIC_SAFE_CONTENT[product.slug];
    const alreadyFullySet =
      product.content.faq !== null &&
      product.content.seoDescription !== null &&
      (!familyOverride?.storage || product.content.storage !== null) &&
      (!familyOverride?.safetyInformation || product.content.safetyInformation !== null);
    if (alreadyFullySet) {
      skippedAlreadySet++;
      continue;
    }

    const sizes = product.variants.map((v) => v.size);
    const faq =
      sizes.length > 0
        ? [
            {
              question: `What pack sizes does ${product.name} come in?`,
              answer: `${sizeLabel(sizes)}.`,
              source: "product_variants (Founder-approved catalog data)",
            },
            {
              question: `How much does ${product.name} cost?`,
              answer: "See the current price shown on this page — pricing is always live and may be updated from time to time.",
              source: "policy: never quote a static price in FAQ content (FR-001/FR-002 commercial-separation rule)",
            },
          ]
        : null; // Black Phenyl has no variant yet — no real size/price to answer with, correctly left null

    const data = {
      seoDescription: product.content.seoDescription ?? product.content.shortDescription, // exact reuse of already-approved text
      faq: product.content.faq !== null ? undefined : faq ?? undefined,
      storage: familyOverride?.storage && product.content.storage === null ? familyOverride.storage : undefined,
      safetyInformation: familyOverride?.safetyInformation && product.content.safetyInformation === null ? familyOverride.safetyInformation : undefined,
      sourceProvenance: {
        ...(typeof product.content.sourceProvenance === "object" && product.content.sourceProvenance !== null ? product.content.sourceProvenance : {}),
        seoDescription: "reused verbatim from this row's own already-approved shortDescription",
        faq: faq ? "derived from this product's own Founder-approved ProductVariant rows (sizes) + a fixed live-pricing policy answer" : "no variant exists yet (Black Phenyl) — not populated",
        ...(familyOverride ? { storage: familyOverride.source, safetyInformation: familyOverride.source } : {}),
      },
    };

    if (process.env.EXECUTE !== "1") {
      console.log(`[DRY RUN] would update ${product.slug}:`, JSON.stringify({ seoDescription: data.seoDescription, faq: data.faq, storage: data.storage, safetyInformation: data.safetyInformation }));
      updated++;
      continue;
    }

    await prisma.productContent.update({ where: { productId: product.id }, data });
    updated++;
  }

  console.log(JSON.stringify({ updated, skippedNoContent, skippedAlreadySet, skippedDraft, totalProducts: products.length }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
