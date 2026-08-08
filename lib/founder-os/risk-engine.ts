import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { ALERT_THRESHOLDS } from "./domain";
import { upsertAlert } from "./alert-store";
import { getGrowthComparison, getCustomerGrowth, resolveDateRange } from "@/lib/analytics";
import { getReceivablesAging } from "@/lib/enterprise-finance/ar-service";
import { getEnterpriseKpis } from "./kpi-engine";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Risk Engine.
 * Rule-based only, exactly as scoped: no prediction, no trained model,
 * every detector is a fixed percentage threshold (`domain.ts`'s
 * `ALERT_THRESHOLDS`) applied to a real comparison already computed by an
 * existing function — `getGrowthComparison` (Comparison Engine / frozen
 * `lib/analytics.ts`), `getCustomerGrowth` (frozen `lib/analytics.ts`),
 * or `getReceivablesAging` (frozen Part 3C). Writes into the same
 * `FounderAlert` table the Alert Engine uses, through the same
 * `upsertAlert` dedup logic (`alert-store.ts`) — no parallel "risk" table,
 * no duplicated create/dedupe logic.
 */

async function safeRisk<T>(fn: () => Promise<T[]>): Promise<{ results: T[]; error?: string }> {
  try {
    return { results: await fn() };
  } catch (error) {
    return { results: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function runRiskDetection() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ALERTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const sections = await Promise.all([
      safeRisk(async () => {
        const range = resolveDateRange("7d");
        const growth = await getGrowthComparison(range);
        if (growth.growthPercent === null || growth.growthPercent > -ALERT_THRESHOLDS.revenueDropPercent) return [];
        return [await upsertAlert(tx, principal.organizationKey, {
          alertType: "REVENUE_DROP", severity: growth.growthPercent <= -40 ? "CRITICAL" : "WARNING",
          title: `Revenue down ${Math.abs(growth.growthPercent)}% vs. the prior 7 days`,
          description: `Revenue this week (${growth.currentTotal}) is down ${Math.abs(growth.growthPercent)}% from the prior 7 days (${growth.previousTotal}).`,
          sourceModule: "RISK_ENGINE", metadata: { growthPercent: growth.growthPercent, currentTotal: growth.currentTotal, previousTotal: growth.previousTotal },
        })];
      }),
      safeRisk(async () => {
        const kpis = await getEnterpriseKpis();
        if (!kpis.expenses.available) return [];
        // Compares this month's approved-expense total against last
        // month's, computed the same way as Comparison Engine's
        // MONTH_VS_MONTH — via two direct, real, read-only aggregates
        // (no equivalent Business Service exists to call for a prior
        // month's expense total, so this is a new, narrowly-scoped read,
        // not a duplicate of one).
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthTotal = await prisma.financeExpenseClaim.aggregate({
          where: { organizationKey: principal.organizationKey, status: { in: ["POSTED", "REIMBURSED"] }, postedAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
          _sum: { totalApprovedAmount: true },
        });
        const thisMonthTotal = await prisma.financeExpenseClaim.aggregate({
          where: { organizationKey: principal.organizationKey, status: { in: ["POSTED", "REIMBURSED"] }, postedAt: { gte: startOfThisMonth } },
          _sum: { totalApprovedAmount: true },
        });
        const last = lastMonthTotal._sum.totalApprovedAmount;
        const current = thisMonthTotal._sum.totalApprovedAmount;
        if (!last || last.equals(0) || !current) return [];
        const increasePercent = current.minus(last).dividedBy(last).times(100);
        if (increasePercent.lessThan(ALERT_THRESHOLDS.expenseSpikePercent)) return [];
        return [await upsertAlert(tx, principal.organizationKey, {
          alertType: "EXPENSE_SPIKE", severity: increasePercent.greaterThanOrEqualTo(75) ? "CRITICAL" : "WARNING",
          title: `Expenses up ${increasePercent.toFixed(0)}% this month`,
          description: `Approved expenses this month (${current.toFixed(2)}) are up ${increasePercent.toFixed(0)}% from last month (${last.toFixed(2)}).`,
          sourceModule: "RISK_ENGINE", metadata: { increasePercent: increasePercent.toString(), current: current.toString(), last: last.toString() },
        })];
      }),
      safeRisk(async () => {
        const aging = await getReceivablesAging(new Date());
        if (aging.rows.length === 0) return [];
        const averageDays = aging.rows.reduce((sum, row) => sum + Math.max(row.daysOverdue, 0), 0) / aging.rows.length;
        if (averageDays < ALERT_THRESHOLDS.collectionDelayAverageDays) return [];
        return [await upsertAlert(tx, principal.organizationKey, {
          alertType: "COLLECTION_DELAY", severity: averageDays >= 75 ? "CRITICAL" : "WARNING",
          title: `Average receivable is ${Math.round(averageDays)} days overdue`,
          description: `Across ${aging.rows.length} open invoice(s), the average days-overdue is ${Math.round(averageDays)}, above the ${ALERT_THRESHOLDS.collectionDelayAverageDays}-day threshold.`,
          sourceModule: "RISK_ENGINE", metadata: { averageDays: Math.round(averageDays), openInvoiceCount: aging.rows.length },
        })];
      }),
      safeRisk(async () => {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const [thisMonth, lastMonth, growth] = await Promise.all([
          prisma.customer.count({ where: { createdAt: { gte: startOfThisMonth } } }),
          prisma.customer.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
          getCustomerGrowth(),
        ]);
        if (lastMonth === 0) return [];
        const declinePercent = ((lastMonth - thisMonth) / lastMonth) * 100;
        if (declinePercent < ALERT_THRESHOLDS.customerDeclinePercent) return [];
        return [await upsertAlert(tx, principal.organizationKey, {
          alertType: "CUSTOMER_DECLINE", severity: declinePercent >= 60 ? "CRITICAL" : "WARNING",
          title: `New customers down ${Math.round(declinePercent)}% this month`,
          description: `${thisMonth} new customer(s) this month vs. ${lastMonth} last month — a ${Math.round(declinePercent)}% decline. Repeat purchase rate is currently ${growth.repeatPurchaseRate}%.`,
          sourceModule: "RISK_ENGINE", metadata: { thisMonth, lastMonth, declinePercent: Math.round(declinePercent) },
        })];
      }),
    ]);

    // Business Anomaly: a composite, not an independent detector — fires
    // only when at least two of the four specific risks above already
    // fired together, a real (if simple) correlation signal rather than
    // a fifth independent threshold. Genuinely rule-based: "how many of
    // the other four real detectors tripped," nothing inferred.
    const concurrentRiskCount = sections.filter((s) => s.results.length > 0).length;
    let anomaly: Awaited<ReturnType<typeof upsertAlert>> | null = null;
    if (concurrentRiskCount >= 2) {
      anomaly = await upsertAlert(tx, principal.organizationKey, {
        alertType: "BUSINESS_ANOMALY", severity: concurrentRiskCount >= 3 ? "CRITICAL" : "WARNING",
        title: `${concurrentRiskCount} risk signals active at once`,
        description: `${concurrentRiskCount} of the Risk Engine's independent detectors are currently active together — worth a combined look, not just each in isolation.`,
        sourceModule: "RISK_ENGINE", metadata: { concurrentRiskCount },
      });
    }

    const all = sections.flatMap((s) => s.results);
    if (anomaly) all.push(anomaly);
    const failures = sections.map((s, i) => ({ index: i, error: s.error })).filter((s) => s.error);
    return { checked: sections.length, created: all.filter((r) => r.created).length, failures };
  });
}
