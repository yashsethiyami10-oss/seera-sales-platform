import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// SOURCE OF RULE (traceability for the final commercial closure pass, 22-Aug): the base +6%/+8%
// rule was explicitly Founder-approved in the "SEERA DISTRIBUTOR FIELD ORDER FLOW FINAL
// SIMPLIFICATION" task of this same engagement, which named the product families directly —
// "Seera Blue Detergent Cake, Seera White Detergent Cake" at +6% and "SEERA DETERGENT POWDER" at
// +8% — not a guess or an inferred pattern. Rules C/D (Yuva Cake, Shine Plus Powder) extend the
// SAME named rule to those brands' own real SKUs, not a new/separate rule.
// Founder decision 22-Aug, extended 22-Aug (Rules C/D): governed commercial uplift applied to the
// existing governed COMPANY_TO_SS rate (the S.S.'s own procurement rate from Company — a genuine
// BASIC/EX-GST value; GST is added on top, never extracted from it, per document-lines.ts's
// priceModeForBrand/deriveExclusiveTax convention for every non-MUV brand). Keyed by the stable
// SKU `code` identity, never a productName string match, and never hardcoded into any UI
// component. Real production SKU codes confirmed via scripts/seera/audit-founder-sku-price-matrix-readonly.ts:
//   Seera Detergent Cake (brand "Seera"): +6%
//   Yuva Detergent Cake (brand "Yuva", its own real SKU, same governed source rate as Seera Cake): +6%
//   Seera Detergent Powder 1kg (brand "Seera"): +8%
//   Shine Plus Detergent Powder — all three real pack sizes (brand "Shine Plus"): +8%
// Deliberately does NOT cover the Bartan tubs — Founder never named that product family; inventing
// a margin for it would be a guess, not a governed rule.
const DISTRIBUTOR_UPLIFT_BY_SKU_CODE: Record<string, number> = {
  "SEERA-CAKE-BLUE": 1.06,
  "SEERA-CAKE-WHITE": 1.06,
  "SEERA-YUVA-CAKE-BLUE": 1.06,
  "SEERA-POWDER-1KG": 1.08,
  "SEERA-SHINEPLUS-POWDER-1KG": 1.08,
  "SEERA-SHINEPLUS-POWDER-3KG": 1.08,
  "SEERA-SHINEPLUS-POWDER-5KG": 1.08,
};

export function deriveDistributorPurchaseRate(input: { skuCode: string; ssRate: number }): number | null {
  const uplift = DISTRIBUTOR_UPLIFT_BY_SKU_CODE[input.skuCode];
  return uplift == null ? null : Math.round(input.ssRate * uplift * 100) / 100;
}

export type DistributorPriceResolution = { amount: number; source: "SS_TO_DISTRIBUTOR" | "DERIVED_FROM_COMPANY_TO_SS" };

// The one authoritative derivation shared by both the order-placement price lookup
// (workflow-service.ts's createDistributorReplenishment) and the product dropdown
// (OperationalWorkspace.tsx's Distributor "Order from S.S." SKU list) — an explicitly governed
// SS_TO_DISTRIBUTOR price version always takes precedence when one exists; the formula above is a
// named-SKU fallback for when it doesn't, never a silent override of a real governed row. Returns
// null (never a guess) when neither source is available — the caller must treat that as genuinely
// unconfigured.
export async function resolveDistributorPurchaseRate(db: Db, skuId: string, skuCode: string, now: Date): Promise<DistributorPriceResolution | null> {
  const governed = await db.seeraPriceVersion.findFirst({
    where: { skuId, tier: "SS_TO_DISTRIBUTOR", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  if (governed) return { amount: Number(governed.amount), source: "SS_TO_DISTRIBUTOR" };
  const uplift = DISTRIBUTOR_UPLIFT_BY_SKU_CODE[skuCode];
  if (uplift == null) return null;
  const base = await db.seeraPriceVersion.findFirst({
    where: { skuId, tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!base) return null;
  const amount = deriveDistributorPurchaseRate({ skuCode, ssRate: Number(base.amount) });
  return amount == null ? null : { amount, source: "DERIVED_FROM_COMPANY_TO_SS" };
}
