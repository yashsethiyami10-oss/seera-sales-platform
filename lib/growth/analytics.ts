import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type AnalyticsScope = { ownerUserId?: string; territoryId?: string; institutionalOnly?: boolean };
export type AnalyticsPeriod = { start: Date; end: Date };

export async function centralKpis(period: AnalyticsPeriod, scope: AnalyticsScope = {}) {
  const orderWhere: Prisma.OrderWhereInput = {
    createdAt: { gte: period.start, lte: period.end },
    ...(scope.ownerUserId ? { commerceOwnerId: scope.ownerUserId } : {}),
    ...(scope.territoryId ? { commerceTerritoryId: scope.territoryId } : {}),
    ...(scope.institutionalOnly ? { customer: { customerType: { code: "INSTITUTIONAL" } } } : {}),
  };
  const opportunityWhere: Prisma.OpportunityWhereInput = {
    createdAt: { gte: period.start, lte: period.end },
    ...(scope.ownerUserId ? { ownerUserId: scope.ownerUserId } : {}),
    ...(scope.territoryId ? { territoryId: scope.territoryId } : {}),
    ...(scope.institutionalOnly ? { customerType: { code: "INSTITUTIONAL" } } : {}),
  };
  const [orders, opportunityCounts, profiles, customerCount] = await Promise.all([
    prisma.order.findMany({ where: orderWhere, select: {
      total: true, subtotal: true, status: true, commerceStatus: { select: { code: true } },
      commercialInvoice: { select: { grandTotal: true, payments: { where: { status: "PAID" }, select: { amount: true } } } },
    } }),
    prisma.opportunity.groupBy({ by: ["status"], where: opportunityWhere, _count: true }),
    prisma.customerIntelligenceProfile.aggregate({ _avg: { repeatPurchaseRate: true, collectionRate: true }, _sum: { outstandingAmount: true } }),
    prisma.customer.count({ where: scope.ownerUserId ? { assignedOwnerId: scope.ownerUserId } : scope.territoryId ? { assignedTerritoryId: scope.territoryId } : {} }),
  ]);
  const completed = orders.filter(o => o.status === "DELIVERED" || o.commerceStatus?.code === "COMPLETED");
  const cancelled = orders.filter(o => o.status === "CANCELLED" || o.commerceStatus?.code === "CANCELLED");
  const grossRevenue = completed.reduce((sum, o) => sum + o.subtotal, 0);
  const netRevenue = completed.reduce((sum, o) => sum + o.total, 0);
  const collectedRevenue = orders.reduce((sum, o) => sum + (o.commercialInvoice?.payments.reduce((n, p) => n + Number(p.amount), 0) ?? 0), 0);
  const won = opportunityCounts.find(o => o.status === "CLOSED_WON")?._count ?? 0;
  const lost = opportunityCounts.find(o => o.status === "CLOSED_LOST")?._count ?? 0;
  return {
    grossRevenue, netRevenue, collectedRevenue,
    outstandingRevenue: Math.max(0, Number(profiles._sum.outstandingAmount ?? 0)),
    totalOrders: orders.length, completedOrders: completed.length, cancelledOrders: cancelled.length,
    averageOrderValue: completed.length ? netRevenue / completed.length : 0,
    customerCount,
    repeatPurchaseRate: Number(profiles._avg.repeatPurchaseRate ?? 0),
    collectionRate: Number(profiles._avg.collectionRate ?? 0),
    opportunityConversion: won + lost ? won / (won + lost) : 0,
  };
}

export async function generateExecutiveReport(actorId: string, templateCode: string, period: AnalyticsPeriod, filters: AnalyticsScope = {}) {
  return prisma.$transaction(async tx => {
    const template = await tx.executiveReportTemplate.findUniqueOrThrow({ where: { code: templateCode } });
    const metrics = await centralKpis(period, filters);
    const definitions = await tx.kpiDefinition.findMany({ where: { active: true }, select: { code: true, version: true } });
    const existing = await tx.executiveReport.count({ where: { templateId: template.id, periodStart: period.start, periodEnd: period.end } });
    const report = await tx.executiveReport.create({ data: {
      reportNumber: "", templateId: template.id, reportType: template.code,
      periodStart: period.start, periodEnd: period.end, filters, metrics,
      kpiDefinitionVersion: Object.fromEntries(definitions.map(k => [k.code, k.version])),
      reportVersion: existing + 1, sourceReference: `central-kpi:${period.start.toISOString()}:${period.end.toISOString()}`,
      generatedById: actorId,
    } });
    await tx.salesAuditLog.create({ data: { userId: actorId, module: "executive_reporting", action: "REPORT_GENERATED", recordType: "ExecutiveReport", recordId: report.id, newValue: { templateCode, reportVersion: report.reportVersion } } });
    await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: "EXECUTIVE_REPORT_READY", recipient: actorId, status: "PENDING" } });
    return report;
  });
}
