import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Explainability.
 * For every metric Founder OS surfaces: where the number comes from, how
 * it's calculated (in plain language, matching this codebase's own doc
 * comments — never "AI-generated," since Stage 2 is explicitly no-AI),
 * what it depends on, and which systems contributed. This is a static,
 * hand-written registry — the honest alternative to a dynamically
 * "explained" number Founder OS cannot actually trace automatically yet.
 */

export type MetricExplanation = {
  metricKey: string;
  label: string;
  source: string;
  calculation: string;
  dependencies: string[];
  contributingSystems: string[];
};

const METRIC_REGISTRY: Record<string, MetricExplanation> = {
  REVENUE_TODAY: {
    metricKey: "REVENUE_TODAY", label: "Revenue (Today)",
    source: "lib/analytics.ts getRevenueKPIs()",
    calculation: "SUM(Order.total) WHERE paymentStatus = PAID AND createdAt >= start of today.",
    dependencies: ["Order", "Order.paymentStatus", "Order.total"],
    contributingSystems: ["Storefront Orders (Phase 5)"],
  },
  OUTSTANDING_RECEIVABLES: {
    metricKey: "OUTSTANDING_RECEIVABLES", label: "Outstanding Receivables",
    source: "lib/enterprise-finance/ar-service.ts getReceivablesAging()",
    calculation: "SUM(FinanceReceivableInvoice.outstandingAmount) for invoices in ISSUED/PARTIALLY_PAID/OVERDUE status, bucketed by days overdue as of the given date.",
    dependencies: ["FinanceReceivableInvoice", "FinanceReceivableInvoice.outstandingAmount", "FinanceReceivableInvoice.dueDate"],
    contributingSystems: ["Enterprise Finance Platform, Part 3C (frozen) — Accounts Receivable"],
  },
  OUTSTANDING_PAYABLES: {
    metricKey: "OUTSTANDING_PAYABLES", label: "Outstanding Payables",
    source: "lib/enterprise-finance/ap-service.ts getPayablesAging()",
    calculation: "SUM(FinanceVendorBill.outstandingAmount) for bills in POSTED/PARTIALLY_PAID/OVERDUE status, bucketed by days overdue as of the given date.",
    dependencies: ["FinanceVendorBill", "FinanceVendorBill.outstandingAmount", "FinanceVendorBill.dueDate"],
    contributingSystems: ["Enterprise Finance Platform, Part 3C (frozen) — Accounts Payable"],
  },
  CASH_POSITION: {
    metricKey: "CASH_POSITION", label: "Cash Position",
    source: "lib/enterprise-finance/banking-service.ts getBankPosition(), summed across every active bank account",
    calculation: "For each active FinanceBankAccount: SUM(FinanceLedgerEntry.debitAmount - creditAmount) against its linked GL account, as of the given date. Summed across accounts.",
    dependencies: ["FinanceBankAccount", "FinanceLedgerEntry", "FinanceAccount"],
    contributingSystems: ["Enterprise Finance Platform, Part 3C (frozen) — Banking Foundation, General Ledger"],
  },
  EXPENSES_APPROVED: {
    metricKey: "EXPENSES_APPROVED", label: "Approved Expenses",
    source: "lib/founder-os/kpi-engine.ts getExpenseTotals() — a direct, read-only aggregate (no equivalent Part 3C Business Service exists yet)",
    calculation: "SUM(FinanceExpenseClaim.totalApprovedAmount) WHERE status IN (POSTED, REIMBURSED).",
    dependencies: ["FinanceExpenseClaim", "FinanceExpenseClaim.totalApprovedAmount", "FinanceExpenseClaim.status"],
    contributingSystems: ["Enterprise Finance Platform, Part 3C (frozen) — Expense Management"],
  },
  SALES_PIPELINE: {
    metricKey: "SALES_PIPELINE", label: "Sales Pipeline",
    source: "lib/founder-os/kpi-engine.ts getSalesPipelineSummary() — a direct, read-only aggregate (no CRM aggregation function exists to call instead)",
    calculation: "COUNT/SUM(Opportunity.estimatedValue) WHERE status = ACTIVE; COUNT WHERE status = CLOSED_WON AND closedAt is this calendar month.",
    dependencies: ["Opportunity", "Opportunity.status", "Opportunity.estimatedValue", "Opportunity.closedAt"],
    contributingSystems: ["Sales Architecture v1 — CRM/Opportunities"],
  },
  COMPANY_HEALTH: {
    metricKey: "COMPANY_HEALTH", label: "Company Health (overall)",
    source: "lib/founder-os/company-health-service.ts getCompanyHealth()",
    calculation: "A fixed rule per area (Revenue trend threshold, cash-vs-payables coverage ratio, pipeline activity, repeat-purchase rate, receivables-vs-revenue ratio, aged-receivables ratio) rolled up to GOOD/WATCH/AT_RISK per area, then to one overall status (worst area wins). No trained model, no AI.",
    dependencies: ["Every KPI Engine section"],
    contributingSystems: ["Founder OS KPI Engine", "Enterprise Finance Platform, Part 3C (frozen)", "lib/analytics.ts, Phase 15 (frozen)"],
  },
  RISK_SIGNALS: {
    metricKey: "RISK_SIGNALS", label: "Active Risk Signals",
    source: "lib/founder-os/risk-engine.ts runRiskDetection()",
    calculation: "Five fixed-threshold rule checks (revenue drop %, expense spike %, average collection delay days, new-customer decline %, and a composite 'business anomaly' when 2+ of the other four are active together). Rule-based only — no prediction.",
    dependencies: ["getGrowthComparison", "getCustomerGrowth", "getReceivablesAging", "FinanceExpenseClaim"],
    contributingSystems: ["Founder OS Risk Engine", "lib/analytics.ts, Phase 15 (frozen)", "Enterprise Finance Platform, Part 3C (frozen)"],
  },
};

/** Part 3D, Stage 4 — the single authoritative list of metric keys a
 * Saved Report is allowed to reference. Derived directly from this
 * registry's own keys (never a second, hand-maintained list that could
 * drift) — a metric can be reported on if and only if it can be
 * explained. "Profit" has no entry above (no authoritative computation
 * exists anywhere in this codebase — see Stage 2's own documented
 * limitation), so it is structurally impossible for a Saved Report to
 * request it; nothing needs to special-case rejecting it. */
export const SUPPORTED_REPORT_METRICS = Object.keys(METRIC_REGISTRY) as [string, ...string[]];

export async function explainMetric(metricKey: string) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const explanation = METRIC_REGISTRY[metricKey];
  if (!explanation) return null;
  return { ...explanation, updatedAt: new Date() };
}

export async function listExplainableMetrics() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return Object.values(METRIC_REGISTRY);
}
