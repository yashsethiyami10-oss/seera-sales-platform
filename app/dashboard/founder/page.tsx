import Link from "next/link";
import { Search } from "lucide-react";
import {
  fetchFounderDashboard, acknowledgeFounderAlert, resolveFounderAlert,
  markFounderNotificationRead, markAllFounderNotificationsRead, runGlobalSearch,
} from "@/actions/founder-os";

/**
 * Enterprise UI Integration — Founder OS UI. This is the real Founder OS
 * Stage 1 experience (health, KPIs, alerts, notifications, executive
 * timeline, global search) — the page previously just rendered the
 * generic `SalesDashboard` (title="Founder overview"), never calling any
 * `lib/founder-os/*` service despite that whole layer, and its
 * `actions/founder-os.ts` Server Action wrappers, already existing and
 * already tested (__tests__/founder-os/stage1.integration.test.ts).
 * Everything below calls an existing action; no calculation, permission
 * check, or feature-flag check is duplicated here.
 *
 * Deliberately out of scope for this pass (real, larger, separately
 * warranted follow-up work — not silently dropped): Stage 4 Workspace UI
 * (saved views, dashboard layouts, pinned-widget reordering, saved
 * reports/scheduling) and the Stage 2/3 analysis surfaces (trend/
 * comparison/risk/decision-queue/explainability/drilldown/briefs/
 * approval-center/monitoring/exception-center/activity-supervision) —
 * all have real, tested Server Actions in actions/founder-os.ts with zero
 * UI today, but building all of it in one pass would not be a real,
 * verified implementation of any of it.
 */

const SEVERITY_COLOR: Record<string, string> = { CRITICAL: "text-red-400", HIGH: "text-amber-400", MEDIUM: "text-yellow-300", LOW: "text-zinc-400" };
const HEALTH_COLOR: Record<string, string> = { GOOD: "text-emerald-400", WATCH: "text-amber-400", AT_RISK: "text-red-400" };

function formatDecimal(value: unknown) {
  if (value === null || value === undefined) return "0";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default async function FounderOsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [result, searchResult] = await Promise.all([
    fetchFounderDashboard(),
    q ? runGlobalSearch({ query: q }) : Promise.resolve(null),
  ]);

  if (!result.success) {
    return <section className="space-y-4 text-white">
      <h1 className="text-3xl font-semibold">Founder Operating System</h1>
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">
        <p className="text-sm text-zinc-300">{result.error.message}</p>
        <p className="mt-2 text-xs text-zinc-500">Founder OS requires both ENTERPRISE_OPERATIONS_ENABLED and ENTERPRISE_FOUNDER_OS_ENABLED to be on, and the Founder OS Access permission.</p>
      </div>
    </section>;
  }

  const { summary, health, kpis, activeAlerts, notifications, timeline } = result.data;

  async function acknowledge(alertId: string, version: number) {
    "use server";
    await acknowledgeFounderAlert(alertId, version);
  }
  async function resolve(alertId: string, version: number) {
    "use server";
    await resolveFounderAlert(alertId, version, {});
  }
  async function markRead(notificationId: string) {
    "use server";
    await markFounderNotificationRead(notificationId);
  }
  async function markAllRead() {
    "use server";
    await markAllFounderNotificationsRead();
  }

  return <section className="space-y-6 text-white">
    <header className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-amber-400">Founder</p>
        <h1 className="mt-2 text-3xl font-semibold">Founder Operating System</h1>
        <p className="mt-1 text-sm text-zinc-400">Organization-wide health, KPIs, alerts, and activity — as of {new Date(summary.generatedAt).toLocaleString()}</p>
      </div>
      <form className="flex w-72 gap-2">
        <input name="q" defaultValue={q} placeholder="Search customers, orders, invoices…" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm" />
        <button type="submit" aria-label="Search" className="shrink-0 rounded-xl border border-white/10 px-3 hover:bg-white/5"><Search size={16} /></button>
      </form>
    </header>

    {searchResult && (
      <div className="rounded-2xl border border-white/10 p-5">
        <h2 className="font-medium">Search results for &ldquo;{q}&rdquo;</h2>
        {searchResult.success && searchResult.data.results.length ? (
          <div className="mt-3 grid gap-2">
            {searchResult.data.results.map((r) => (
              <Link key={`${r.type}-${r.id}`} href={r.deepLink} className="flex justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5">
                <span>{r.title}</span><span className="text-zinc-500">{r.type} · {r.subtitle}</span>
              </Link>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-zinc-500">No results.</p>}
      </div>
    )}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Company Health</p>
        <p className={`mt-3 text-3xl font-semibold ${HEALTH_COLOR[health.overall] ?? "text-white"}`}>{health.overall}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Revenue This Month</p>
        <p className="mt-3 text-3xl font-semibold">INR {formatDecimal(summary.revenueThisMonth)}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Outstanding Receivables</p>
        <p className="mt-3 text-3xl font-semibold">INR {formatDecimal(summary.outstandingReceivables)}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Outstanding Payables</p>
        <p className="mt-3 text-3xl font-semibold">INR {formatDecimal(summary.outstandingPayables)}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Cash Position</p>
        <p className="mt-3 text-3xl font-semibold">INR {formatDecimal(summary.cashPosition)}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Orders Today</p>
        <p className="mt-3 text-3xl font-semibold">{summary.ordersToday}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">New Customers This Month</p>
        <p className="mt-3 text-3xl font-semibold">{summary.newCustomersThisMonth}</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm text-zinc-400">Active Alerts</p>
        <p className="mt-3 text-3xl font-semibold">{summary.activeAlertCount}</p>
      </article>
    </div>

    {/* Block 3, Part C — Founder read visibility across Warehouse,
        Manufacturing, Institutional Sales, Customer Support, and Network,
        each backed by an existing, already-permission-gated service
        function (see lib/founder-os/kpi-engine.ts). Read-only, matching
        the existing card pattern above — no new interaction added. */}
    <div className="rounded-2xl border border-white/10 p-5">
      <h2 className="font-medium">Platform Visibility</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-zinc-400">Manufacturing &amp; Warehouse</p>
          {kpis.manufacturingWarehouse.available ? (
            <>
              <p className="mt-2 text-xl font-semibold">{kpis.manufacturingWarehouse.data.productionOrders.reduce((sum, row) => sum + row._count, 0)} production orders</p>
              <p className="text-xs text-zinc-500">{kpis.manufacturingWarehouse.data.batches.reduce((sum, row) => sum + row._count, 0)} batches · {kpis.manufacturingWarehouse.data.warehouseMovements} warehouse movements</p>
            </>
          ) : <p className="mt-2 text-xs text-zinc-500">Unavailable: {kpis.manufacturingWarehouse.reason}</p>}
        </article>
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-zinc-400">Institutional Sales</p>
          {kpis.institutional.available ? (
            <>
              <p className="mt-2 text-xl font-semibold">{kpis.institutional.data.openOpportunities} open opportunities</p>
              <p className="text-xs text-zinc-500">INR {formatDecimal(kpis.institutional.data.revenueThisMonth)} revenue this month</p>
            </>
          ) : <p className="mt-2 text-xs text-zinc-500">Unavailable: {kpis.institutional.reason}</p>}
        </article>
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-zinc-400">Customer Support</p>
          {kpis.customerSupport.available ? (
            <>
              <p className="mt-2 text-xl font-semibold">{kpis.customerSupport.data.openTickets} open tickets</p>
              <p className="text-xs text-zinc-500">{kpis.customerSupport.data.criticalTickets} critical · {kpis.customerSupport.data.csat.average ?? "—"} CSAT</p>
            </>
          ) : <p className="mt-2 text-xs text-zinc-500">Unavailable: {kpis.customerSupport.reason}</p>}
        </article>
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-zinc-400">Network / Partners</p>
          {kpis.network.available ? (
            <>
              <p className="mt-2 text-xl font-semibold">{Object.values(kpis.network.data.partnersByStatus).reduce((sum: number, n) => sum + Number(n), 0)} partners</p>
              <p className="text-xs text-zinc-500">{Object.values(kpis.network.data.claimsByStatus).reduce((sum: number, c) => sum + Number((c as { count: number }).count), 0)} claims</p>
            </>
          ) : <p className="mt-2 text-xs text-zinc-500">Unavailable: {kpis.network.reason}</p>}
        </article>
      </div>
    </div>

    <div className="rounded-2xl border border-white/10 p-5">
      <h2 className="font-medium">Health Signals</h2>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {health.signals.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm">
            <div><span className={`font-medium ${HEALTH_COLOR[s.status] ?? ""}`}>{s.label}</span><p className="text-xs text-zinc-500">{s.detail}</p></div>
            <span className="text-xs text-zinc-500">{s.area}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-2xl border border-white/10 p-5">
      <h2 className="font-medium">Active Alerts</h2>
      {activeAlerts.length ? (
        <div className="mt-4 grid gap-2">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-white/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-sm font-medium ${SEVERITY_COLOR[alert.severity] ?? "text-white"}`}>{alert.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{alert.description}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={acknowledge.bind(null, alert.id, alert.version)}><button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">Acknowledge</button></form>
                  <form action={resolve.bind(null, alert.id, alert.version)}><button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">Resolve</button></form>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-zinc-500">No active alerts.</p>}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Notifications {notifications.unread ? `(${notifications.unread} unread)` : ""}</h2>
          {notifications.unread > 0 && <form action={markAllRead}><button className="text-xs text-amber-400 hover:underline">Mark all read</button></form>}
        </div>
        {notifications.items.length ? (
          <div className="mt-4 divide-y divide-white/10">
            {notifications.items.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div><p className={n.readAt ? "text-sm text-zinc-400" : "text-sm text-white"}>{n.title}</p><p className="text-xs text-zinc-500">{n.body}</p></div>
                {!n.readAt && <form action={markRead.bind(null, n.id)}><button className="shrink-0 text-xs text-amber-400 hover:underline">Mark read</button></form>}
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-zinc-500">No notifications.</p>}
      </div>

      <div className="rounded-2xl border border-white/10 p-5">
        <h2 className="font-medium">Executive Timeline</h2>
        {timeline.items.length ? (
          <ol className="mt-4 space-y-3">
            {timeline.items.map((e) => (
              <li key={e.id} className="border-l border-amber-400/30 pl-4">
                <p className="text-sm text-zinc-300">{e.description}</p>
                <time className="text-xs text-zinc-500">{new Date(e.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        ) : <p className="mt-4 text-sm text-zinc-500">No recent activity.</p>}
      </div>
    </div>
  </section>;
}
