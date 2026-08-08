/**
 * GST calculation for MUV. Two things determine the split:
 *   1. Whether the sale is intra-state (seller and buyer in the same state)
 *      → CGST + SGST, each half the total GST rate
 *   2. Or inter-state → IGST, the full rate, no CGST/SGST
 *
 * MUV's prices are GST-inclusive (what the storefront displays already
 * includes tax) — so this module extracts the tax component from a
 * tax-inclusive total, it doesn't add tax on top of a pre-tax price.
 */

// Configure this to MUV's actual GST-registered state before launch.
export const SELLER_STATE = "Maharashtra";

export type GstLine = {
  hsnCode: string;
  gstRate: number; // percent, e.g. 18
  taxableValue: number; // pre-tax value of this line
  cgst: number;
  sgst: number;
  igst: number;
  total: number; // taxableValue + cgst + sgst + igst — equals the tax-inclusive price paid
};

export type GstOrderInput = {
  hsnCode: string;
  gstRate: number;
  lineTotal: number; // tax-inclusive price × quantity for this line
}[];

/**
 * Reverse-calculates the tax-exclusive (taxable) value from a GST-inclusive
 * amount: taxable = inclusive / (1 + rate/100). Rounds to the nearest rupee —
 * matching how the rest of this app stores money as whole-rupee Int, per the
 * note at the top of schema.prisma.
 */
export function splitInclusiveGst(inclusiveAmount: number, gstRatePercent: number) {
  const taxableValue = Math.round((inclusiveAmount * 100) / (100 + gstRatePercent));
  const totalGst = inclusiveAmount - taxableValue;
  return { taxableValue, totalGst };
}

export function calculateOrderGst(lines: GstOrderInput, buyerState: string): { lines: GstLine[]; totals: { taxableValue: number; cgst: number; sgst: number; igst: number } } {
  const isIntraState = buyerState.trim().toLowerCase() === SELLER_STATE.trim().toLowerCase();

  const gstLines = lines.map((line) => {
    const { taxableValue, totalGst } = splitInclusiveGst(line.lineTotal, line.gstRate);
    const cgst = isIntraState ? Math.round(totalGst / 2) : 0;
    const sgst = isIntraState ? totalGst - cgst : 0; // remainder, so rounding never loses/gains a rupee vs totalGst
    const igst = isIntraState ? 0 : totalGst;

    return { hsnCode: line.hsnCode, gstRate: line.gstRate, taxableValue, cgst, sgst, igst, total: line.lineTotal };
  });

  const totals = gstLines.reduce(
    (acc, l) => ({
      taxableValue: acc.taxableValue + l.taxableValue,
      cgst: acc.cgst + l.cgst,
      sgst: acc.sgst + l.sgst,
      igst: acc.igst + l.igst,
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );

  return { lines: gstLines, totals };
}

/**
 * HSN lookup by category — a fallback only. The authoritative HSN code is
 * whatever's stored on each `Product.hsnCode` (set in the Product CMS content
 * editor's SEO/Content tab — add an HSN field there if it isn't already
 * exposed). This map exists so a category has a sane default the first time
 * a product is created, not as a source of truth to query at checkout time.
 */
export const DEFAULT_HSN_BY_CATEGORY: Record<string, string> = {
  "home-care": "3307", // room fragrances
  "fabric-care": "3402", // washing preparations
  "body-care": "3401", // soap/wash
  "personal-care": "3304", // cosmetic/toiletry preparations
  "car-care": "3405", // polishes and creams
  "skin-care": "3304",
};
