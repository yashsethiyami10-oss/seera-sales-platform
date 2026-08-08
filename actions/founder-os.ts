"use server";

import { toErrorResponse } from "@/lib/errors";
import { getFounderDashboard } from "@/lib/founder-os/dashboard-service";
import { getExecutiveSummary } from "@/lib/founder-os/executive-summary-service";
import { getCompanyHealth } from "@/lib/founder-os/company-health-service";
import { getEnterpriseKpis } from "@/lib/founder-os/kpi-engine";
import { acknowledgeAlert, listAlerts, resolveAlert, runAlertDetection } from "@/lib/founder-os/alert-engine";
import { createNotification, listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/founder-os/notification-center";
import { getActivityFeed, getExecutiveTimeline } from "@/lib/founder-os/timeline-feed";
import { globalSearch } from "@/lib/founder-os/search-foundation";
import { listWidgetsForCurrentUser, setWidgetPreference } from "@/lib/founder-os/widget-service";
import { getRevenueTrendSeries, type TrendGranularity } from "@/lib/founder-os/trend-engine";
import { getAllComparisons, getComparison, type ComparisonKey } from "@/lib/founder-os/comparison-engine";
import { getDecisionQueue } from "@/lib/founder-os/decision-queue-service";
import { runRiskDetection } from "@/lib/founder-os/risk-engine";
import { drillDownToRecords, drillDownToTransactions, listBusinessAreas, type BusinessArea } from "@/lib/founder-os/drilldown-service";
import { explainMetric, listExplainableMetrics } from "@/lib/founder-os/explainability-service";
import { getBusinessHighlights, getCriticalActions, getDailyBrief, getMonthlyBrief, getWeeklyBrief } from "@/lib/founder-os/brief-engine";
import { getApprovalCenter } from "@/lib/founder-os/approval-center-service";
import { getEnterpriseMonitoring } from "@/lib/founder-os/monitoring-service";
import { getExceptionCenter } from "@/lib/founder-os/exception-center-service";
import { getActivitySupervision } from "@/lib/founder-os/activity-supervision-service";
import { escalateNotification, getEscalationCandidates } from "@/lib/founder-os/notification-rules";
import { createSavedView, deleteSavedView, listSavedViews, setDefaultSavedView, updateSavedView } from "@/lib/founder-os/saved-view-service";
import {
  activateDashboardLayout, createDashboardLayout, deleteDashboardLayout, listDashboardLayouts,
  resetDashboardLayoutToSystemDefault, setDefaultDashboardLayout, updateDashboardLayout,
} from "@/lib/founder-os/dashboard-layout-service";
import { listPinnedWidgets, pinWidget, reorderPinnedWidgets, unpinWidget } from "@/lib/founder-os/widget-service";
import { createSavedReport, deleteSavedReport, generateReport, listSavedReports, updateSavedReport } from "@/lib/founder-os/report-workspace-service";
import { getMyWorkspacePreferences, updateMyWorkspacePreferences } from "@/lib/founder-os/workspace-preference-service";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Founder OS
 * Server Actions. Each function here is a thin `try/catch` wrapper around
 * one `lib/founder-os/*` Business Service call, matching every other
 * `actions/*.ts` file's own established convention (`toErrorResponse` on
 * catch, `{ success: true, data }` on success) — no logic of any kind
 * lives in this file; every permission check, feature-flag check, and
 * organization scope is enforced inside the Business Service it calls.
 */

export async function fetchFounderDashboard() {
  try {
    const data = await getFounderDashboard();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchExecutiveSummary() {
  try {
    const data = await getExecutiveSummary();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchCompanyHealth() {
  try {
    const data = await getCompanyHealth();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchEnterpriseKpis() {
  try {
    const data = await getEnterpriseKpis();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchAlerts(filters?: { status?: string; severity?: string }) {
  try {
    const data = await listAlerts(filters ?? {});
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function triggerAlertDetection() {
  try {
    const data = await runAlertDetection();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function acknowledgeFounderAlert(alertId: string, expectedVersion: number) {
  try {
    const data = await acknowledgeAlert(alertId, expectedVersion);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function resolveFounderAlert(alertId: string, expectedVersion: number, input: unknown) {
  try {
    const data = await resolveAlert(alertId, expectedVersion, input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// Stage 5 dependency review: createNotification (notification-center.ts)
// was a fully-built, permission-gated, tested capability with zero
// production callers — only test files invoked it. Wired here to
// complete the integration rather than leave it dead; no new business
// logic, the function already existed and was already covered by tests.
export async function createFounderNotification(input: unknown) {
  try {
    const data = await createNotification(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchMyNotifications(input?: unknown) {
  try {
    const data = await listMyNotifications(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function markFounderNotificationRead(notificationId: string) {
  try {
    const data = await markNotificationRead(notificationId);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function markAllFounderNotificationsRead() {
  try {
    const data = await markAllNotificationsRead();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchExecutiveTimeline(input?: unknown) {
  try {
    const data = await getExecutiveTimeline(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchActivityFeed(input?: unknown) {
  try {
    const data = await getActivityFeed(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function runGlobalSearch(input: unknown) {
  try {
    const data = await globalSearch(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchMyWidgets() {
  try {
    const data = await listWidgetsForCurrentUser();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateWidgetPreference(input: unknown) {
  try {
    const data = await setWidgetPreference(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------
// Part 3D, Stage 2 — Executive Intelligence
// ---------------------------------------------------------------------

export async function fetchRevenueTrend(granularity: TrendGranularity, customRange?: { from: Date; to: Date }) {
  try {
    const data = await getRevenueTrendSeries(granularity, customRange);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchComparison(key: ComparisonKey) {
  try {
    const data = await getComparison(key);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchAllComparisons() {
  try {
    const data = await getAllComparisons();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchDecisionQueue() {
  try {
    const data = await getDecisionQueue();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function triggerRiskDetection() {
  try {
    const data = await runRiskDetection();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchBusinessAreas() {
  try {
    const data = await listBusinessAreas();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchDrillDownRecords(area: BusinessArea, input?: unknown) {
  try {
    const data = await drillDownToRecords(area, input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchDrillDownTransactions(sourceType: "AR_INVOICE" | "AP_BILL", sourceId: string, input?: unknown) {
  try {
    const data = await drillDownToTransactions(sourceType, sourceId, input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchMetricExplanation(metricKey: string) {
  try {
    const data = await explainMetric(metricKey);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchExplainableMetrics() {
  try {
    const data = await listExplainableMetrics();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchDailyBrief() {
  try {
    const data = await getDailyBrief();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchWeeklyBrief() {
  try {
    const data = await getWeeklyBrief();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchMonthlyBrief() {
  try {
    const data = await getMonthlyBrief();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchBusinessHighlights() {
  try {
    const data = await getBusinessHighlights();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchCriticalActions() {
  try {
    const data = await getCriticalActions();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------
// Part 3D, Stage 3 — Enterprise Control Center
// ---------------------------------------------------------------------

export async function fetchApprovalCenter() {
  try {
    const data = await getApprovalCenter();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchEnterpriseMonitoring() {
  try {
    const data = await getEnterpriseMonitoring();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchExceptionCenter() {
  try {
    const data = await getExceptionCenter();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchActivitySupervision(input?: unknown) {
  try {
    const data = await getActivitySupervision(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchEscalationCandidates() {
  try {
    const data = await getEscalationCandidates();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function escalateFounderNotification(notificationId: string) {
  try {
    const data = await escalateNotification(notificationId);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------
// Part 3D, Stage 4 — Founder Workspace
// ---------------------------------------------------------------------

export async function fetchSavedViews(surface?: string) {
  try {
    const data = await listSavedViews(surface);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function createFounderSavedView(input: unknown) {
  try {
    const data = await createSavedView(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateFounderSavedView(input: unknown) {
  try {
    const data = await updateSavedView(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteFounderSavedView(id: string) {
  try {
    const data = await deleteSavedView(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function setFounderDefaultSavedView(id: string) {
  try {
    const data = await setDefaultSavedView(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchDashboardLayouts() {
  try {
    const data = await listDashboardLayouts();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function createFounderDashboardLayout(input: unknown) {
  try {
    const data = await createDashboardLayout(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateFounderDashboardLayout(input: unknown) {
  try {
    const data = await updateDashboardLayout(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function activateFounderDashboardLayout(id: string) {
  try {
    const data = await activateDashboardLayout(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function setFounderDefaultDashboardLayout(id: string) {
  try {
    const data = await setDefaultDashboardLayout(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteFounderDashboardLayout(id: string) {
  try {
    const data = await deleteDashboardLayout(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function resetFounderDashboardLayout() {
  try {
    const data = await resetDashboardLayoutToSystemDefault();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchPinnedWidgets() {
  try {
    const data = await listPinnedWidgets();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function pinFounderWidget(input: unknown) {
  try {
    const data = await pinWidget(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function unpinFounderWidget(input: unknown) {
  try {
    const data = await unpinWidget(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function reorderFounderPinnedWidgets(input: unknown) {
  try {
    const data = await reorderPinnedWidgets(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchSavedReports() {
  try {
    const data = await listSavedReports();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function createFounderSavedReport(input: unknown) {
  try {
    const data = await createSavedReport(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateFounderSavedReport(input: unknown) {
  try {
    const data = await updateSavedReport(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteFounderSavedReport(id: string) {
  try {
    const data = await deleteSavedReport(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function generateFounderReport(id: string) {
  try {
    const data = await generateReport(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function fetchMyWorkspacePreferences() {
  try {
    const data = await getMyWorkspacePreferences();
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateFounderWorkspacePreferences(input: unknown) {
  try {
    const data = await updateMyWorkspacePreferences(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}
