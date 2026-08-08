import type { SupportPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireSupportPrincipal } from "./context";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { upsertAlert } from "@/lib/founder-os/alert-store";
import { CRITICAL_PRIORITIES } from "./domain";
import { getOpenClosedTicketCounts, getComplaintCategories } from "./reporting-service";
import { getCsatTrend } from "./feedback-service";

const criticalPriorities = CRITICAL_PRIORITIES as unknown as SupportPriority[];

/**
 * Founder Integration Service. Reuses Part 3D's FounderAlert (via
 * upsertAlert) and FounderWidgetDefinition — no parallel founder-alerting
 * table. Escalation-driven and CSAT-drop alerts are emitted inline where
 * they happen (escalation-service.ts, feedback-service.ts); this file
 * covers the two remaining alert types (SLA breach, critical ticket) and
 * assembles the Founder Dashboard's own read-only widget data.
 */

export async function syncFounderAlerts() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const breachedCritical = await prisma.supportTicket.findMany({
    where: { organizationKey: principal.organizationKey, slaBreached: true, priority: { in: criticalPriorities }, status: { notIn: ["RESOLVED", "CLOSED"] } },
    select: { id: true, ticketNumber: true, priority: true },
  });
  let created = 0;
  for (const ticket of breachedCritical) {
    await enterpriseTransaction(async (tx) => {
      const result = await upsertAlert(tx, principal.organizationKey, {
        alertType: "SUPPORT_SLA_BREACH", severity: ticket.priority === "CRITICAL" ? "CRITICAL" : "WARNING",
        title: `SLA breach on ${ticket.priority} ticket ${ticket.ticketNumber}`, description: `Ticket ${ticket.ticketNumber} has breached its SLA and remains unresolved`,
        sourceModule: "support", sourceEntityType: "SupportTicket", sourceEntityId: ticket.id,
      });
      if (result.created) created++;
    });
  }
  return { created };
}

export async function getFounderSupportDashboard() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const [ticketCounts, complaintCategories, csat, criticalOpen, returnedProductCount, avgResolution, reopenRate] = await Promise.all([
    getOpenClosedTicketCounts(),
    getComplaintCategories(),
    getCsatTrend({}),
    prisma.supportTicket.count({ where: { organizationKey: principal.organizationKey, priority: { in: criticalPriorities }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.supportReturnRequest.groupBy({ by: ["orderId"], where: { organizationKey: principal.organizationKey }, _count: { orderId: true } }),
    prisma.supportTicket.aggregate({ where: { organizationKey: principal.organizationKey, resolvedAt: { not: null } }, _avg: { reopenedCount: true } }),
    prisma.supportTicket.count({ where: { organizationKey: principal.organizationKey, reopenedCount: { gt: 0 } } }),
  ]);
  const totalTickets = ticketCounts.open + ticketCounts.closed;
  return {
    openTickets: ticketCounts.open,
    criticalTickets: criticalOpen,
    csat,
    topComplaintCategories: complaintCategories,
    mostReturnedProductsCount: returnedProductCount.length,
    reopenRate: totalTickets > 0 ? Math.round((reopenRate / totalTickets) * 1000) / 10 : 0,
    avgReopenedCount: avgResolution._avg.reopenedCount ?? 0,
  };
}
