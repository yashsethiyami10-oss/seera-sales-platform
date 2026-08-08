import { Prisma } from "@prisma/client";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getEnterpriseKpis } from "./kpi-engine";
import { getGrowthComparison, resolveDateRange } from "@/lib/analytics";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D — Company Health Service
 * (Stage 1: a single blended signal list; Stage 2: grouped into named
 * areas — Revenue, Finance, Sales, Customer, Collection — per the
 * "Enterprise Health" deliverable). Every signal here is a plain,
 * documented, explainable business rule computed from real KPI Engine
 * output — not a trained model, not an AI-generated score (explicitly
 * no-AI, no prediction), and not a fabricated 0-100 number dressed up as
 * objective. Each signal states exactly what it measures and why its
 * threshold is what it is, matching `lib/analytics.ts`'s own RFM
 * segmentation precedent for "plain business rules, not a model."
 */

export type HealthSignalStatus = "GOOD" | "WATCH" | "AT_RISK";
export type HealthArea = "REVENUE" | "FINANCE" | "SALES" | "CUSTOMER" | "COLLECTION";
export type HealthSignal = { key: string; area: HealthArea; label: string; status: HealthSignalStatus; detail: string };

function rollUp(signals: HealthSignal[]): HealthSignalStatus {
  if (signals.some((s) => s.status === "AT_RISK")) return "AT_RISK";
  if (signals.some((s) => s.status === "WATCH")) return "WATCH";
  return "GOOD";
}

/**
 * Stage 5 performance review: accepts an optional already-fetched KPI
 * payload so composition callers that already called `getEnterpriseKpis()`
 * (`executive-summary-service.ts`, `dashboard-service.ts`) don't trigger
 * a second, fully redundant run of the KPI Engine's ~8 parallel real
 * queries just to compute Health from the same numbers a moment later.
 * Standalone callers (tests, any future direct caller) are unaffected —
 * omitting the parameter self-fetches exactly as before. The principal
 * check always runs regardless, even when KPIs are precomputed.
 */
export async function getCompanyHealth(precomputedKpis?: Awaited<ReturnType<typeof getEnterpriseKpis>>) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const kpis = precomputedKpis ?? await getEnterpriseKpis();
  const signals: HealthSignal[] = [];

  // Revenue Health: real month-over-month growth comparison, reusing
  // lib/analytics.ts's own getGrowthComparison rather than recomputing it.
  const monthRange = resolveDateRange("30d");
  try {
    const growth = await getGrowthComparison(monthRange);
    if (growth.growthPercent === null) {
      signals.push({ key: "REVENUE_TREND", area: "REVENUE", label: "Revenue trend", status: "WATCH", detail: "Not enough prior-period data for a real comparison yet." });
    } else if (growth.growthPercent >= 0) {
      signals.push({ key: "REVENUE_TREND", area: "REVENUE", label: "Revenue trend", status: "GOOD", detail: `Revenue is up ${growth.growthPercent}% vs. the prior 30 days.` });
    } else if (growth.growthPercent >= -15) {
      signals.push({ key: "REVENUE_TREND", area: "REVENUE", label: "Revenue trend", status: "WATCH", detail: `Revenue is down ${Math.abs(growth.growthPercent)}% vs. the prior 30 days.` });
    } else {
      signals.push({ key: "REVENUE_TREND", area: "REVENUE", label: "Revenue trend", status: "AT_RISK", detail: `Revenue is down ${Math.abs(growth.growthPercent)}% vs. the prior 30 days.` });
    }
  } catch (error) {
    signals.push({ key: "REVENUE_TREND", area: "REVENUE", label: "Revenue trend", status: "WATCH", detail: `Unavailable: ${error instanceof Error ? error.message : "unknown error"}` });
  }

  // Finance Health: can the current cash position cover outstanding
  // payables? A real, simple solvency proxy.
  if (kpis.cashPosition.available && kpis.payables.available) {
    const cash = kpis.cashPosition.data.totalCash;
    const owed = kpis.payables.data.totalOutstanding;
    if (owed.equals(0)) {
      signals.push({ key: "PAYABLES_COVERAGE", area: "FINANCE", label: "Cash vs. payables", status: "GOOD", detail: "No outstanding payables." });
    } else {
      const coverage = cash.dividedBy(owed);
      const status: HealthSignalStatus = coverage.greaterThanOrEqualTo(1.5) ? "GOOD" : coverage.greaterThanOrEqualTo(1) ? "WATCH" : "AT_RISK";
      signals.push({ key: "PAYABLES_COVERAGE", area: "FINANCE", label: "Cash vs. payables", status, detail: `Cash on hand (${cash.toFixed(2)}) covers ${coverage.times(100).toFixed(0)}% of outstanding payables (${owed.toFixed(2)}).` });
    }
  } else {
    signals.push({ key: "PAYABLES_COVERAGE", area: "FINANCE", label: "Cash vs. payables", status: "WATCH", detail: "Finance banking/payables data unavailable." });
  }
  if (kpis.expenses.available) {
    const pending = kpis.expenses.data.pendingApprovalCount;
    const status: HealthSignalStatus = pending === 0 ? "GOOD" : pending <= 5 ? "WATCH" : "AT_RISK";
    signals.push({ key: "EXPENSE_APPROVAL_BACKLOG", area: "FINANCE", label: "Expense approval backlog", status, detail: `${pending} expense claim(s) awaiting approval.` });
  }

  // Sales Health: real Opportunity pipeline data from the KPI Engine.
  if (kpis.salesPipeline.available) {
    const { openOpportunityCount, wonThisMonth } = kpis.salesPipeline.data;
    const status: HealthSignalStatus = wonThisMonth > 0 ? "GOOD" : openOpportunityCount > 0 ? "WATCH" : "AT_RISK";
    signals.push({ key: "SALES_PIPELINE", area: "SALES", label: "Sales pipeline activity", status, detail: `${openOpportunityCount} open opportunities; ${wonThisMonth} won this month.` });
  } else {
    signals.push({ key: "SALES_PIPELINE", area: "SALES", label: "Sales pipeline activity", status: "WATCH", detail: "Sales pipeline data unavailable." });
  }

  // Customer Health: repeat purchase rate, straight from the existing
  // Customer Intelligence calculation.
  if (kpis.customers.available) {
    const rate = kpis.customers.data.repeatPurchaseRate;
    const status: HealthSignalStatus = rate >= 30 ? "GOOD" : rate >= 15 ? "WATCH" : "AT_RISK";
    signals.push({ key: "CUSTOMER_RETENTION", area: "CUSTOMER", label: "Repeat purchase rate", status, detail: `${rate}% of paying customers have ordered more than once.` });
  }

  // Collection Health: outstanding receivables as a fraction of trailing
  // 30-day revenue — a real, simple liquidity proxy (not a textbook DSO
  // calculation, which would need historical AR balances this schema
  // doesn't snapshot; documented as a proxy, matching lib/analytics.ts's
  // own documented-proxy convention for netCashFlow/turnoverRatio) — plus
  // how much of that balance sits in the oldest aging bucket.
  if (kpis.receivables.available && kpis.revenue.available) {
    const outstanding = kpis.receivables.data.totalOutstanding;
    const monthRevenue = new Prisma.Decimal(kpis.revenue.data.monthRevenue);
    if (monthRevenue.equals(0)) {
      signals.push({ key: "RECEIVABLES_HEALTH", area: "COLLECTION", label: "Receivables vs. revenue", status: "WATCH", detail: "No revenue this month to compare against yet." });
    } else {
      const ratio = outstanding.dividedBy(monthRevenue);
      const status: HealthSignalStatus = ratio.lessThan(0.5) ? "GOOD" : ratio.lessThan(1) ? "WATCH" : "AT_RISK";
      signals.push({ key: "RECEIVABLES_HEALTH", area: "COLLECTION", label: "Receivables vs. revenue", status, detail: `Outstanding receivables (${outstanding.toFixed(2)}) are ${ratio.times(100).toFixed(0)}% of this month's revenue.` });
    }
    const oldBucket = kpis.receivables.data.buckets.DAYS_90_PLUS;
    if (outstanding.greaterThan(0)) {
      const oldRatio = oldBucket.dividedBy(outstanding);
      const status: HealthSignalStatus = oldRatio.lessThan(0.1) ? "GOOD" : oldRatio.lessThan(0.3) ? "WATCH" : "AT_RISK";
      signals.push({ key: "AGED_RECEIVABLES", area: "COLLECTION", label: "Severely aged receivables (90+ days)", status, detail: `${oldRatio.times(100).toFixed(0)}% of outstanding receivables are 90+ days overdue.` });
    }
  } else {
    signals.push({ key: "RECEIVABLES_HEALTH", area: "COLLECTION", label: "Receivables vs. revenue", status: "WATCH", detail: "Finance receivables data unavailable." });
  }

  const byArea: Record<HealthArea, { status: HealthSignalStatus; signals: HealthSignal[] }> = {
    REVENUE: { status: "GOOD", signals: [] }, FINANCE: { status: "GOOD", signals: [] }, SALES: { status: "GOOD", signals: [] },
    CUSTOMER: { status: "GOOD", signals: [] }, COLLECTION: { status: "GOOD", signals: [] },
  };
  for (const signal of signals) byArea[signal.area].signals.push(signal);
  for (const area of Object.keys(byArea) as HealthArea[]) byArea[area].status = rollUp(byArea[area].signals);

  const overall = rollUp(signals);

  return { overall, byArea, signals, asOf: new Date() };
}
