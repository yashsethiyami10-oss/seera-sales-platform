import type { Prisma, BusinessOrder, BusinessOrderSource } from "@prisma/client";

/**
 * Milestone 4.1 — Quotation Acceptance Workflow Enhancement.
 *
 * Extracted from actions/business-orders.ts's createBusinessOrderFromQuotation
 * so the exact same order-creation logic can be called from within a
 * *different* file's own transaction (actions/inst-quotations.ts's
 * acceptQuotation) without duplicating it. Lives outside any "use server"
 * file deliberately — a "use server" file's every export becomes a
 * client-callable RPC stub, and this function's first parameter is a raw
 * Prisma transaction client, which is neither serializable nor safe to
 * expose that way. Matches this codebase's existing lib/commerce/services.ts
 * precedent for "plain shared logic imported by multiple actions/*.ts files."
 *
 * Takes an already-loaded, already-validated quotation version + customer +
 * opportunity (the caller is responsible for eligibility checks — this
 * function only performs the write) and the `tx` client the caller's own
 * transaction is using, so this write commits or rolls back as one unit
 * with everything else the caller does in that same transaction.
 */

// Milestone 4.2 — Prisma.Decimal.Value (Decimal | DecimalJsLike | number |
// string), not just Prisma.Decimal: callers now legitimately supply either
// real Decimal instances read back from the DB (acceptQuotation,
// createBusinessOrderFromQuotation) or plain numbers computed by
// priceLines() (createDirectBusinessOrder) — Prisma's own `create()` input
// types already accept both interchangeably at runtime; this type was
// simply too narrow before this milestone had a second kind of caller.
type LineItemInput = {
  productId: string;
  variantId: string | null;
  displayOrder: number;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  discountPercent: Prisma.Decimal.Value;
  taxRate: Prisma.Decimal.Value;
  lineTotal: Prisma.Decimal.Value;
};

export type CreateBusinessOrderCoreParams = {
  // Milestone 4.2 — explicit, required: never derived from
  // quotationVersionId's nullability (a future non-quotation origin, e.g.
  // CUSTOMER_PORTAL, also wouldn't have one, so that signal alone can't
  // distinguish between origins).
  source: BusinessOrderSource;
  // Milestone 4.2 — nullable: a DIRECT_LEAD order has no quotation to link.
  quotationVersionId: string | null;
  customer: { id: string; shippingAddress: string | null; billingAddress: string | null };
  opportunity: { id: string; ownerId: string; territoryId: string | null } | null;
  fallbackOwnerId: string;
  subtotal: Prisma.Decimal.Value;
  discountTotal: Prisma.Decimal.Value;
  taxTotal: Prisma.Decimal.Value;
  grandTotal: Prisma.Decimal.Value;
  lineItems: LineItemInput[];
};

export async function createBusinessOrderCore(
  tx: Prisma.TransactionClient,
  params: CreateBusinessOrderCoreParams
): Promise<BusinessOrder> {
  return tx.businessOrder.create({
    data: {
      // "" is the assign-me-a-number sentinel business_order_number_before_insert checks for.
      orderNumber: "",
      source: params.source,
      quotationVersionId: params.quotationVersionId,
      opportunityId: params.opportunity?.id ?? null,
      customerId: params.customer.id,
      ownerId: params.opportunity?.ownerId ?? params.fallbackOwnerId,
      territoryId: params.opportunity?.territoryId ?? null,
      status: "CONFIRMED",
      subtotal: params.subtotal,
      discountTotal: params.discountTotal,
      taxTotal: params.taxTotal,
      grandTotal: params.grandTotal,
      deliveryAddress: params.customer.shippingAddress ?? params.customer.billingAddress ?? null,
      items: {
        create: params.lineItems.map((li) => ({
          productId: li.productId,
          variantId: li.variantId,
          displayOrder: li.displayOrder,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          discountPercent: li.discountPercent,
          taxRate: li.taxRate,
          lineTotal: li.lineTotal,
        })),
      },
    },
  });
}
