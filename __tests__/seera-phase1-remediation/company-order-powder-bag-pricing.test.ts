import { describe, expect, it } from "vitest";
import { COMPANY_ORDER_UNIT_OVERRIDES, companyOrderLineMultiplier, resolveCompanyOrderLinePricing, orderLineAwareCanonicalPieces, orderLineAwareOrderUnits } from "@/lib/sales-distribution/company-order-catalog";

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

// Per-line commercial UOM (Founder final policy, 25-Aug §15-22): a Super Stockist may order a
// Company Order line in the SKU's default pack (BOX/BAG, unchanged) or explicitly in PCS. The
// governed PACK_TOTAL rate itself is NEVER multiplied by the pack factor for the default case, and
// when PCS is chosen the per-piece rate is derived (packRate / packFactor) ONLY for that line's own
// representation — never a stored/competing price version.
describe("Company Order per-line UOM — Founder final policy (25-Aug), named regression guard against the historic 25x overcharge", () => {
  it.each([
    ["SEERA-CAKE-BLUE", 252.54, 40, "BOX"],
    ["SEERA-CAKE-WHITE", 252.54, 40, "BOX"],
    ["SEERA-YUVA-CAKE-BLUE", 252.54, 40, "BOX"],
    ["SEERA-POWDER-1KG", 1165.26, 25, "BAG"],
    ["SEERA-SHINEPLUS-POWDER-1KG", 953.39, 25, "BAG"],
    ["SEERA-SHINEPLUS-POWDER-3KG", 1144.06, 10, "BAG"],
    ["SEERA-SHINEPLUS-POWDER-5KG", 1144.06, 6, "BAG"],
  ] as const)("%s — default pack unit (%s of %i) charges the pack rate exactly once, never x%i (the historic bug)", (code, packRate, factor, defaultUnit) => {
    const pricing = resolveCompanyOrderLinePricing(code, packRate, undefined, 1);
    expect(pricing.selectedUom).toBe(defaultUnit);
    expect(pricing.packFactor).toBe(factor);
    expect(pricing.canonicalPieceQuantity).toBe(factor);
    expect(pricing.lineTotal).toBeCloseTo(packRate, 2); // NEVER packRate * factor — that is the historic 25x bug shape
  });

  it("SEERA-POWDER-1KG: 1 BAG at the governed pack rate charges exactly ₹1,165.26, never x25 (₹29,131.50)", () => {
    const pricing = resolveCompanyOrderLinePricing("SEERA-POWDER-1KG", 1165.26, "BAG", 1);
    expect(pricing.lineTotal).toBeCloseTo(1165.26, 2);
    expect(pricing.lineTotal).not.toBeCloseTo(1165.26 * 25, 2);
  });

  it("SEERA-SHINEPLUS-POWDER-1KG: 1 BAG charges exactly ₹953.39, never x25 (₹23,834.75)", () => {
    const pricing = resolveCompanyOrderLinePricing("SEERA-SHINEPLUS-POWDER-1KG", 953.39, "BAG", 1);
    expect(pricing.lineTotal).toBeCloseTo(953.39, 2);
    expect(pricing.lineTotal).not.toBeCloseTo(953.39 * 25, 2);
  });

  it("SEERA-POWDER-1KG: 4 PCS derives the proportional per-piece rate from packRate/packFactor, not a flat per-kg guess", () => {
    const pricing = resolveCompanyOrderLinePricing("SEERA-POWDER-1KG", 1165.26, "PCS", 4);
    expect(pricing.selectedUom).toBe("PCS");
    expect(pricing.packFactor).toBe(25);
    expect(pricing.canonicalPieceQuantity).toBe(4);
    expect(pricing.displayRate).toBeCloseTo(1165.26 / 25, 2);
    expect(pricing.lineTotal).toBeCloseTo((1165.26 / 25) * 4, 2);
  });

  it("SEERA-CAKE-BLUE: 3 PCS is priced proportionally, 40 PCS equals exactly one BOX's pack rate", () => {
    const three = resolveCompanyOrderLinePricing("SEERA-CAKE-BLUE", 252.54, "PCS", 3);
    expect(three.canonicalPieceQuantity).toBe(3);
    expect(three.lineTotal).toBeCloseTo((252.54 / 40) * 3, 2);
    const wholePackInPcs = resolveCompanyOrderLinePricing("SEERA-CAKE-BLUE", 252.54, "PCS", 40);
    expect(wholePackInPcs.lineTotal).toBeCloseTo(252.54, 2); // 40 PC == 1 BOX, same total either way
  });

  it("a SKU with no real pack (packFactor 1, e.g. an MUV item) treats PCS as a no-op — same total as the default", () => {
    const pricing = resolveCompanyOrderLinePricing("MUV-SOME-UNLISTED-SKU", 60, "PCS", 5);
    expect(pricing.packFactor).toBe(1);
    expect(pricing.canonicalPieceQuantity).toBe(5);
    expect(pricing.lineTotal).toBeCloseTo(300, 2);
  });

  it("rejects a UOM the SKU doesn't support (not PCS, not its own default unit)", () => {
    expect(() => resolveCompanyOrderLinePricing("SEERA-CAKE-BLUE", 252.54, "BAG", 1)).toThrow("INVALID_COMPANY_ORDER_UOM");
  });

  // Real bug caught by the company-order-cancellation.integration.test.ts end-to-end test: a
  // 4-PC SEERA-POWDER-1KG line posted 100 pieces (4x25) to the physical inventory ledger on
  // receipt, because packFactor (the SKU's PRICING pack size, always 25) was reused as the
  // INVENTORY conversion factor too. inventoryPackFactor is the fix — a distinct field that
  // correctly reads 1 for a PCS-selected line even though packFactor stays 25 for pricing/display.
  it("packFactor (pricing) and inventoryPackFactor (physical conversion) are different for a PCS-selected line — this is the exact 25x bug this feature could have reintroduced", () => {
    const pcs = resolveCompanyOrderLinePricing("SEERA-POWDER-1KG", 1165.26, "PCS", 4);
    expect(pcs.packFactor).toBe(25); // still describes the SKU's physical pack for display
    expect(pcs.inventoryPackFactor).toBe(1); // but 4 PC ordered means 4 PC to inventory, not 100
    const bag = resolveCompanyOrderLinePricing("SEERA-POWDER-1KG", 1165.26, "BAG", 2);
    expect(bag.packFactor).toBe(25);
    expect(bag.inventoryPackFactor).toBe(25); // 2 BAG means 50 PC — inventoryPackFactor applies here
  });

  describe("per-line-aware inventory conversion — never a static SKU-only lookup once a line has its own UOM", () => {
    it("a BOX-selected line (old-shape schemeSnapshot, pre-25-Aug orders) converts using unitsPerOrderUnit", () => {
      const line = { skuCodeSnapshot: "SEERA-CAKE-BLUE", schemeSnapshot: { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "..." } };
      expect(orderLineAwareCanonicalPieces(line, 2)).toBe(80); // 2 BOX -> 80 PC
    });
    it("a PCS-selected line (new-shape schemeSnapshot) converts 1:1 via inventoryPackFactor — never re-applies the SKU's BOX/BAG pricing packFactor", () => {
      const line = { skuCodeSnapshot: "SEERA-POWDER-1KG", schemeSnapshot: { selectedUom: "PCS", packFactor: 25, inventoryPackFactor: 1, canonicalPieceQuantity: 4 } };
      expect(orderLineAwareCanonicalPieces(line, 4)).toBe(4); // 4 PC -> 4 PC, NOT 4*25=100
    });
    it("a BAG-selected line (new-shape schemeSnapshot) still converts using its own inventoryPackFactor", () => {
      const line = { skuCodeSnapshot: "SEERA-POWDER-1KG", schemeSnapshot: { selectedUom: "BAG", packFactor: 25, inventoryPackFactor: 25, canonicalPieceQuantity: 25 } };
      expect(orderLineAwareCanonicalPieces(line, 2)).toBe(50); // 2 BAG -> 50 PC
    });
    it("falls back to the static per-SKU table when the line carries no UOM snapshot at all", () => {
      const line = { skuCodeSnapshot: "SEERA-SHINEPLUS-POWDER-5KG", schemeSnapshot: null };
      expect(orderLineAwareCanonicalPieces(line, 3)).toBe(18); // 3 BAG x 6 PC/BAG
    });
    it("the inverse conversion is per-line-aware too, and refuses a misaligned piece count rather than truncating", () => {
      const pcsLine = { skuCodeSnapshot: "SEERA-POWDER-1KG", schemeSnapshot: { selectedUom: "PCS", packFactor: 25, inventoryPackFactor: 1 } };
      expect(orderLineAwareOrderUnits(pcsLine, 4)).toBe(4);
      const bagLine = { skuCodeSnapshot: "SEERA-POWDER-1KG", schemeSnapshot: { selectedUom: "BAG", packFactor: 25, inventoryPackFactor: 25 } };
      expect(() => orderLineAwareOrderUnits(bagLine, 4)).toThrow("INVENTORY_UNIT_CONVERSION_MISALIGNED");
    });
  });
});
