import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireSupportPrincipal } from "./context";

/**
 * Customer Timeline Architecture — one unified, read-time-composed timeline
 * per customer, matching Order Management (Milestone 4)'s own "merge, tag
 * by source, sort, paginate in-memory" read aggregation. Not a stored
 * table: every row below is a live read from the domain that actually owns
 * it (CRM, Orders, Dispatch, Manufacturing, Finance, Support) — Support
 * never snapshots or duplicates another module's data.
 */

type TimelineEntry = { source: string; type: string; at: Date; summary: string; refId: string };

export async function getCustomerUnifiedTimeline(customerId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const entries: TimelineEntry[] = [];

  const [opportunities, d2cOrders, businessOrders, tickets, feedback, csat] = await Promise.all([
    prisma.instOpportunity.findMany({ where: { customerId }, select: { id: true, opportunityNumber: true, stage: true, createdAt: true }, take: 50 }),
    prisma.order.findMany({ where: { customerId }, select: { id: true, orderNumber: true, status: true, total: true, createdAt: true }, take: 50 }),
    prisma.businessOrder.findMany({ where: { customerId, organizationKey: principal.organizationKey }, select: { id: true, orderNumber: true, status: true, grandTotal: true, dispatchedAt: true, deliveredAt: true, createdAt: true }, take: 50 }),
    prisma.supportTicket.findMany({ where: { customerId, organizationKey: principal.organizationKey }, select: { id: true, ticketNumber: true, category: true, status: true, createdAt: true, resolvedAt: true, closedAt: true }, take: 100 }),
    prisma.supportFeedback.findMany({ where: { customerId, organizationKey: principal.organizationKey }, select: { id: true, rating: true, submittedAt: true }, take: 50 }),
    prisma.supportCsatResponse.findMany({ where: { ticket: { customerId, organizationKey: principal.organizationKey } }, select: { id: true, ticketId: true, score: true, respondedAt: true } }),
  ]);

  for (const o of opportunities) entries.push({ source: "CRM", type: "OPPORTUNITY", at: o.createdAt, summary: `Opportunity ${o.opportunityNumber} (${o.stage})`, refId: o.id });
  for (const o of d2cOrders) entries.push({ source: "ORDERS", type: "D2C_ORDER", at: o.createdAt, summary: `Order ${o.orderNumber} — ${o.status} — ₹${o.total}`, refId: o.id });
  for (const o of businessOrders) {
    entries.push({ source: "ORDERS", type: "BUSINESS_ORDER", at: o.createdAt, summary: `Order ${o.orderNumber} — ${o.status} — ₹${o.grandTotal}`, refId: o.id });
    if (o.dispatchedAt) entries.push({ source: "DISPATCH", type: "DISPATCHED", at: o.dispatchedAt, summary: `Order ${o.orderNumber} dispatched`, refId: o.id });
    if (o.deliveredAt) entries.push({ source: "DISPATCH", type: "DELIVERED", at: o.deliveredAt, summary: `Order ${o.orderNumber} delivered`, refId: o.id });
  }
  for (const t of tickets) {
    entries.push({ source: "SUPPORT", type: "TICKET", at: t.createdAt, summary: `Ticket ${t.ticketNumber} (${t.category}) — ${t.status}`, refId: t.id });
    if (t.resolvedAt) entries.push({ source: "SUPPORT", type: "TICKET_RESOLVED", at: t.resolvedAt, summary: `Ticket ${t.ticketNumber} resolved`, refId: t.id });
    if (t.closedAt) entries.push({ source: "SUPPORT", type: "TICKET_CLOSED", at: t.closedAt, summary: `Ticket ${t.ticketNumber} closed`, refId: t.id });
  }
  for (const f of feedback) entries.push({ source: "FEEDBACK", type: "FEEDBACK", at: f.submittedAt, summary: `Feedback rating ${f.rating}/5`, refId: f.id });
  for (const c of csat) if (c.respondedAt) entries.push({ source: "FEEDBACK", type: "CSAT", at: c.respondedAt, summary: `CSAT score ${c.score}/5 on ticket ${c.ticketId}`, refId: c.id });

  // Finance is permission-gated — only surfaced to a principal who actually
  // holds finance visibility, and only AR status, never raw ledger entries.
  if (principal.isFounder || principal.permissions.has(PERMISSIONS.FINANCE_RECEIVABLES_VIEW)) {
    const financeAccount = await prisma.financeCustomerAccount.findFirst({ where: { customerId, organizationKey: principal.organizationKey } });
    if (financeAccount) entries.push({ source: "FINANCE", type: "AR_ACCOUNT", at: financeAccount.createdAt, summary: `AR account opened (credit limit ₹${financeAccount.creditLimit ?? 0})`, refId: financeAccount.id });
  }

  // Activities/Communications: every enterprise mutation about this
  // customer's records already lands in SalesTimelineEvent via
  // recordEnterpriseMutation — surfaced here rather than duplicated.
  const relatedIds = [...opportunities.map((o) => o.id), ...businessOrders.map((o) => o.id), ...tickets.map((t) => t.id)];
  if (relatedIds.length > 0) {
    const activity = await prisma.salesTimelineEvent.findMany({ where: { relatedRecordId: { in: relatedIds } }, select: { id: true, eventType: true, description: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    for (const a of activity) entries.push({ source: "ACTIVITIES", type: a.eventType, at: a.createdAt, summary: a.description, refId: a.id });
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  return entries;
}
