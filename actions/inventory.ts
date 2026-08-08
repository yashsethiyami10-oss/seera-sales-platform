"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError } from "@/lib/errors";
import { sendAdminLowStockAlert } from "@/lib/notify/send";
import { logger } from "@/lib/logger";

const adjustStockSchema = z.object({
  variantId: z.string().cuid(),
  change: z.number().int().refine((n) => n !== 0, "Change must be non-zero"),
  reason: z.enum(["RESTOCK", "MANUAL_ADJUSTMENT", "RETURN"]),
  note: z.string().max(300).optional(),
});

/**
 * The only way stock quantity should ever change for RESTOCK/MANUAL/RETURN
 * reasons. ORDER_FULFILLMENT and ORDER_CANCELLED adjustments happen inside
 * the order server actions (see app/actions/orders.ts) as part of the same
 * transaction that changes order status, so they aren't exposed here.
 */
export async function adjustStock(input: unknown) {
  try {
    const user = await requireStaff();
    const data = adjustStockSchema.parse(input);

    const inventory = await prisma.inventory.findUnique({
      where: { variantId: data.variantId },
      include: { variant: { select: { size: true, product: { select: { name: true, slug: true } } } } },
    });
    if (!inventory) throw new NotFoundError("Inventory record");

    const nextQuantity = inventory.quantity + data.change;
    if (nextQuantity < 0) {
      throw new AppError("Stock can't go below zero", 400, "INVALID_STOCK_CHANGE");
    }

    await prisma.$transaction([
      prisma.inventory.update({
        where: { variantId: data.variantId },
        data: { quantity: nextQuantity },
      }),
      prisma.stockHistory.create({
        data: {
          inventoryId: inventory.id,
          change: data.change,
          reason: data.reason,
          changedById: user.id,
          note: data.note,
        },
      }),
    ]);

    // Same crossing-edge trigger as order fulfillment (actions/orders.ts) —
    // only alerts when this specific adjustment pushes a variant at/below
    // threshold, not every time it's already known to be low.
    if (inventory.quantity > inventory.lowStockThreshold && nextQuantity <= inventory.lowStockThreshold) {
      sendAdminLowStockAlert({ productName: inventory.variant.product.name, size: inventory.variant.size, quantity: nextQuantity }).catch((err) => logger.error("notify:admin-low-stock:failed", { error: String(err) }));
    }

    revalidatePath("/admin/inventory");
    // Phase 16 — previously only the admin inventory page was revalidated,
    // so a manual restock/adjustment could leave a stale "Out of Stock"
    // badge showing on the real storefront product page and /shop until
    // their own next unrelated revalidation, same gap actions/products.ts's
    // updateProduct already avoided for product-field edits.
    revalidatePath(`/products/${inventory.variant.product.slug}`);
    revalidatePath("/shop");
    return { success: true as const, data: { quantity: nextQuantity } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const setStockSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).optional(),
});

/**
 * Absolute set rather than a +/- delta — what the admin product form's
 * "Stock Quantity" field needs (an admin typing "84" means "set it to 84,"
 * not "add 84"). Internally this still computes the delta and writes
 * through the exact same StockHistory-logged transaction as adjustStock,
 * so the audit trail never has a gap just because the UI happened to be
 * absolute instead of relative.
 */
export async function setStockQuantity(input: unknown) {
  try {
    const user = await requireStaff();
    const data = setStockSchema.parse(input);

    const inventory = await prisma.inventory.findUnique({
      where: { variantId: data.variantId },
      include: { variant: { select: { size: true, product: { select: { name: true } } } } },
    });
    if (!inventory) throw new NotFoundError("Inventory record");

    const delta = data.quantity - inventory.quantity;
    const effectiveThreshold = data.lowStockThreshold ?? inventory.lowStockThreshold;

    await prisma.$transaction([
      prisma.inventory.update({
        where: { variantId: data.variantId },
        data: { quantity: data.quantity, ...(data.lowStockThreshold != null ? { lowStockThreshold: data.lowStockThreshold } : {}) },
      }),
      ...(delta !== 0
        ? [prisma.stockHistory.create({
            data: { inventoryId: inventory.id, change: delta, reason: "MANUAL_ADJUSTMENT" as const, changedById: user.id, note: "Set via product edit form" },
          })]
        : []),
    ]);

    if (inventory.quantity > effectiveThreshold && data.quantity <= effectiveThreshold) {
      sendAdminLowStockAlert({ productName: inventory.variant.product.name, size: inventory.variant.size, quantity: data.quantity }).catch((err) => logger.error("notify:admin-low-stock:failed", { error: String(err) }));
    }

    revalidatePath("/admin/products");
    revalidatePath("/admin/inventory");
    return { success: true as const, data: { quantity: data.quantity } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getLowStock() {
  try {
    await requireStaff();
    // Prisma's query builder can't compare two columns of the same row
    // (quantity <= lowStockThreshold) without raw SQL. $queryRaw is used
    // here deliberately rather than fetching every row and filtering in
    // JS, which wouldn't scale once the catalog grows.
    const items = await prisma.$queryRaw<
      Array<{ id: string; quantity: number; lowStockThreshold: number; variantId: string }>
    >`
      SELECT id, quantity, "lowStockThreshold", "variantId"
      FROM inventory
      WHERE quantity <= "lowStockThreshold"
      ORDER BY quantity ASC
    `;
    return { success: true, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
