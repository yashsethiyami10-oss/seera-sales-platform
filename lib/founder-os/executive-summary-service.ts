import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getEnterpriseKpis } from "./kpi-engine";
import { getCompanyHealth } from "./company-health-service";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Executive
 * Summary Service. A compact, top-of-dashboard composition of the KPI
 * Engine and Company Health Service (both called directly, not
 * reimplemented) plus real counts of active alerts and pending vendor
 * payment approvals — the latter a direct, read-only count against the
 * same frozen Part 3C `FinanceVendorPayment` status the Alert Engine's own
 * `detectPendingVendorPayments` already reads, not a new calculation.
 * Deliberately no AI-generated narrative text — every field here is a
 * plain number or enum from a real query.
 *
 * Stage 5 performance review: `getCompanyHealth()` computes its signals
 * from a `getEnterpriseKpis()` call of its own — calling both in
 * parallel here (the original Stage 1 shape) silently ran the KPI
 * Engine's ~8 parallel real queries twice per call. Fixed by fetching
 * KPIs once and passing them into `getCompanyHealth`. An optional
 * `precomputed` param lets `dashboard-service.ts` (which needs the full
 * Health object separately anyway) share the same single KPI fetch
 * across both, rather than a third redundant run.
 */
export async function getExecutiveSummary(precomputed?: {
  kpis: Awaited<ReturnType<typeof getEnterpriseKpis>>;
  health: Awaited<ReturnType<typeof getCompanyHealth>>;
}) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const kpis = precomputed?.kpis ?? await getEnterpriseKpis();
  const [health, activeAlertCount, pendingApprovalCount] = await Promise.all([
    precomputed ? Promise.resolve(precomputed.health) : getCompanyHealth(kpis),
    enterpriseTransaction((tx) => tx.founderAlert.count({ where: { organizationKey: principal.organizationKey, status: "ACTIVE" } })),
    enterpriseTransaction((tx) => tx.financeVendorPayment.count({ where: { organizationKey: principal.organizationKey, status: "REQUESTED" } })),
  ]);

  return {
    generatedAt: new Date(),
    revenueToday: kpis.revenue.available ? kpis.revenue.data.todayRevenue : null,
    revenueThisMonth: kpis.revenue.available ? kpis.revenue.data.monthRevenue : null,
    outstandingReceivables: kpis.receivables.available ? kpis.receivables.data.totalOutstanding.toString() : null,
    outstandingPayables: kpis.payables.available ? kpis.payables.data.totalOutstanding.toString() : null,
    cashPosition: kpis.cashPosition.available ? kpis.cashPosition.data.totalCash.toString() : null,
    ordersToday: kpis.orders.available ? kpis.orders.data.ordersToday : null,
    newCustomersThisMonth: kpis.customers.available ? kpis.customers.data.newThisMonth : null,
    companyHealth: health.overall,
    activeAlertCount,
    pendingApprovalCount,
  };
}
