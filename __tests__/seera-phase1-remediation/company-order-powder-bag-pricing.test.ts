import { describe, expect, it } from "vitest";
import { COMPANY_ORDER_UNIT_OVERRIDES, companyOrderLineMultiplier } from "@/lib/sales-distribution/company-order-catalog";

// Final 100% Closure (23-Aug), Part 12: Powder default UOM = BAG(25kg), matching the SAME
// PACK_TOTAL convention every other Company Order SKU (Cake, Shine Plus 3kg/5kg, Bartan) already
// uses — the governed COMPANY_TO_SS price IS the full bag price already (confirmed against the
// live production price version AND real historical order lines predating this change, e.g. a
// real order priced quantity:1 at ₹1,400 for SEERA-POWDER-1KG). An earlier version of this fix
// wrongly assumed the price was a per-kg base rate needing x25 multiplication (based on a stale
// seed-script comment, not the live governed price) — that caused a real 25x overcharge in
// production before being caught and reverted; see company-order-catalog.ts's own correction note.
describe("Company Order Powder BAG pricing — same PACK_TOTAL convention as every other SKU, no multiplication", () => {
  it("Powder 1kg SKUs default to BAG(25), PACK_TOTAL basis (not PER_PC)", () => {
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-POWDER-1KG"]).toMatchObject({ orderUnit: "BAG", unitsPerOrderUnit: 25 });
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-POWDER-1KG"].basis).toBeUndefined();
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-SHINEPLUS-POWDER-1KG"]).toMatchObject({ orderUnit: "BAG", unitsPerOrderUnit: 25 });
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-SHINEPLUS-POWDER-1KG"].basis).toBeUndefined();
  });

  it("the governed price is charged directly, never multiplied by the pack factor (closes the 25x overcharge regression)", () => {
    const livePowderPrice = 1165.26;
    const liveShinePrice = 953.39;
    expect(livePowderPrice * companyOrderLineMultiplier("SEERA-POWDER-1KG")).toBeCloseTo(livePowderPrice, 2);
    expect(liveShinePrice * companyOrderLineMultiplier("SEERA-SHINEPLUS-POWDER-1KG")).toBeCloseTo(liveShinePrice, 2);
  });

  it("every Company Order SKU with a governed override has multiplier 1 — quantity always means pack count, price is always the pack total", () => {
    for (const code of Object.keys(COMPANY_ORDER_UNIT_OVERRIDES)) {
      expect(companyOrderLineMultiplier(code)).toBe(1);
    }
  });

  it("an SKU with no override entry at all also gets multiplier 1 (safe default)", () => {
    expect(companyOrderLineMultiplier("MUV-SOME-UNLISTED-SKU")).toBe(1);
  });
});
