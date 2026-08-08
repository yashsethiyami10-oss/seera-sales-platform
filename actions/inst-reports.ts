"use server";

import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

/** Module 14 — Reports. Each function is one self-contained report query, gated by the same inst_sales.reports.view permission. */

export async function getPipelineReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const rows = await prisma.instOpportunity.groupBy({ by: ["stage"], _count: { _all: true }, _sum: { estimatedRevenue: true } });
    return { success: true as const, data: rows.map((r) => ({ stage: r.stage, count: r._count._all, value: Number(r._sum.estimatedRevenue ?? 0) })) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getConversionReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const [leadsTotal, leadsWon, oppsTotal, oppsWon] = await Promise.all([
      prisma.instLead.count(),
      prisma.instLead.count({ where: { status: "WON" } }),
      prisma.instOpportunity.count(),
      prisma.instOpportunity.count({ where: { stage: "WON" } }),
    ]);
    return {
      success: true as const,
      data: {
        leadToOpportunityRate: leadsTotal ? Math.round(((leadsTotal - (await prisma.instLead.count({ where: { status: { in: ["NEW", "CONTACTED"] } } }))) / leadsTotal) * 1000) / 10 : 0,
        leadWinRate: leadsTotal ? Math.round((leadsWon / leadsTotal) * 1000) / 10 : 0,
        opportunityWinRate: oppsTotal ? Math.round((oppsWon / oppsTotal) * 1000) / 10 : 0,
        leadsTotal, leadsWon, oppsTotal, oppsWon,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getOpportunityReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const [byStage, avgAgg] = await Promise.all([
      prisma.instOpportunity.groupBy({ by: ["stage"], _count: { _all: true }, _avg: { probability: true } }),
      prisma.instOpportunity.aggregate({ _avg: { estimatedRevenue: true } }),
    ]);
    return {
      success: true as const,
      data: {
        byStage: byStage.map((r) => ({ stage: r.stage, count: r._count._all, avgProbability: Math.round(r._avg.probability ?? 0) })),
        avgDealSize: Math.round(Number(avgAgg._avg.estimatedRevenue ?? 0)),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getTerritoryReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const rows = await prisma.instOpportunity.groupBy({ by: ["territoryId"], _count: { _all: true }, _sum: { estimatedRevenue: true } });
    const ids = rows.map((r) => r.territoryId).filter((id): id is string => !!id);
    const territories = ids.length ? await prisma.territory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameById = Object.fromEntries(territories.map((t) => [t.id, t.name]));
    return { success: true as const, data: rows.map((r) => ({ territoryId: r.territoryId, name: r.territoryId ? nameById[r.territoryId] ?? "Unknown" : "Unassigned", count: r._count._all, value: Number(r._sum.estimatedRevenue ?? 0) })).sort((a, b) => b.value - a.value) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getOfficerPerformanceReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const rows = await prisma.instOpportunity.groupBy({ by: ["ownerId", "stage"], _count: { _all: true }, _sum: { estimatedRevenue: true } });
    const ids = [...new Set(rows.map((r) => r.ownerId))];
    const owners = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameById = Object.fromEntries(owners.map((o) => [o.id, o.name]));

    const byOwner = new Map<string, { userId: string; name: string; total: number; won: number; lost: number; open: number; revenue: number }>();
    for (const r of rows) {
      const entry = byOwner.get(r.ownerId) ?? { userId: r.ownerId, name: nameById[r.ownerId] ?? "Unknown", total: 0, won: 0, lost: 0, open: 0, revenue: 0 };
      entry.total += r._count._all;
      if (r.stage === "WON") { entry.won += r._count._all; entry.revenue += Number(r._sum.estimatedRevenue ?? 0); }
      else if (r.stage === "LOST") entry.lost += r._count._all;
      else entry.open += r._count._all;
      byOwner.set(r.ownerId, entry);
    }
    return { success: true as const, data: [...byOwner.values()].sort((a, b) => b.revenue - a.revenue) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getSampleConversionReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const [total, byResult] = await Promise.all([
      prisma.instSample.count(),
      prisma.instSample.groupBy({ by: ["trialResult"], where: { trialStatus: "COMPLETED" }, _count: { _all: true } }),
    ]);
    const positive = byResult.find((r) => r.trialResult === "POSITIVE")?._count._all ?? 0;
    const completed = byResult.reduce((sum, r) => sum + r._count._all, 0);
    return {
      success: true as const,
      data: { total, completed, positive, conversionRate: completed ? Math.round((positive / completed) * 1000) / 10 : 0, byResult: byResult.map((r) => ({ result: r.trialResult ?? "PENDING", count: r._count._all })) },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getLostReasonsReport() {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const lost = await prisma.instOpportunity.findMany({ where: { stage: "LOST" }, select: { lostReason: true, estimatedRevenue: true } });
    const byReason = new Map<string, { reason: string; count: number; value: number }>();
    for (const row of lost) {
      const reason = row.lostReason?.trim() || "Not specified";
      const entry = byReason.get(reason) ?? { reason, count: 0, value: 0 };
      entry.count += 1; entry.value += Number(row.estimatedRevenue);
      byReason.set(reason, entry);
    }
    return { success: true as const, data: [...byReason.values()].sort((a, b) => b.count - a.count) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getRevenueTrendsReport(months = 6) {
  try {
    await requirePermission(PERMISSIONS.INST_REPORTS_VIEW);
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const won = await prisma.instOpportunity.findMany({ where: { stage: "WON", wonAt: { gte: from } }, select: { wonAt: true, estimatedRevenue: true } });

    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const row of won) {
      if (!row.wonAt) continue;
      const key = `${row.wonAt.getFullYear()}-${String(row.wonAt.getMonth() + 1).padStart(2, "0")}`;
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + Number(row.estimatedRevenue));
    }
    return { success: true as const, data: [...buckets.entries()].map(([month, revenue]) => ({ month, revenue })) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
