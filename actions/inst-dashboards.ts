"use server";

import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { getOpportunityPipelineSummary } from "@/actions/inst-opportunities";
import { getLeadSummaryCounts } from "@/actions/inst-leads";
import { getQuotationSummaryCounts } from "@/actions/inst-quotations";

/**
 * Module 1 — the three role dashboards. Each is one aggregation action
 * (not a page-of-actions) since every widget on a given dashboard is read
 * together on first paint; individual widgets can still be re-fetched
 * independently via the domain actions already built (getLeadSummaryCounts,
 * getOpportunityPipelineSummary, etc.) if a page wants to refresh one.
 */

export async function getFounderDashboard() {
  try {
    await requirePermission(PERMISSIONS.INST_DASHBOARD_FOUNDER);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [pipeline, leads, quotations, revenueAgg, pendingFollowUps, samplesByStatus, teamRows, territoryRows] = await Promise.all([
      getOpportunityPipelineSummary(),
      getLeadSummaryCounts(),
      getQuotationSummaryCounts(),
      prisma.instOpportunity.aggregate({ where: { stage: "WON", wonAt: { gte: monthStart } }, _sum: { estimatedRevenue: true }, _count: { _all: true } }),
      prisma.instFollowUp.count({ where: { status: "PENDING", dueDate: { lt: now } } }),
      prisma.instSample.groupBy({ by: ["trialStatus"], _count: { _all: true } }),
      prisma.instOpportunity.groupBy({ by: ["ownerId"], where: { stage: "WON" }, _count: { _all: true }, _sum: { estimatedRevenue: true } }),
      prisma.instOpportunity.groupBy({ by: ["territoryId"], _count: { _all: true }, _sum: { estimatedRevenue: true } }),
    ]);

    const ownerIds = teamRows.map((r) => r.ownerId);
    const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
    const ownerNameById = Object.fromEntries(owners.map((o) => [o.id, o.name]));

    const territoryIds = territoryRows.map((r) => r.territoryId).filter((id): id is string => !!id);
    const territories = territoryIds.length ? await prisma.territory.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } }) : [];
    const territoryNameById = Object.fromEntries(territories.map((t) => [t.id, t.name]));

    return {
      success: true as const,
      data: {
        totalPipeline: pipeline.success ? pipeline.data.totalPipelineValue : 0,
        openOpportunities: pipeline.success ? pipeline.data.openOpportunities : 0,
        conversionRate: pipeline.success ? pipeline.data.conversionRate : 0,
        revenueThisMonth: Number(revenueAgg._sum.estimatedRevenue ?? 0),
        ordersWonThisMonth: revenueAgg._count._all,
        leadsTotal: leads.success ? leads.data.total : 0,
        leadsByStatus: leads.success ? leads.data.byStatus : {},
        pendingFollowUps,
        samplePipeline: Object.fromEntries(samplesByStatus.map((s) => [s.trialStatus, s._count._all])),
        quotations: quotations.success ? quotations.data : { total: 0, byStatus: {}, pendingApprovalValue: 0 },
        teamPerformance: teamRows.map((r) => ({ userId: r.ownerId, name: ownerNameById[r.ownerId] ?? "Unknown", won: r._count._all, revenue: Number(r._sum.estimatedRevenue ?? 0) })).sort((a, b) => b.revenue - a.revenue),
        territoryPerformance: territoryRows.map((r) => ({ territoryId: r.territoryId, name: r.territoryId ? territoryNameById[r.territoryId] ?? "Unknown" : "Unassigned", count: r._count._all, value: Number(r._sum.estimatedRevenue ?? 0) })).sort((a, b) => b.value - a.value),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getSalesManagerDashboard() {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_DASHBOARD_MANAGER);
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const [pipeline, quotations, todaysVisits, missedVisits, pendingFollowUps, targets, recentActivity] = await Promise.all([
      getOpportunityPipelineSummary(),
      getQuotationSummaryCounts(),
      prisma.instVisit.findMany({ where: { visitDate: { gte: startOfDay, lte: endOfDay } }, include: { officer: { select: { name: true } }, customer: { select: { name: true } }, lead: { select: { organizationName: true } } }, orderBy: { visitDate: "asc" } }),
      prisma.instVisit.count({ where: { visitDate: { lt: startOfDay }, checkOutAt: null } }),
      prisma.instFollowUp.count({ where: { status: "PENDING", dueDate: { lt: now } } }),
      prisma.instTarget.findMany({ where: { periodStart: { lte: now }, periodEnd: { gte: now } }, include: { user: { select: { name: true } } } }),
      prisma.instVisit.findMany({ orderBy: { updatedAt: "desc" }, take: 10, include: { officer: { select: { name: true } }, customer: { select: { name: true } } } }),
    ]);

    const targetUserIds = targets.map((t) => t.userId);
    const achieved = targetUserIds.length
      ? await prisma.instOpportunity.groupBy({ by: ["ownerId"], where: { ownerId: { in: targetUserIds }, stage: "WON", wonAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { estimatedRevenue: true } })
      : [];
    const achievedByUser = Object.fromEntries(achieved.map((a) => [a.ownerId, Number(a._sum.estimatedRevenue ?? 0)]));

    return {
      success: true as const,
      data: {
        principalId: principal.id,
        opportunityPipeline: pipeline.success ? pipeline.data : null,
        quotations: quotations.success ? quotations.data : { total: 0, byStatus: {}, pendingApprovalValue: 0 },
        todaysVisits: todaysVisits.map((v) => ({ ...v, checkInLat: v.checkInLat ? Number(v.checkInLat) : null, checkInLng: v.checkInLng ? Number(v.checkInLng) : null, checkOutLat: v.checkOutLat ? Number(v.checkOutLat) : null, checkOutLng: v.checkOutLng ? Number(v.checkOutLng) : null })),
        missedVisits,
        pendingFollowUps,
        targets: targets.map((t) => ({ id: t.id, userId: t.userId, userName: t.user.name, periodType: t.periodType, targetRevenue: Number(t.targetRevenue), achievedRevenue: achievedByUser[t.userId] ?? 0 })),
        teamActivities: recentActivity.map((v) => ({ id: v.id, officer: v.officer.name, customer: v.customer?.name ?? "—", visitDate: v.visitDate, outcome: v.outcome })),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getSalesOfficerDashboard() {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_DASHBOARD_OFFICER);
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const [plan, route, todaysVisits, followUps, tasks, assignedLeads, samples, pipelineSummary, quotationSummary] = await Promise.all([
      prisma.instDailyPlan.findUnique({ where: { officerId_planDate: { officerId: principal.id, planDate: startOfDay } } }),
      prisma.instRoute.findUnique({ where: { officerId_routeDate: { officerId: principal.id, routeDate: startOfDay } } }),
      prisma.instVisit.findMany({ where: { officerId: principal.id, visitDate: { gte: startOfDay, lte: endOfDay } }, include: { customer: { select: { name: true } }, lead: { select: { organizationName: true } } }, orderBy: { visitDate: "asc" } }),
      prisma.instFollowUp.findMany({ where: { assignedToId: principal.id, status: "PENDING", dueDate: { lte: endOfDay } }, include: { customer: { select: { name: true } }, lead: { select: { organizationName: true } } }, orderBy: { dueDate: "asc" }, take: 20 }),
      prisma.instTask.findMany({ where: { assignedToId: principal.id, status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" }, take: 20 }),
      prisma.instLead.findMany({ where: { assignedToId: principal.id, status: { notIn: ["WON", "LOST"] } }, orderBy: { updatedAt: "desc" }, take: 10 }),
      prisma.instSample.findMany({ where: { officerId: principal.id, trialStatus: { not: "COMPLETED" } }, include: { customer: { select: { name: true } }, product: { select: { name: true } } }, orderBy: { issuedDate: "desc" }, take: 10 }),
      // Reuses the existing, already-correctly-scoped summary functions
      // (already called elsewhere for Manager/Founder views) instead of a
      // third hand-rolled aggregation — surfaces data that already existed
      // but was never wired into the Officer's own dashboard.
      getOpportunityPipelineSummary(principal.id),
      getQuotationSummaryCounts(),
    ]);

    const awaitingActionStatuses = ["DRAFT", "PENDING_APPROVAL", "SENT"] as const;
    const quotationsAwaitingAction = quotationSummary.success
      ? awaitingActionStatuses.reduce((sum, status) => sum + (quotationSummary.data.byStatus[status] ?? 0), 0)
      : 0;

    return {
      success: true as const,
      data: {
        plan,
        route: route ? { ...route, plannedDistanceKm: route.plannedDistanceKm ? Number(route.plannedDistanceKm) : null } : null,
        todaysVisits,
        followUps: followUps.map((f) => ({ ...f, isOverdue: f.dueDate < now })),
        tasks,
        assignedLeads: assignedLeads.map((l) => ({ ...l, estimatedValue: Number(l.estimatedValue) })),
        samples: samples.map((s) => ({ ...s, quantity: Number(s.quantity) })),
        opportunitiesInProgress: pipelineSummary.success ? pipelineSummary.data.openOpportunities : 0,
        expectedPipelineValue: pipelineSummary.success ? pipelineSummary.data.totalPipelineValue : 0,
        quotationsAwaitingAction,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Sales Officer Dashboard's "Quick Customer Search" — thin wrapper over the existing Customer Master search, scoped to the officer's own assigned customers unless they hold the broader view permission. */
export async function quickCustomerSearch(q: string) {
  try {
    const principal = await getSalesPrincipal();
    if (!q || q.trim().length < 2) return { success: true as const, data: [] };
    const canViewAll = principal.isFounder || principal.permissions.has(PERMISSIONS.CUSTOMERS_VIEW_ALL);
    const customers = await prisma.customer.findMany({
      where: {
        AND: [
          canViewAll ? {} : { assignedOwnerId: principal.id },
          { OR: [{ name: { contains: q, mode: "insensitive" } }, { businessName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] },
        ],
      },
      select: { id: true, name: true, businessName: true, phone: true, city: true },
      take: 10,
    });
    return { success: true as const, data: customers };
  } catch (err) {
    return toErrorResponse(err);
  }
}
