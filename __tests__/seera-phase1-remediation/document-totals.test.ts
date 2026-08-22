import { describe, expect, it } from "vitest";
import { totalsOf, type CommercialLineSnapshot } from "@/lib/sales-distribution/document-lines";

// Final Production Closure (23-Aug), P0-15/QUOTATION_TOTALS: a real production quotation showed
// line taxable=Rs.26,762.71, IGST=Rs.4,817.29, line total=Rs.31,580.00 (correct at the line level)
// but the document SUMMARY's "Taxable total" showed Rs.31,580.00 — the GRAND TOTAL value, not the
// actual taxable value. Root cause: totalsOf's taxableTotal used to be derived as
// `subtotal - discountTotal` where subtotal is rate*quantity (the GROSS, tax-inclusive figure for
// every Distributor/S.S. quotation) — mathematically wrong for any GST-inclusive line. Fixed to sum
// each line's own already-correct taxableValue directly.
function line(overrides: Partial<CommercialLineSnapshot> = {}): CommercialLineSnapshot {
  return {
    skuId: "sku-1",
    skuCodeSnapshot: "SKU-1",
    productNameSnapshot: "Product",
    packSnapshot: "1 PC",
    mrpSnapshot: 100,
    hsnSnapshot: "330499",
    quantity: 1,
    rate: 31580,
    discountPct: 0,
    taxRate: 18,
    priceMode: "GST_INCLUSIVE",
    taxableValue: 26762.71,
    taxAmount: 4817.29,
    lineTotal: 31580,
    taxConfigured: true,
    ...overrides,
  };
}

describe("totalsOf — Taxable total must never equal the Grand Total for a GST-inclusive line", () => {
  it("reproduces and closes the Founder-reported production defect exactly", () => {
    const totals = totalsOf([line()]);
    expect(totals.taxableTotal).toBeCloseTo(26762.71, 2);
    expect(totals.grandTotal).toBeCloseTo(31580, 2);
    expect(totals.taxableTotal).not.toBeCloseTo(totals.grandTotal, 2);
    expect(totals.taxableTotal + totals.taxTotal).toBeCloseTo(totals.grandTotal, 2);
  });

  it("sums taxableTotal across multiple GST-inclusive lines independently of the gross subtotal", () => {
    const totals = totalsOf([
      line({ skuId: "a", rate: 31580, quantity: 1, taxableValue: 26762.71, taxAmount: 4817.29, lineTotal: 31580 }),
      line({ skuId: "b", rate: 1180, quantity: 1, taxRate: 18, taxableValue: 1000, taxAmount: 180, lineTotal: 1180 }),
    ]);
    expect(totals.taxableTotal).toBeCloseTo(27762.71, 2);
    expect(totals.grandTotal).toBeCloseTo(32760, 2);
  });

  it("also holds for a GST-exclusive (base-rate) line, where taxableValue equals the rate itself", () => {
    const totals = totalsOf([line({ priceMode: "GST_EXCLUSIVE", rate: 1000, quantity: 1, taxableValue: 1000, taxAmount: 180, lineTotal: 1180 })]);
    expect(totals.taxableTotal).toBeCloseTo(1000, 2);
    expect(totals.grandTotal).toBeCloseTo(1180, 2);
  });
});
