import type { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import type { EnterpriseTx, EnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { savedReportCreateInput, savedReportUpdateInput } from "./schemas";
import { WORKSPACE_LIMITS, type ReportGrouping, type ReportType } from "./domain";
import { getExecutiveSummary } from "./executive-summary-service";
import { getEnterpriseKpis } from "./kpi-engine";
import { getRevenueTrendSeries } from "./trend-engine";
import { getComparison, getAllComparisons, type ComparisonKey } from "./comparison-engine";
import { getDecisionQueue } from "./decision-queue-service";
import { explainMetric } from "./explainability-service";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 4 — Executive
 * Report Workspace. A Saved Report is a persisted *request shape*
 * (report type + metrics + date range + comparison + grouping) —
 * `generateReport` never recomputes a business number itself; it
 * dispatches by `reportType` to exactly one already-existing Stage 1/2
 * composition (`getExecutiveSummary`, `getEnterpriseKpis`,
 * `getRevenueTrendSeries`, `getComparison`/`getAllComparisons`,
 * `getDecisionQueue`) and attaches Explainability metadata for every
 * requested metric. No direct `finance_*`/Prisma query lives in this
 * file at all — every number comes from a call to another Founder OS
 * service, which itself calls the frozen Part 3C/Phase 15 layer.
 *
 * Scheduling fields (`scheduleFrequency`/`scheduleTimezone`/
 * `scheduleDeliveryChannel`/`scheduleEnabled`/`scheduleRequestedTime`)
 * are stored as-is and never acted on — see PART_3D_FOUNDER_OS_STAGE4.md's
 * "Scheduling limitation." There is deliberately no `lastRunAt`/
 * `nextRunAt` column anywhere in `schema.prisma` for this table, so
 * there is no field that could ever be populated with a false value.
 */

function validateReportDateRange(from?: Date | null, to?: Date | null) {
  if (!from || !to) return;
  if (from.getTime() > to.getTime()) throw new AppError("dateRangeFrom must not be after dateRangeTo");
  const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  if (days > WORKSPACE_LIMITS.maxReportDateRangeDays) {
    throw new AppError(`Report date range cannot exceed ${WORKSPACE_LIMITS.maxReportDateRangeDays} days`);
  }
}

async function requireOwnedReport(tx: EnterpriseTx, principal: EnterprisePrincipal, id: string) {
  const report = await tx.founderSavedReport.findFirst({ where: { id, organizationKey: principal.organizationKey, ownerId: principal.id } });
  if (!report) throw new NotFoundError("Saved report");
  return report;
}

export async function listSavedReports() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction((tx) => tx.founderSavedReport.findMany({
    where: { organizationKey: principal.organizationKey, ownerId: principal.id },
    orderBy: [{ createdAt: "desc" }],
  }));
}

export async function createSavedReport(input: unknown) {
  const data = savedReportCreateInput.parse(input);
  validateReportDateRange(data.dateRangeFrom, data.dateRangeTo);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    const count = await tx.founderSavedReport.count({ where: { organizationKey: principal.organizationKey, ownerId: principal.id } });
    if (count >= WORKSPACE_LIMITS.maxSavedReportsPerOwner) throw new AppError("Maximum number of saved reports reached");

    return tx.founderSavedReport.create({
      data: {
        organizationKey: principal.organizationKey, ownerId: principal.id, name: data.name, reportType: data.reportType,
        metrics: data.metrics as Prisma.InputJsonValue,
        dateRangeFrom: data.dateRangeFrom, dateRangeTo: data.dateRangeTo,
        comparisonMode: data.comparisonMode, grouping: data.grouping,
        filters: data.filters as Prisma.InputJsonValue | undefined,
        sortOrder: data.sortOrder, outputPreference: data.outputPreference,
        scheduleFrequency: data.scheduleFrequency, scheduleTimezone: data.scheduleTimezone,
        scheduleDeliveryChannel: data.scheduleDeliveryChannel, scheduleEnabled: data.scheduleEnabled,
        scheduleRequestedTime: data.scheduleRequestedTime,
      },
    });
  });
}

export async function updateSavedReport(input: unknown) {
  const data = savedReportUpdateInput.parse(input);
  validateReportDateRange(data.dateRangeFrom, data.dateRangeTo);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    const report = await requireOwnedReport(tx, principal, data.id);
    return tx.founderSavedReport.update({
      where: { id: report.id },
      data: {
        name: data.name ?? undefined, reportType: data.reportType ?? undefined,
        metrics: (data.metrics as Prisma.InputJsonValue | undefined) ?? undefined,
        dateRangeFrom: data.dateRangeFrom ?? undefined, dateRangeTo: data.dateRangeTo ?? undefined,
        comparisonMode: data.comparisonMode ?? undefined, grouping: data.grouping ?? undefined,
        filters: (data.filters as Prisma.InputJsonValue | undefined) ?? undefined,
        sortOrder: data.sortOrder ?? undefined, outputPreference: data.outputPreference ?? undefined,
        scheduleFrequency: data.scheduleFrequency ?? undefined, scheduleTimezone: data.scheduleTimezone ?? undefined,
        scheduleDeliveryChannel: data.scheduleDeliveryChannel ?? undefined, scheduleEnabled: data.scheduleEnabled ?? undefined,
        scheduleRequestedTime: data.scheduleRequestedTime ?? undefined,
      },
    });
  });
}

export async function deleteSavedReport(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const report = await requireOwnedReport(tx, principal, id);
    await tx.founderSavedReport.delete({ where: { id: report.id } });
    return { deleted: true, id: report.id };
  });
}

export async function generateReport(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  const report = await enterpriseTransaction((tx) => requireOwnedReport(tx, principal, id));
  validateReportDateRange(report.dateRangeFrom, report.dateRangeTo);

  const generatedAt = new Date();
  const reportType = report.reportType as ReportType;
  let sections: Record<string, unknown>;

  switch (reportType) {
    case "EXECUTIVE_SUMMARY":
      sections = { summary: await getExecutiveSummary() };
      break;
    case "KPI_SNAPSHOT":
      sections = { kpis: await getEnterpriseKpis(), requestedMetrics: (report.metrics as string[] | null) ?? [] };
      break;
    case "TREND_ANALYSIS": {
      const customRange = report.dateRangeFrom && report.dateRangeTo ? { from: report.dateRangeFrom, to: report.dateRangeTo } : undefined;
      const granularity = customRange ? "CUSTOM" as const : ((report.grouping as ReportGrouping | null) ?? "MONTHLY");
      sections = { trend: await getRevenueTrendSeries(granularity, customRange) };
      break;
    }
    case "PERIOD_COMPARISON":
      sections = report.comparisonMode
        ? { comparison: await getComparison(report.comparisonMode as ComparisonKey) }
        : { comparisons: await getAllComparisons() };
      break;
    case "DECISION_QUEUE_SNAPSHOT":
      sections = { decisionQueue: await getDecisionQueue() };
      break;
    default:
      // Unreachable given Zod's z.enum(REPORT_TYPES) at write time — a
      // real, safe failure mode rather than a silent fallthrough if the
      // registry and this switch ever drift.
      throw new AppError(`Unsupported report type: ${reportType}`);
  }

  const requestedMetrics = (report.metrics as string[] | null) ?? [];
  const explainability = (
    await Promise.all(requestedMetrics.slice(0, WORKSPACE_LIMITS.maxMetricsPerReport).map((key) => explainMetric(key)))
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  await enterpriseTransaction((tx) => tx.founderSavedReport.update({ where: { id: report.id }, data: { lastGeneratedAt: generatedAt } }));

  return {
    report: { id: report.id, name: report.name, reportType, outputPreference: report.outputPreference },
    generatedAt,
    sections,
    explainability,
    sourceSystems: [
      "Founder OS Stage 1 (KPI Engine, Executive Summary)",
      "Founder OS Stage 2 (Trend Engine, Comparison Engine, Decision Queue)",
      "lib/analytics.ts, Phase 15 (frozen)",
      "Enterprise Finance Platform, Part 3C (frozen)",
    ],
  };
}
