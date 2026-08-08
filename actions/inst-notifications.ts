"use server";

import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import type { PlatformNotification } from "@/components/os-shell/registry/notifications";

/**
 * MUV OS™ — Institutional Sales OS's Notification Provider (Manifest
 * Architecture §7). A Server Action (not a plain function) so the
 * client-side `NotificationsPopover` (components/os-shell/Header/
 * NotificationsPopover.tsx) can call it directly without any Prisma/auth
 * code ever entering the client bundle — Next.js turns a "use server"
 * export into a safe RPC stub automatically.
 *
 * Every notification here is real, derived data (overdue follow-ups
 * assigned to the caller; quotations/expenses actually pending the
 * caller's approval) — never a synthetic/demo notification, matching §7's
 * "pure aggregator" rule this file's own registry already documents.
 */
export async function getInstSalesNotifications(): Promise<PlatformNotification[]> {
  try {
    const principal = await getSalesPrincipal();
    const now = new Date();
    const notifications: PlatformNotification[] = [];

    const overdueFollowUps = await prisma.instFollowUp.findMany({
      where: { assignedToId: principal.id, status: "PENDING", dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { customer: { select: { name: true } }, lead: { select: { organizationName: true } } },
    });
    for (const f of overdueFollowUps) {
      notifications.push({
        id: `inst-followup-${f.id}`,
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "inst_sales.followup.overdue",
        priority: "urgent",
        title: `Overdue follow-up: ${f.customer?.name ?? f.lead?.organizationName ?? "Customer"}`,
        body: `${f.type} was due ${f.dueDate.toLocaleDateString("en-IN")}`,
        href: "/os/sales/followups",
        createdAt: f.dueDate.toISOString(),
        read: false,
      });
    }

    if (principal.isFounder || principal.permissions.has(PERMISSIONS.INST_QUOTATIONS_APPROVE)) {
      const pendingQuotations = await prisma.instQuotationVersion.count({ where: { status: "PENDING_APPROVAL" } });
      if (pendingQuotations > 0) {
        notifications.push({
          id: "inst-quotations-pending",
          ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
          type: "inst_sales.quotation.pending_approval",
          priority: "actionable",
          title: `${pendingQuotations} quotation${pendingQuotations === 1 ? "" : "s"} awaiting approval`,
          href: "/os/sales/quotations?status=PENDING_APPROVAL",
          createdAt: now.toISOString(),
          read: false,
        });
      }
    }

    if (principal.isFounder || principal.permissions.has(PERMISSIONS.INST_EXPENSES_APPROVE)) {
      const pendingExpenses = await prisma.instExpense.count({ where: { status: "PENDING_MANAGER" } });
      if (pendingExpenses > 0) {
        notifications.push({
          id: "inst-expenses-pending",
          ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
          type: "inst_sales.expense.pending_approval",
          priority: "actionable",
          title: `${pendingExpenses} expense claim${pendingExpenses === 1 ? "" : "s"} awaiting approval`,
          href: "/os/sales/expenses",
          createdAt: now.toISOString(),
          read: false,
        });
      }
    }

    // Milestone 4 — Order Management OS. Same "real, derived data only"
    // rule as every block above — never a synthetic notification. Scoped by
    // ownerId directly (matching this file's existing style) rather than
    // lib/inst-sales/scope.ts's assignedScopeWhere, since Founder/
    // view_all-holders see the unscoped count and everyone else sees only
    // their own, mirroring the quotations/expenses blocks above exactly.
    const canViewAllOrders = principal.isFounder || principal.permissions.has(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL);

    const acceptedAwaitingOrder = await prisma.instQuotationVersion.count({
      where: {
        status: "ACCEPTED",
        businessOrder: null,
        quotation: canViewAllOrders ? undefined : { ownerId: principal.id },
      },
    });
    if (acceptedAwaitingOrder > 0) {
      notifications.push({
        id: "business-orders-awaiting-conversion",
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "business_orders.quotation.awaiting_conversion",
        priority: "actionable",
        title: `${acceptedAwaitingOrder} accepted quotation${acceptedAwaitingOrder === 1 ? "" : "s"} ready for order creation`,
        href: "/os/sales/quotations?status=ACCEPTED",
        createdAt: now.toISOString(),
        read: false,
      });
    }

    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const orderOwnerScope = canViewAllOrders ? {} : { ownerId: principal.id };

    const stuckConfirmed = await prisma.businessOrder.count({ where: { ...orderOwnerScope, status: "CONFIRMED", createdAt: { lt: twoDaysAgo } } });
    if (stuckConfirmed > 0) {
      notifications.push({
        id: "business-orders-stuck-confirmed",
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "business_orders.stuck.confirmed",
        priority: "actionable",
        title: `${stuckConfirmed} business order${stuckConfirmed === 1 ? "" : "s"} stuck in Confirmed`,
        href: "/os/orders?channel=INSTITUTIONAL&status=CONFIRMED",
        createdAt: now.toISOString(),
        read: false,
      });
    }

    const stuckProcessing = await prisma.businessOrder.count({ where: { ...orderOwnerScope, status: "PROCESSING", updatedAt: { lt: twoDaysAgo } } });
    if (stuckProcessing > 0) {
      notifications.push({
        id: "business-orders-stuck-processing",
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "business_orders.stuck.processing",
        priority: "actionable",
        title: `${stuckProcessing} business order${stuckProcessing === 1 ? "" : "s"} stuck in Processing`,
        href: "/os/orders?channel=INSTITUTIONAL&status=PROCESSING",
        createdAt: now.toISOString(),
        read: false,
      });
    }

    const dispatchMissing = await prisma.businessOrder.count({ where: { ...orderOwnerScope, status: "DISPATCHED", carrierName: null, trackingReference: null } });
    if (dispatchMissing > 0) {
      notifications.push({
        id: "business-orders-dispatch-missing",
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "business_orders.dispatch.missing",
        priority: "actionable",
        title: `${dispatchMissing} dispatched order${dispatchMissing === 1 ? "" : "s"} missing dispatch info`,
        href: "/os/orders?channel=INSTITUTIONAL&status=DISPATCHED",
        createdAt: now.toISOString(),
        read: false,
      });
    }

    const deliveryOverdue = await prisma.businessOrder.count({
      where: { ...orderOwnerScope, status: { in: ["CONFIRMED", "PROCESSING", "DISPATCHED"] }, expectedDeliveryDate: { lt: now } },
    });
    if (deliveryOverdue > 0) {
      notifications.push({
        id: "business-orders-delivery-overdue",
        ownerAppId: "inst-sales" as PlatformNotification["ownerAppId"],
        type: "business_orders.delivery.overdue",
        priority: "urgent",
        title: `${deliveryOverdue} business order${deliveryOverdue === 1 ? "" : "s"} past expected delivery`,
        href: "/os/orders?channel=INSTITUTIONAL",
        createdAt: now.toISOString(),
        read: false,
      });
    }

    return notifications;
  } catch {
    // No active Sales role, unauthenticated, etc. — same "degrade to
    // nothing" rule lib/os-shell/granted-permissions.ts already applies.
    return [];
  }
}
