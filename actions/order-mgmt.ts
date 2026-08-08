"use server";

import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { assignedScopeWhere } from "@/lib/inst-sales/scope";
import { listAllOrdersQuerySchema } from "@/lib/validations/business-orders";

/**
 * Milestone 4 — Order Management OS. The unified read layer: surfaces D2C
 * `Order` rows and institutional `BusinessOrder` rows in one list, tagged by
 * channel. Read-only — every mutation still goes through actions/orders.ts
 * (D2C, unchanged) or actions/business-orders.ts (institutional). Merges and
 * paginates in memory rather than a DB-level UNION — acceptable at this
 * milestone's order volume; a real Postgres view is the documented upgrade
 * path if that ever stops being true (see the Milestone 4 architecture doc).
 */

export type UnifiedOrderRow = {
  id: string;
  orderNumber: string;
  channel: "DIRECT" | "INSTITUTIONAL";
  customerName: string;
  total: number;
  status: string;
  ownerName: string | null;
  createdAt: Date;
};

export async function listAllOrders(input?: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const query = listAllOrdersQuerySchema.parse(input ?? {});
    const { page, pageSize } = query;
    const q = query.q;

    const wantsDirect = !query.channel || query.channel === "DIRECT";
    const wantsInstitutional = !query.channel || query.channel === "INSTITUTIONAL";

    // D2C orders have no owner/territory concept in the checkout-created
    // path (actions/orders.ts's createOrder never sets commerceOwnerId) —
    // visible to any staff member holding order_mgmt.view, matching how
    // app/admin/orders is already staff-wide, not assigned-scoped.
    const directRows = wantsDirect
      ? await prisma.order.findMany({
          where: {
            AND: [
              query.status ? { status: query.status as never } : {},
              q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {},
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, orderNumber: true, total: true, status: true, createdAt: true, customer: { select: { name: true } } },
        })
      : [];

    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const institutionalRows = wantsInstitutional
      ? await prisma.businessOrder.findMany({
          where: {
            AND: [
              scope,
              query.status ? { status: query.status as never } : {},
              q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {},
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, orderNumber: true, grandTotal: true, status: true, createdAt: true, customer: { select: { name: true } }, owner: { select: { name: true } } },
        })
      : [];

    const merged: UnifiedOrderRow[] = [
      ...directRows.map((o) => ({ id: o.id, orderNumber: o.orderNumber, channel: "DIRECT" as const, customerName: o.customer.name, total: o.total, status: o.status, ownerName: null, createdAt: o.createdAt })),
      ...institutionalRows.map((o) => ({ id: o.id, orderNumber: o.orderNumber, channel: "INSTITUTIONAL" as const, customerName: o.customer.name, total: Number(o.grandTotal), status: o.status, ownerName: o.owner.name, createdAt: o.createdAt })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = merged.length;
    const start = (page - 1) * pageSize;
    const items = merged.slice(start, start + pageSize);

    return { success: true as const, data: { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getUnifiedOrderSummaryCounts() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const [directTotal, institutionalTotal, directOpen, institutionalOpen] = await Promise.all([
      prisma.order.count(),
      prisma.businessOrder.count({ where: scope }),
      prisma.order.count({ where: { status: { in: ["PLACED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"] } } }),
      prisma.businessOrder.count({ where: { AND: [scope, { status: { in: ["CONFIRMED", "PROCESSING", "DISPATCHED"] } }] } }),
    ]);
    return { success: true as const, data: { directTotal, institutionalTotal, directOpen, institutionalOpen } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Reports — basic, company-wide (single-company), channel-distinguishing
// only. No forecasting, profitability analytics, warehouse analytics, or AI
// insights, per Milestone 4's explicit scope limits.
// ---------------------------------------------------------------------------

export async function getOrdersByStatusReport() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const [directGroups, institutionalGroups] = await Promise.all([
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.businessOrder.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    ]);
    return {
      success: true as const,
      data: {
        direct: Object.fromEntries(directGroups.map((g) => [g.status, g._count._all])),
        institutional: Object.fromEntries(institutionalGroups.map((g) => [g.status, g._count._all])),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getOrdersByCustomerReport() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const [directGroups, institutionalGroups] = await Promise.all([
      prisma.order.groupBy({ by: ["customerId"], _count: { _all: true }, _sum: { total: true }, orderBy: { _count: { customerId: "desc" } }, take: 10 }),
      prisma.businessOrder.groupBy({ by: ["customerId"], where: scope, _count: { _all: true }, _sum: { grandTotal: true }, orderBy: { _count: { customerId: "desc" } }, take: 10 }),
    ]);
    const customerIds = [...directGroups.map((g) => g.customerId), ...institutionalGroups.map((g) => g.customerId)];
    const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } });
    const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";
    return {
      success: true as const,
      data: {
        direct: directGroups.map((g) => ({ customerId: g.customerId, customerName: nameOf(g.customerId), orderCount: g._count._all, totalValue: g._sum.total ?? 0 })),
        institutional: institutionalGroups.map((g) => ({ customerId: g.customerId, customerName: nameOf(g.customerId), orderCount: g._count._all, totalValue: Number(g._sum.grandTotal ?? 0) })),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Business-order only — D2C orders have no sales-officer ownership concept in the checkout-created path. */
export async function getOrdersBySalesOfficerReport() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const groups = await prisma.businessOrder.groupBy({ by: ["ownerId"], where: scope, _count: { _all: true }, _sum: { grandTotal: true } });
    const owners = await prisma.user.findMany({ where: { id: { in: groups.map((g) => g.ownerId) } }, select: { id: true, name: true } });
    const nameOf = (id: string) => owners.find((o) => o.id === id)?.name ?? "Unknown";
    return {
      success: true as const,
      data: groups.map((g) => ({ ownerId: g.ownerId, ownerName: nameOf(g.ownerId), orderCount: g._count._all, totalValue: Number(g._sum.grandTotal ?? 0) })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Business-order only — D2C orders have no territory concept in the checkout-created path. */
export async function getOrdersByTerritoryReport() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const groups = await prisma.businessOrder.groupBy({ by: ["territoryId"], where: scope, _count: { _all: true }, _sum: { grandTotal: true } });
    const territoryIds = groups.map((g) => g.territoryId).filter((id): id is string => !!id);
    const territories = await prisma.territory.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } });
    const nameOf = (id: string | null) => (id ? territories.find((t) => t.id === id)?.name ?? "Unknown" : "Unassigned");
    return {
      success: true as const,
      data: groups.map((g) => ({ territoryId: g.territoryId, territoryName: nameOf(g.territoryId), orderCount: g._count._all, totalValue: Number(g._sum.grandTotal ?? 0) })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Last 6 months, both channels, bucketed in JS (no date-trunc SQL) — adequate at "basic report" scope. */
export async function getMonthlyOrdersReport() {
  try {
    const principal = await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [directOrders, institutionalOrders] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, total: true } }),
      prisma.businessOrder.findMany({ where: { AND: [scope, { createdAt: { gte: since } }] }, select: { createdAt: true, grandTotal: true } }),
    ]);

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const buckets = new Map<string, { direct: { count: number; total: number }; institutional: { count: number; total: number } }>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(since);
      d.setMonth(d.getMonth() + i);
      buckets.set(monthKey(d), { direct: { count: 0, total: 0 }, institutional: { count: 0, total: 0 } });
    }
    for (const o of directOrders) {
      const bucket = buckets.get(monthKey(o.createdAt));
      if (bucket) { bucket.direct.count += 1; bucket.direct.total += o.total; }
    }
    for (const o of institutionalOrders) {
      const bucket = buckets.get(monthKey(o.createdAt));
      if (bucket) { bucket.institutional.count += 1; bucket.institutional.total += Number(o.grandTotal); }
    }

    return { success: true as const, data: Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v })) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
