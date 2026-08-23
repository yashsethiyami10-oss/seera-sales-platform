import { describe, expect, it } from "vitest";
import { COMPANY_ORDER_UNIT_OVERRIDES, companyOrderLineMultiplier } from "@/lib/sales-distribution/company-order-catalog";

// Final 100% Closure (23-Aug), Part 12: Powder default UOM = BAG, derived from the governed
// per-kg/per-PC base rate × pack factor — never a separately stored/superseded BAG price version.
describe("Company Order Powder BAG pricing — derived, never duplicated", () => {
  it("Powder 1kg SKUs default to BAG(25), not PCS", () => {
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-POWDER-1KG"]).toMatchObject({ orderUnit: "BAG", unitsPerOrderUnit: 25, basis: "PER_PC" });
    expect(COMPANY_ORDER_UNIT_OVERRIDES["SEERA-SHINEPLUS-POWDER-1KG"]).toMatchObject({ orderUnit: "BAG", unitsPerOrderUnit: 25, basis: "PER_PC" });
  });

  it("derives the BAG rate as governed base rate x pack factor — exact Founder-specified figures", () => {
    const powderBaseRate = 56.5;
    const shineBaseRate = 46;
    expect(powderBaseRate * companyOrderLineMultiplier("SEERA-POWDER-1KG")).toBeCloseTo(1412.5, 2);
    expect(shineBaseRate * companyOrderLineMultiplier("SEERA-SHINEPLUS-POWDER-1KG")).toBeCloseTo(1150, 2);
  });

  it("changing the governed base rate automatically changes the derived BAG rate (no separate stored value to go stale)", () => {
    const newBaseRate = 60;
    expect(newBaseRate * companyOrderLineMultiplier("SEERA-POWDER-1KG")).toBeCloseTo(1500, 2);
  });

  it("every pre-existing PACK_TOTAL-basis SKU is completely unaffected (multiplier 1, no behavior change)", () => {
    for (const code of ["SEERA-CAKE-BLUE", "SEERA-CAKE-WHITE", "SEERA-YUVA-CAKE-BLUE", "SEERA-SHINEPLUS-POWDER-3KG", "SEERA-SHINEPLUS-POWDER-5KG", "SEERA-BARTAN-300G", "SEERA-BARTAN-500G"]) {
      expect(companyOrderLineMultiplier(code)).toBe(1);
    }
  });

  it("an SKU with no override entry at all also gets multiplier 1 (safe default)", () => {
    expect(companyOrderLineMultiplier("MUV-SOME-UNLISTED-SKU")).toBe(1);
  });
});
