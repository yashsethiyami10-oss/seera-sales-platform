import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getRevenueKPIs, getOrderStatusKPIs, getCustomerGrowth } from "@/lib/analytics";
import { getReceivablesAging } from "@/lib/enterprise-finance/ar-service";
import { getPayablesAging } from "@/lib/enterprise-finance/ap-service";
import { getBankPosition } from "@/lib/enterprise-finance/banking-service";
import { getOperationalDashboard } from "@/lib/enterprise/planning-reporting";
import { getFounderSupportDashboard } from "@/lib/support/founder-integration-service";
import { getFounderDashboard as getInstitutionalFounderDashboard } from "@/actions/inst-dashboards";
import { requireNetworkPrincipal } from "@/lib/enterprise-network/context";
import { getOpportunityDashboard } from "@/lib/opportunity/reporting";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Enterprise KPI
 * Engine. This module computes nothing itself — every number here comes
 * from an existing, already-governed calculation:
 *  - Revenue/Orders/Customers: `lib/analytics.ts`, the frozen Phase 15
 *    Founder Dashboard/BI layer. Called directly, unmodified.
 *  - Outstanding Receivables/Payables/Cash Position: the frozen Part 3C
 *    Finance Platform's own reporting Business Services
 *    (`getReceivablesAging`, `getPayablesAging`, `getBankPosition`).
 *    Each of those functions still enforces its own permission and
 *    `ENTERPRISE_FINANCIAL_REPORTING_ENABLED` feature-flag check on
 *    whichever real user is calling through here — Founder OS does not,
 *    and structurally cannot, bypass that gate; a Founder always passes
 *    it via the same `isFounder` bypass every other Enterprise module
 *    uses, so this composes correctly rather than weakening anything.
 *  - Expense totals: a direct, read-only Prisma aggregate over
 *    `FinanceExpenseClaim` (no equivalent Business Service function
 *    exists yet in Part 3C to call instead — this is a new read, not a
 *    duplicate of an existing one, and never writes).
 *
 * Every external call is individually try/caught so one disabled flag or
 * one missing permission degrades that section to `unavailable` rather
 * than failing the entire dashboard fetch — Founder OS orchestrates
 * independently-gated subsystems, and a partial dashboard is more useful
 * than none.
 */

type KpiSection<T> = { available: true; data: T } | { available: false; reason: string };

async function safe<T>(fn: () => Promise<T>): Promise<KpiSection<T>> {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getEnterpriseKpis() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const asOfDate = new Date();

  const [
    revenue, orders, customers, receivables, payables, cashPosition, expenses, salesPipeline,
    manufacturingWarehouse, institutional, customerSupport, network,
  ] = await Promise.all([
    safe(() => getRevenueKPIs()),
    safe(() => getOrderStatusKPIs()),
    safe(() => getCustomerGrowth()),
    safe(async () => {
      const aging = await getReceivablesAging(asOfDate);
      const total = Object.values(aging.buckets).reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
      return { asOfDate, buckets: aging.buckets, totalOutstanding: total, openInvoiceCount: aging.rows.length };
    }),
    safe(async () => {
      const aging = await getPayablesAging(asOfDate);
      const total = Object.values(aging.buckets).reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
      return { asOfDate, buckets: aging.buckets, totalOutstanding: total, openBillCount: aging.rows.length };
    }),
    safe(() => getCashPosition(asOfDate)),
    safe(() => getExpenseTotals()),
    safe(() => getSalesPipelineSummary()),
    // Block 3, Part C — Founder visibility. Each of the four sections below
    // reuses an existing, already-permission-gated service function that
    // simply was never wired into Founder OS before (Block 2's Part C/F
    // finding: Founder OS had zero read coverage of Warehouse, Manufacturing,
    // Institutional, Customer Support, or Network). None of these add a new
    // Prisma query pattern of their own — the Founder principal already
    // resolved by requireFounderOsPrincipal() above bypasses each function's
    // own nested permission check exactly as it does for every section
    // above, so no permission is weakened or duplicated to grant this.
    safe(() => getOperationalDashboard()), // Manufacturing OS + Warehouse OS combined
    safe(async () => {
      const result = await getInstitutionalFounderDashboard();
      if (!result.success) throw new Error(result.error?.message ?? "Institutional dashboard unavailable");
      return result.data;
    }),
    safe(() => getFounderSupportDashboard()),
    safe(() => getNetworkSummary()),
  ]);

  return {
    asOfDate, revenue, orders, customers, receivables, payables, cashPosition, expenses, salesPipeline,
    manufacturingWarehouse, institutional, customerSupport, network,
  };
}

/** Block 3, Part C. No dedicated top-level "network summary" Business
 * Service exists yet (lib/enterprise-network/integration-service.ts's
 * getNetworkPerformanceReport is a paginated per-partner detail report,
 * not a founder-KPI-shaped aggregate) — mirrors this file's own established
 * pattern (see getExpenseTotals/getSalesPipelineSummary) of a small,
 * documented, read-only aggregate for the one section with no existing
 * summary function to call instead. Gated the same way every other
 * Network OS entry point is (requireNetworkPrincipal), so a Founder passes
 * via the same isFounder bypass every other section already relies on. */
async function getNetworkSummary() {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_ANALYTICS_VIEW);
  const [partnersByStatus, agreementsByStatus, claimsByStatus] = await Promise.all([
    prisma.networkPartner.groupBy({ by: ["lifecycleStatus"], where: { organizationKey: principal.organizationKey }, _count: true }),
    prisma.networkAgreement.groupBy({ by: ["status"], where: { organizationKey: principal.organizationKey }, _count: true }),
    prisma.networkClaim.groupBy({ by: ["status"], where: { organizationKey: principal.organizationKey }, _count: true, _sum: { amount: true } }),
  ]);
  return {
    partnersByStatus: Object.fromEntries(partnersByStatus.map((row) => [row.lifecycleStatus, row._count])),
    agreementsByStatus: Object.fromEntries(agreementsByStatus.map((row) => [row.status, row._count])),
    claimsByStatus: Object.fromEntries(claimsByStatus.map((row) => [row.status, { count: row._count, amount: row._sum.amount ?? new Prisma.Decimal(0) }])),
  };
}

/** Sums `getBankPosition` (Part 3C's own function, called once per active
 * bank account — not reimplemented) across every active bank account,
 * rather than querying the ledger directly a second way. */
async function getCashPosition(asOfDate: Date) {
  const accounts = await prisma.financeBankAccount.findMany({
    where: { organizationKey: "MUV", status: "ACTIVE" },
    select: { id: true, code: true, name: true },
  });
  if (accounts.length === 0) return { totalCash: new Prisma.Decimal(0), byAccount: [] as Array<{ bankAccountId: string; code: string; name: string; balance: Prisma.Decimal }> };
  const positions = await Promise.all(accounts.map((account) => getBankPosition(account.id, asOfDate)));
  const totalCash = positions.reduce((sum, p) => sum.plus(p.balance), new Prisma.Decimal(0));
  return {
    totalCash,
    byAccount: accounts.map((account, index) => ({ bankAccountId: account.id, code: account.code, name: account.name, balance: positions[index]!.balance })),
  };
}

/** No equivalent Business Service exists in Part 3C for "total posted
 * expenses" — this is a new, read-only aggregate, not a duplicate of one.
 * Measures posted+reimbursed claims' approved amount, not a full P&L
 * expense line (this schema's expense claims are the only expense
 * source Part 3C models). */
async function getExpenseTotals() {
  const result = await prisma.financeExpenseClaim.aggregate({
    where: { organizationKey: "MUV", status: { in: ["POSTED", "REIMBURSED"] } },
    _sum: { totalApprovedAmount: true },
    _count: { id: true },
  });
  const pendingApproval = await prisma.financeExpenseClaim.count({ where: { organizationKey: "MUV", status: "SUBMITTED" } });
  return {
    totalApprovedExpenses: result._sum.totalApprovedAmount ?? new Prisma.Decimal(0),
    postedClaimCount: result._count.id,
    pendingApprovalCount: pendingApproval,
  };
}

/** Block 3, Part E fix (Block 2 HIGH-severity finding): this used to
 * independently re-query `prisma.opportunity` with a near-identical shape
 * to CRM Core's own `getOpportunityDashboard` (lib/opportunity/reporting.ts)
 * — WITHOUT that function's `opportunityScope()` filter, a real
 * duplication risk since the two queries could silently diverge. Now
 * calls the real CRM Core reporting function directly. Behavior for the
 * Founder caller is unchanged: `opportunityScope()` already returns `{}`
 * (unrestricted) for a Founder principal, exactly matching what the old
 * unscoped query computed — this is a duplication fix, not a data change. */
async function getSalesPipelineSummary() {
  const dashboard = await getOpportunityDashboard();
  return {
    openOpportunityCount: dashboard.openOpportunities,
    openPipelineValue: dashboard.pipelineValue,
    wonThisMonth: dashboard.wonThisMonth,
  };
}
