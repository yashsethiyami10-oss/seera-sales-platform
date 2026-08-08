/**
 * Sprint 2 Part 1+2 — customer-facing branding standardization: "MUV" (all
 * caps) → "Muv" everywhere real customer-facing display text lives in the
 * database. Whole-word only (`\bMUV\b`), so it never touches slugs, SKUs,
 * or anything else that happens to contain the substring incidentally.
 *
 * Touches: Product.name, Product.brand, and every text/JSON field on
 * ProductContent (shortDescription, seoTitle, seoDescription, storage,
 * safetyInformation, searchKeywords[], faq[].question/answer). Does NOT
 * touch slug, SKU, id, or any other identifier — those are explicitly
 * exempted ("database identifiers") per the Founder's own instruction.
 *
 * Idempotent: replacing "MUV" with "Muv" in text that's already "Muv" is a
 * no-op, so this is safe to re-run.
 *
 * Defaults to dry-run. Pass EXECUTE=1 to write for real.
 * Run with: npx tsx scripts/sprint2-branding-fix.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fix(text: string | null | undefined): string | null | undefined {
  if (!text) return text;
  return text.replace(/\bMUV\b/g, "Muv");
}

async function main() {
  const execute = process.env.EXECUTE === "1";
  const report: any = { products: [], content: [] };

  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true, brand: true } });
  for (const p of products) {
    const newName = fix(p.name)!;
    const newBrand = fix(p.brand)!;
    if (newName === p.name && newBrand === p.brand) continue;
    report.products.push({ slug: p.slug, before: { name: p.name, brand: p.brand }, after: { name: newName, brand: newBrand } });
    if (execute) {
      await prisma.product.update({ where: { id: p.id }, data: { name: newName, brand: newBrand } });
    }
  }

  const contentRows = await prisma.productContent.findMany({
    select: { id: true, productId: true, shortDescription: true, seoTitle: true, seoDescription: true, storage: true, safetyInformation: true, longDescription: true, keyBenefits: true, howToUse: true, careInstructions: true, productHighlights: true, searchKeywords: true, faq: true },
  });
  for (const c of contentRows) {
    const data: any = {};
    let changed = false;

    for (const field of ["shortDescription", "seoTitle", "seoDescription", "storage", "safetyInformation", "longDescription", "keyBenefits", "howToUse", "careInstructions", "productHighlights"] as const) {
      const before = c[field] as string | null;
      const after = fix(before);
      if (after !== before) {
        data[field] = after;
        changed = true;
      }
    }

    const newKeywords = c.searchKeywords.map((k) => fix(k)!);
    if (JSON.stringify(newKeywords) !== JSON.stringify(c.searchKeywords)) {
      data.searchKeywords = newKeywords;
      changed = true;
    }

    if (c.faq) {
      const faqArr = c.faq as { question: string; answer: string; source: string }[];
      const newFaq = faqArr.map((f) => ({ ...f, question: fix(f.question)!, answer: fix(f.answer)! }));
      if (JSON.stringify(newFaq) !== JSON.stringify(faqArr)) {
        data.faq = newFaq;
        changed = true;
      }
    }

    if (!changed) continue;
    report.content.push({ productId: c.productId, changedFields: Object.keys(data) });
    if (execute) {
      await prisma.productContent.update({ where: { id: c.id }, data });
    }
  }

  console.log(JSON.stringify({ mode: execute ? "EXECUTE" : "DRY_RUN", productsChanged: report.products.length, contentRowsChanged: report.content.length, detail: report }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
