import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Founder decision 22-Aug: exactly two Seera product families get a governed commercial uplift
// when a Distributor buys from its authorised Super Stockist — Seera Detergent Cake (+6%) and
// Seera Detergent Powder (+8%) — applied to the existing governed COMPANY_TO_SS rate (the S.S.'s
// own procurement rate from Company; already GST-inclusive, matching the same convention
// workflow-service.ts's deriveInclusiveTax already uses for SS_TO_DISTRIBUTOR). Keyed by the
// stable SKU `code` identity, never a productName string match, and never hardcoded into any UI
// component. Deliberately does NOT cover Yuva Cake, Shine Plus Powder, or the Bartan tubs — the
// Founder named "Seera Detergent Cake"/"Seera Detergent Powder" specifically; inventing a margin
// for an unnamed product line would be a guess, not a governed rule.
const DISTRIBUTOR_UPLIFT_BY_SKU_CODE: Record<string, number> = {
  "SEERA-CAKE-BLUE": 1.06,
  "SEERA-CAKE-WHITE": 1.06,
  "SEERA-POWDER-1KG": 1.08,
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
