import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireSupportPrincipal } from "./context";

/** Reporting Service — read-only aggregation, no new tables. Covers the
 * named report list: Open/Closed Tickets, Agent Productivity, Complaints,
 * Escalation Reports, Support Trends. (SLA Performance lives in
 * sla-service.ts, CSAT/NPS in feedback-service.ts, Product Complaints/
 * Returns/Refunds in their own service files, Knowledge Usage in
 * knowledge-service.ts — each report reported from the service that owns
 * the underlying data, not duplicated here.) */

export async function getOpenClosedTicketCounts() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const grouped = await prisma.supportTicket.groupBy({ by: ["status"], where: { organizationKey: principal.organizationKey }, _count: { status: true } });
  const closedStatuses = ["RESOLVED", "CLOSED"];
  const open = grouped.filter((g) => !closedStatuses.includes(g.status)).reduce((s, g) => s + g._count.status, 0);
  const closed = grouped.filter((g) => closedStatuses.includes(g.status)).reduce((s, g) => s + g._count.status, 0);
  return { open, closed, byStatus: grouped.map((g) => ({ status: g.status, count: g._count.status })) };
}

export async function getAgentProductivity(input: { from?: Date; to?: Date }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const where = { organizationKey: principal.organizationKey, resolvedAt: { not: null, ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } };
  const resolved = await prisma.supportTicket.findMany({ where, select: { resolvedById: true, createdAt: true, resolvedAt: true, reopenedCount: true } });
  const byAgent = new Map<string, { resolved: number; totalMinutes: number; reopened: number }>();
  for (const t of resolved) {
    if (!t.resolvedById || !t.resolvedAt) continue;
    const entry = byAgent.get(t.resolvedById) ?? { resolved: 0, totalMinutes: 0, reopened: 0 };
    entry.resolved += 1;
    entry.totalMinutes += (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60000;
    entry.reopened += t.reopenedCount > 0 ? 1 : 0;
    byAgent.set(t.resolvedById, entry);
  }
  return Array.from(byAgent.entries()).map(([agentId, v]) => ({ agentId, resolved: v.resolved, avgResolutionMinutes: v.resolved ? Math.round(v.totalMinutes / v.resolved) : 0, reopened: v.reopened }));
}

export async function getComplaintCategories() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const grouped = await prisma.supportTicket.groupBy({ by: ["category"], where: { organizationKey: principal.organizationKey, category: "COMPLAINT" }, _count: { category: true } });
  return grouped.map((g) => ({ category: g.category, count: g._count.category }));
}

export async function getEscalationReport() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const grouped = await prisma.supportEscalation.groupBy({ by: ["level"], where: { organizationKey: principal.organizationKey }, _count: { level: true } });
  const unresolved = await prisma.supportEscalation.count({ where: { organizationKey: principal.organizationKey, resolvedAt: null } });
  return { byLevel: grouped.map((g) => ({ level: g.level, count: g._count.level })), unresolved };
}

export async function getSupportTrends(input: { fromDays?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const from = new Date(Date.now() - (input.fromDays ?? 30) * 86400000);
  const tickets = await prisma.supportTicket.findMany({ where: { organizationKey: principal.organizationKey, createdAt: { gte: from } }, select: { createdAt: true, channel: true, category: true } });
  const byDay = new Map<string, number>();
  for (const t of tickets) { const day = t.createdAt.toISOString().slice(0, 10); byDay.set(day, (byDay.get(day) ?? 0) + 1); }
  return { totalInWindow: tickets.length, byDay: Array.from(byDay.entries()).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)) };
}
