import { describe, expect, it } from "vitest";
import { deriveDistributorPurchaseRate } from "@/lib/sales-distribution/distributor-pricing";

describe("distributor purchase rate derivation (Founder 22-Aug cake +6% / powder +8%)", () => {
  it("Seera Cake Blue: exact governed S.S. rate x1.06", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-CAKE-BLUE", ssRate: 252.54 })).toBe(267.69);
  });

  it("Seera Cake White: exact governed S.S. rate x1.06", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-CAKE-WHITE", ssRate: 100 })).toBe(106);
  });

  it("Seera Detergent Powder 1kg: exact governed S.S. rate x1.08", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-POWDER-1KG", ssRate: 1165.26 })).toBe(1258.48);
  });

  it("Yuva Detergent Cake: Rule C, exact governed S.S. rate x1.06 (extended 22-Aug — its own real SKU, Founder-named product family)", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-YUVA-CAKE-BLUE", ssRate: 252.54 })).toBe(267.69);
  });

  it("Shine Plus Detergent Powder, all 3 real pack sizes: Rule D, exact governed S.S. rate x1.08 (extended 22-Aug)", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-SHINEPLUS-POWDER-1KG", ssRate: 953.39 })).toBe(1029.66);
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-SHINEPLUS-POWDER-3KG", ssRate: 1144.06 })).toBe(1235.58);
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-SHINEPLUS-POWDER-5KG", ssRate: 1144.06 })).toBe(1235.58);
  });

  it("unrelated/unnamed SKU (e.g. Bartan tubs): no invented margin", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "SEERA-BARTAN-300G", ssRate: 50 })).toBeNull();
  });

  it("unknown SKU code returns null, never a guessed rate", () => {
    expect(deriveDistributorPurchaseRate({ skuCode: "NOT-A-REAL-CODE", ssRate: 500 })).toBeNull();
  });
});
