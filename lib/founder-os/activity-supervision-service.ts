import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { getActivityFeed } from "./timeline-feed";
import { listCriticalActiveAlerts } from "./alert-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 3 — Enterprise
 * Activity Supervision. Deliberately thin: "recent enterprise actions"
 * is Stage 1's own `getActivityFeed()` output re-presented (same
 * `SalesTimelineEvent` query, not a second one), and "priority events"
 * is the same CRITICAL-severity active-alert read the Executive Brief
 * Engine's own Critical Actions already perform — factored into
 * `alert-store.ts`'s `listCriticalActiveAlerts` during the Stage 5
 * architecture review after the two files were found to have
 * independently written the identical inline query.
 */

const PRIORITY_EVENTS_PAGE_SIZE = 25;

export async function getActivitySupervision(input: unknown = {}) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);

  const [recentActions, priorityAlerts] = await Promise.all([
    getActivityFeed(input),
    enterpriseTransaction((tx) => listCriticalActiveAlerts(tx, principal.organizationKey, PRIORITY_EVENTS_PAGE_SIZE)),
  ]);

  return {
    asOf: new Date(),
    recentActions,
    priorityEvents: { items: priorityAlerts, count: priorityAlerts.length },
  };
}
