import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { getExecutiveSummary } from "./executive-summary-service";
import { getComparison } from "./comparison-engine";
import { getExecutiveTimeline } from "./timeline-feed";
import { getDecisionQueue } from "./decision-queue-service";
import { listCriticalActiveAlerts } from "./alert-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Executive Brief
 * Engine. Every brief is the same composition pattern (Executive Summary
 * + the matching Comparison Engine period + recent Executive Timeline
 * entries), at a different time horizon — no calculation is duplicated
 * across Daily/Weekly/Monthly; only the comparison key and lookback
 * window differ.
 */

async function buildBrief(comparisonKey: "TODAY_VS_YESTERDAY" | "WEEK_VS_WEEK" | "MONTH_VS_MONTH", timelinePageSize: number) {
  const [summary, comparison, timeline] = await Promise.all([
    getExecutiveSummary(),
    getComparison(comparisonKey),
    getExecutiveTimeline({ pageSize: timelinePageSize }),
  ]);
  return { generatedAt: new Date(), summary, comparison, recentActivity: timeline.items };
}

export async function getDailyBrief() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return buildBrief("TODAY_VS_YESTERDAY", 10);
}

export async function getWeeklyBrief() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return buildBrief("WEEK_VS_WEEK", 25);
}

export async function getMonthlyBrief() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return buildBrief("MONTH_VS_MONTH", 50);
}

/** Business Highlights: the Executive Timeline's own curated allowlist
 * (already "founder-significant" by construction — see `timeline-feed.ts`)
 * for the last 7 days, re-labeled for a highlights view. Not a second
 * curation pass. */
export async function getBusinessHighlights() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const timeline = await getExecutiveTimeline({ pageSize: 20 });
  return { generatedAt: new Date(), highlights: timeline.items };
}

/** Critical Actions: the Decision Queue's own items, filtered to what's
 * actually urgent (CRITICAL-severity alerts, plus every pending
 * approval — a pending approval is definitionally an action, not merely
 * informational). Not a new query path. */
export async function getCriticalActions() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const [queue, criticalAlerts] = await Promise.all([
    getDecisionQueue(),
    enterpriseTransaction((tx) => listCriticalActiveAlerts(tx, principal.organizationKey, 50)),
  ]);
  return {
    generatedAt: new Date(),
    criticalAlerts,
    pendingVendorPayments: queue.pendingVendorPayments,
    criticalExpenses: queue.criticalExpenses,
    totalActionCount: criticalAlerts.length + queue.pendingApprovalsCount,
  };
}
