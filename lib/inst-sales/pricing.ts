import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

/**
 * Milestone 4.2 — extracted from actions/inst-quotations.ts (where it was a
 * private, unexported function used by createQuotation/reviseQuotation) so
 * the new Direct Business Order action can price line items with the exact
 * same server-side logic — never trusting client-computed totals, matching
 * the same rule every other money calculation in this codebase follows.
 * Behavior is unchanged from the original; this is a pure extraction, not a
 * rewrite.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PriceLineInput = { productId: string; variantId?: string; quantity: number; unitPrice: number; discountPercent: number };

export async function priceLines(lines: PriceLineInput[]) {
  const products = await prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } }, select: { id: true, name: true, gstRate: true } });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Two shapes on purpose: `calc` carries the intermediate subtotal/discountAmount/
  // taxAmount every line needs for the version-level totals below; `priced` is what
  // actually gets passed to `lineItems: { create: priced }` and must contain ONLY
  // real line-item columns — Prisma's nested `create` rejects any extra key with a
  // PrismaClientValidationError, which is exactly what including the calc fields
  // directly in this array caused before this fix.
  const calc = lines.map((line, index) => {
    const product = byId.get(line.productId);
    if (!product) throw new NotFoundError("Product");
    const subtotal = line.quantity * line.unitPrice;
    const discountAmount = subtotal * (line.discountPercent / 100);
    const taxable = subtotal - discountAmount;
    const taxRate = product.gstRate;
    const taxAmount = taxable * (taxRate / 100);
    const lineTotal = taxable + taxAmount;
    return {
      productId: line.productId, variantId: line.variantId ?? null, displayOrder: index,
      quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent,
      taxRate, lineTotal: round2(lineTotal), subtotal: round2(subtotal), discountAmount: round2(discountAmount), taxAmount: round2(taxAmount),
    };
  });

  const priced = calc.map(({ subtotal: _s, discountAmount: _d, taxAmount: _t, ...line }) => line);

  const totals = calc.reduce(
    (acc, l) => ({ subtotal: acc.subtotal + l.subtotal, discountTotal: acc.discountTotal + l.discountAmount, taxTotal: acc.taxTotal + l.taxAmount, grandTotal: acc.grandTotal + l.lineTotal }),
    { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
  );

  return { priced, totals: { subtotal: round2(totals.subtotal), discountTotal: round2(totals.discountTotal), taxTotal: round2(totals.taxTotal), grandTotal: round2(totals.grandTotal) } };
}
