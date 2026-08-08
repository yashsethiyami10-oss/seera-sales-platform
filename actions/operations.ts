"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError, ForbiddenError, AppError } from "@/lib/errors";
import { requirePermission, requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";

/**
 * Milestone 5 — Operations Foundation.
 *
 * Three modules, one simple workflow:
 *   BusinessOrder (CONFIRMED) → Operations Queue → Inventory Check →
 *   Reserve Stock → Assign Warehouse → PROCESSING (an existing, already-
 *   valid transition — no new status introduced).
 *
 * Reuses two already-domain-generic tables rather than inventing new ones:
 * the D2C `Inventory` model (read-only here — this milestone never writes
 * to it, so D2C's own stock/checkout logic is completely untouched) as the
 * one true "how much stock physically exists" number, and the existing
 * `InventoryReservation` model (additively extended with a nullable
 * businessOrderId in this milestone's migration) as the reservation
 * ledger. Available Stock is always computed live — current minus the sum
 * of active reservations — never stored, never accepted from the client.
 */

async function computeAvailability(variantIds: string[]) {
  const [inventories, reservations] = await Promise.all([
    prisma.inventory.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, quantity: true } }),
    prisma.inventoryReservation.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, status: "ACTIVE" }, _sum: { quantity: true } }),
  ]);
  const currentByVariant = new Map(inventories.map((i) => [i.variantId, i.quantity]));
  const reservedByVariant = new Map(reservations.map((r) => [r.variantId, r._sum.quantity ?? 0]));
  return (variantId: string) => {
    const current = currentByVariant.get(variantId) ?? 0;
    const reserved = reservedByVariant.get(variantId) ?? 0;
    return { current, reserved, available: current - reserved };
  };
}

/**
 * Pending (CONFIRMED) and Processing buckets — a filtered read over
 * BusinessOrder, not a new table. Scoped the same way every other
 * business-order list already is.
 */
export async function listOperationsQueue() {
  try {
    await requirePermission(PERMISSIONS.BUSINESS_OPS_VIEW);
    // Same select shape for both buckets (including `warehouse`, always
    // null for a still-Pending order) — keeps the two arrays uniformly
    // typed for the UI, rather than forcing it to branch on two shapes.
    const selectShape = {
      id: true, orderNumber: true, grandTotal: true, createdAt: true,
      customer: { select: { name: true } }, warehouse: { select: { name: true } },
    } as const;
    const [pending, processing] = await Promise.all([
      prisma.businessOrder.findMany({ where: { status: "CONFIRMED" }, orderBy: { createdAt: "asc" }, select: selectShape }),
      prisma.businessOrder.findMany({ where: { status: "PROCESSING" }, orderBy: { createdAt: "asc" }, select: selectShape }),
    ]);
    return {
      success: true as const,
      data: {
        pending: pending.map((o) => ({ ...o, grandTotal: Number(o.grandTotal) })),
        processing: processing.map((o) => ({ ...o, grandTotal: Number(o.grandTotal) })),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Read-only inventory check for one order's line items — Current/Reserved/
 * Available per line, all computed server-side.
 */
export async function getInventoryCheck(businessOrderId: string) {
  try {
    await requireAnyPermission(PERMISSIONS.BUSINESS_OPS_VIEW, PERMISSIONS.BUSINESS_OPS_MANAGE);
    const order = await prisma.businessOrder.findUnique({
      where: { id: businessOrderId },
      include: { items: { include: { product: { select: { name: true } }, variant: { select: { id: true, size: true } } } } },
    });
    if (!order) throw new NotFoundError("Business order");

    const variantIds = order.items.map((i) => i.variantId).filter((id): id is string => !!id);
    const availability = await computeAvailability(variantIds);

    return {
      success: true as const,
      data: {
        orderId: order.id, status: order.status, warehouseId: order.warehouseId,
        lines: order.items.map((item) => {
          const stock = item.variantId ? availability(item.variantId) : { current: 0, reserved: 0, available: 0 };
          return {
            itemId: item.id, productName: item.product.name, size: item.variant?.size ?? null,
            quantityOrdered: item.quantity, currentStock: stock.current, reservedStock: stock.reserved, availableStock: stock.available,
            sufficient: item.variantId ? stock.available >= item.quantity : false,
          };
        }),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * The one write operation this milestone performs: re-verify every line
 * item's availability live (never trusting whatever getInventoryCheck
 * showed a moment earlier), and if every line has enough stock, reserve it,
 * assign the (single) warehouse, and advance CONFIRMED → PROCESSING — all
 * inside one transaction. If any line is short, the whole attempt is
 * rejected atomically; nothing partial is ever left behind.
 */
export async function reserveInventoryAndAssignWarehouse(businessOrderId: string) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_OPS_MANAGE);

    const warehouse = await prisma.warehouse.findFirst({ where: { active: true } });
    if (!warehouse) throw new AppError("No active warehouse configured", 500, "NO_WAREHOUSE");

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.businessOrder.findUnique({
        where: { id: businessOrderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundError("Business order");
      if (order.status !== "CONFIRMED") throw new ForbiddenError(`Only a confirmed order can be reserved (currently ${order.status})`);

      const itemsWithVariant = order.items.filter((i): i is typeof order.items[number] & { variantId: string } => !!i.variantId);
      if (itemsWithVariant.length !== order.items.length) {
        throw new AppError("Every line item must have a specific variant before inventory can be checked", 400, "MISSING_VARIANT");
      }

      // Live re-check, inside the transaction — the actual concurrency
      // safeguard, not the earlier read-only display.
      const variantIds = itemsWithVariant.map((i) => i.variantId);
      const [inventories, reservations] = await Promise.all([
        tx.inventory.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, quantity: true } }),
        tx.inventoryReservation.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, status: "ACTIVE" }, _sum: { quantity: true } }),
      ]);
      const currentByVariant = new Map(inventories.map((i) => [i.variantId, i.quantity]));
      const reservedByVariant = new Map(reservations.map((r) => [r.variantId, r._sum.quantity ?? 0]));

      const shortfalls: string[] = [];
      for (const item of itemsWithVariant) {
        const current = currentByVariant.get(item.variantId) ?? 0;
        const reserved = reservedByVariant.get(item.variantId) ?? 0;
        const available = current - reserved;
        if (available < item.quantity) shortfalls.push(`variant ${item.variantId}: need ${item.quantity}, only ${available} available`);
      }
      if (shortfalls.length > 0) {
        throw new AppError(`Insufficient stock — ${shortfalls.join("; ")}`, 409, "INSUFFICIENT_STOCK");
      }

      // Reserve every line, assign the warehouse, advance status — together.
      for (const item of itemsWithVariant) {
        await tx.inventoryReservation.create({
          data: { businessOrderId: order.id, warehouseId: warehouse.id, variantId: item.variantId, quantity: item.quantity, status: "ACTIVE" },
        });
      }
      const updated = await tx.businessOrder.update({
        where: { id: order.id },
        data: { warehouseId: warehouse.id, status: "PROCESSING" },
      });

      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "INVENTORY_RESERVED",
        recordType: "BusinessOrder", recordId: order.id,
        newValue: { warehouseId: warehouse.id, lines: itemsWithVariant.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
      }, tx);
      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "WAREHOUSE_ASSIGNED",
        recordType: "BusinessOrder", recordId: order.id, newValue: { warehouseId: warehouse.id },
      }, tx);
      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "ORDER_MOVED_TO_PROCESSING",
        recordType: "BusinessOrder", recordId: order.id, previousValue: { status: "CONFIRMED" }, newValue: { status: "PROCESSING" },
      }, tx);

      return updated;
    });

    revalidatePath("/os/operations");
    revalidatePath("/os/orders");
    revalidatePath(`/os/orders/business/${businessOrderId}`);
    return { success: true as const, data: { id: result.id, status: result.status, warehouseId: result.warehouseId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
