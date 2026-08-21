import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveInclusiveTax, deriveExclusiveTax, priceModeForBrand } from "@/lib/sales-distribution/document-lines";

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

// P0 21-Aug Founder fix: a Distributor/Super Stockist quotation's entered rate is ALWAYS the final
// GST-inclusive selling price. Production evidence (SSWS-01/QT/2026-27/00001 and 00002, both
// ISSUED) showed every real quotation line stored priceMode:"GST_EXCLUSIVE" because
// priceModeForBrand only treated the "MUV" brand as inclusive — every other real product brand in
// this catalog (Seera, Yuva, Shine Plus) silently added GST on top of the entered rate instead of
// treating it as already included, exactly matching the Founder's "Rate ₹267.80 + GST @18% on top"
// screenshot. quotation-service.ts now forces GST_INCLUSIVE unconditionally for every quotation
// line regardless of brand — these tests pin that both the math and the override are real.
describe("Quotation GST-inclusive rule (P0 21-Aug)", () => {
  it("deriveInclusiveTax never inflates the entered rate: taxable + tax == entered gross", () => {
    // A distributor enters ₹118.00 as the final selling price for 1 unit at 18% GST.
    const { taxableValue, taxAmount } = deriveInclusiveTax(118, 18);
    expect(taxableValue).toBeCloseTo(100, 6);
    expect(taxAmount).toBeCloseTo(18, 6);
    expect(taxableValue + taxAmount).toBeCloseTo(118, 6);
  });

  it("deriveExclusiveTax (the old default for non-MUV brands) DOES add tax on top — proving why the bug looked exactly like the Founder's screenshot", () => {
    const { taxableValue, taxAmount } = deriveExclusiveTax(267.8, 18);
    expect(taxableValue).toBe(267.8);
    expect(taxAmount).toBeCloseTo(48.204, 6);
    // Final would have been ~316.00 instead of the 267.80 the distributor actually typed — the
    // exact inflation pattern the Founder reported.
    expect(taxableValue + taxAmount).toBeCloseTo(316.004, 6);
  });

  it("priceModeForBrand still only treats MUV as inclusive by default (billing/invoice flows, which don't force GST_INCLUSIVE, are intentionally unchanged)", () => {
    expect(priceModeForBrand("MUV")).toBe("GST_INCLUSIVE");
    expect(priceModeForBrand("Seera")).toBe("GST_EXCLUSIVE");
    expect(priceModeForBrand("Yuva")).toBe("GST_EXCLUSIVE");
    expect(priceModeForBrand("Shine Plus")).toBe("GST_EXCLUSIVE");
  });

  it("createQuotationDraft/updateQuotationDraft force GST_INCLUSIVE regardless of SKU brand", () => {
    const code = source("lib/sales-distribution/quotation-service.ts");
    const forcedCalls = code.match(/buildLineSnapshots\([^)]*forcePriceMode:\s*"GST_INCLUSIVE"/g) ?? [];
    expect(forcedCalls.length).toBe(2);
  });

  it("billing-service.ts (invoices/Company Direct) is untouched — still brand-based, not forced", () => {
    const code = source("lib/sales-distribution/billing-service.ts");
    expect(code).not.toContain("forcePriceMode");
  });

  it("QuotationActions.tsx client preview always renders GST-inclusive math, never a GST-excluded label for a new quotation line", () => {
    const code = source("components/seera/product/QuotationActions.tsx");
    expect(code).toContain("QUOTATION_LINES_ARE_GST_INCLUSIVE");
    expect(code).not.toContain("isGstInclusiveBrand");
  });
});
