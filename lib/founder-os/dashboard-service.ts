import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getExecutiveSummary } from "./executive-summary-service";
import { getCompanyHealth } from "./company-health-service";
import { getEnterpriseKpis } from "./kpi-engine";
import { listAlerts } from "./alert-engine";
import { listMyNotifications } from "./notification-center";
import { getExecutiveTimeline } from "./timeline-feed";
import { listWidgetsForCurrentUser } from "./widget-service";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Founder
 * Dashboard Framework. The single orchestrator every dashboard-rendering
 * caller (a future page, or a Server Action) should call — it composes
 * every other Stage 1 service, each of which independently enforces its
 * own permission, so this function adds no authorization logic of its
 * own beyond one initial gate shared with every other Founder OS entry
 * point. Every section is fetched in parallel; a failure in one section
 * does not fail the whole dashboard (each downstream service already
 * degrades gracefully — see `kpi-engine.ts`'s own `safe()` wrapper for the
 * KPI section specifically).
 *
 * Stage 5 performance review: this composed `summary` (via
 * `getExecutiveSummary`) and `health` from the exact same underlying KPI
 * numbers, but each independently called `getEnterpriseKpis()` — three
 * full redundant runs of the KPI Engine's ~8 parallel real queries for
 * one dashboard load (one here, one inside `getExecutiveSummary`, one
 * inside its own nested `getCompanyHealth` call). Fixed by fetching KPIs
 * once here and threading the same KPI/Health objects into
 * `getExecutiveSummary`.
 */
export async function getFounderDashboard() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);

  const kpis = await getEnterpriseKpis();
  const health = await getCompanyHealth(kpis);

  const [summary, activeAlerts, notifications, timeline, widgets] = await Promise.all([
    getExecutiveSummary({ kpis, health }),
    listAlerts({ status: "ACTIVE" }),
    listMyNotifications({ pageSize: 10 }),
    getExecutiveTimeline({ pageSize: 15 }),
    listWidgetsForCurrentUser(),
  ]);

  // Block 3, Part C: kpis now carries manufacturingWarehouse/institutional/
  // customerSupport/network sections (Founder visibility across those five
  // modules) in addition to the pre-existing revenue/orders/finance
  // sections. Returned directly here — not just threaded into summary/
  // health's derived narratives — so the raw section data is actually
  // reachable by any current or future dashboard consumer, not silently
  // computed and discarded.
  return { summary, health, kpis, activeAlerts, notifications, timeline, widgets, generatedAt: new Date() };
}
