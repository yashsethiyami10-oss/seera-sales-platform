"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { getStockStatus } from "@/lib/utils/stock-status";

const stockSchema = z.object({ variantIds: z.array(z.string().cuid()).max(50) });

/**
 * Cart is client-only (localStorage — see lib/cart-context.tsx's own note on
 * why there's no Cart/CartItem Prisma model). That means stock shown per
 * line item is only ever as fresh as when it was added, unless the cart
 * page re-checks it — this does that, in one batched query, without adding
 * a new model or touching the shared /api/products route. The authoritative
 * check still happens again at order creation (actions/orders.ts); this is
 * purely so the cart itself doesn't lie to the customer before they even
 * reach checkout.
 */
export async function checkCartStock(input: unknown) {
  try {
    const { variantIds } = stockSchema.parse(input);
    if (variantIds.length === 0) return { success: true as const, data: {} };

    const inventory = await prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, quantity: true, lowStockThreshold: true },
    });

    const byVariant: Record<string, { status: ReturnType<typeof getStockStatus>; quantity: number }> = {};
    for (const id of variantIds) {
      const inv = inventory.find((i) => i.variantId === id);
      byVariant[id] = { status: getStockStatus(inv?.quantity ?? 0, inv?.lowStockThreshold ?? 10), quantity: inv?.quantity ?? 0 };
    }

    return { success: true as const, data: byVariant };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const fragranceSchema = z.object({ productIds: z.array(z.string().cuid()).max(50) });

/**
 * `CartItem` (lib/cart-context.tsx) doesn't carry `fragranceNotes` — that
 * type is shared by every add-to-cart call site across Homepage, Shop, and
 * the PDP, none of which this phase may touch, so it can't be safely
 * extended to start populating a new field. This looks the real value up
 * separately by productId (already stored on every cart item) instead —
 * real data, no shared-file changes.
 */
export async function getCartItemFragrances(input: unknown) {
  try {
    const { productIds } = fragranceSchema.parse(input);
    if (productIds.length === 0) return { success: true as const, data: {} };

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, fragranceNotes: true },
    });

    const byProduct: Record<string, string | null> = {};
    products.forEach((p) => { byProduct[p.id] = p.fragranceNotes; });

    return { success: true as const, data: byProduct };
  } catch (err) {
    return toErrorResponse(err);
  }
}
