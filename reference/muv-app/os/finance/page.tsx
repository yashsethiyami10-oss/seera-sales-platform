import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { getFounderFinanceDashboard, getFinancialKpis } from "@/actions/finance";

const TILES = [
  { href: "/os/finance/accounts", label: "Chart of Accounts" },
  { href: "/os/finance/journals", label: "Journals" },
  { href: "/os/finance/receivables", label: "Receivables" },
  { href: "/os/finance/collections", label: "Collections" },
  { href: "/os/finance/payables", label: "Payables" },
  { href: "/os/finance/banking", label: "Banking & Reconciliation" },
  { href: "/os/finance/cash", label: "Cash & Petty Cash" },
  { href: "/os/finance/credit-notes", label: "Credit Notes" },
  { href: "/os/finance/debit-notes", label: "Debit Notes" },
  { href: "/os/finance/expenses", label: "Expenses" },
  { href: "/os/finance/assets", label: "Fixed Assets & Depreciation" },
  { href: "/os/finance/budgets", label: "Budgets" },
  { href: "/os/finance/costing", label: "Manufacturing Costing" },
  { href: "/os/finance/tax", label: "Tax & Compliance" },
  { href: "/os/finance/periods", label: "Financial Calendar & Periods" },
  { href: "/os/finance/audit", label: "Internal Audit" },
  { href: "/os/finance/reports", label: "Reports & Statements" },
  { href: "/os/finance/configuration", label: "Configuration" },
  { href: "/os/finance/exceptions", label: "Unposted Events / Exceptions" },
];

/**
 * Milestone 8 — Finance & Accounts. Founder CFO Dashboard: every figure
 * drills down to the report/page that produced it (Balance Sheet, P&L,
 * Reports page) — no number here is computed only for this page.
 */
export default async function FinanceDashboardPage() {
  const currentPeriod = await prisma.financeFiscalPeriod.findFirst({ where: { organizationKey: "MUV", status: "OPEN", startDate: { lte: new Date() }, endDate: { gte: new Date() } } });
  const [dashboardResult, kpiResult] = currentPeriod
    ? await Promise.all([getFounderFinanceDashboard(currentPeriod.id), getFinancialKpis(currentPeriod.id, new Date())])
    : [null, null];

  return (
    <Workspace>
      <PageHeader title="Finance" description="The Financial Operating System of MUV" />
      <div className="px-6 pb-10 space-y-6">
        {!currentPeriod && (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>No open fiscal period covers today — see Financial Calendar &amp; Periods.</p>
        )}
        {dashboardResult && !dashboardResult.success && (
          <p className="text-sm" style={{ color: "#ef4444" }}>{dashboardResult.error.message}</p>
        )}
        {dashboardResult?.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ["Revenue", `₹${dashboardResult.data.revenue.toLocaleString("en-IN")}`],
              ["Net Profit", `₹${dashboardResult.data.netProfit.toLocaleString("en-IN")}`],
              ["Cash & Bank", `₹${dashboardResult.data.cashAndBankPosition.toLocaleString("en-IN")}`],
              ["Receivables", `₹${dashboardResult.data.receivables.toLocaleString("en-IN")}`],
              ["Overdue Receivables", `₹${dashboardResult.data.overdueReceivables.toLocaleString("en-IN")}`],
              ["Payables", `₹${dashboardResult.data.payables.toLocaleString("en-IN")}`],
              ["Overdue Payables", `₹${dashboardResult.data.overduePayables.toLocaleString("en-IN")}`],
              ["Inventory Value", `₹${dashboardResult.data.inventoryValue.toLocaleString("en-IN")}`],
              ["Working Capital", `₹${dashboardResult.data.workingCapital.toLocaleString("en-IN")}`],
              ["Unposted Finance Events", dashboardResult.data.unpostedFinanceEvents],
              ["Balance Sheet Balances", dashboardResult.data.balanceSheetBalances ? "Yes" : "No"],
            ] as const).map(([label, value]) => (
              <Link key={label} href={label === "Unposted Finance Events" ? "/os/finance/exceptions" : "/os/finance/reports"} className="muv-os-card muv-os-interactive rounded-2xl p-4 block" style={{ border: "1px solid var(--card-border)" }}>
                <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{label}</p>
                <p className="text-xl font-semibold mt-1" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{value}</p>
              </Link>
            ))}
            {kpiResult?.success && (
              <>
                <div className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Gross Margin</p><p className="text-xl font-semibold mt-1">{kpiResult.data.grossMarginPercent.toFixed(1)}%</p></div>
                <div className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Net Margin</p><p className="text-xl font-semibold mt-1">{kpiResult.data.netMarginPercent.toFixed(1)}%</p></div>
                <div className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>DSO</p><p className="text-xl font-semibold mt-1">{kpiResult.data.dso?.toFixed(0) ?? "—"} days</p></div>
                <div className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Current Ratio</p><p className="text-xl font-semibold mt-1">{kpiResult.data.currentRatio?.toFixed(2) ?? "—"}</p></div>
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TILES.map((t) => (
            <Link key={t.href} href={t.href} className="muv-os-card muv-os-interactive rounded-2xl p-4 text-sm font-medium" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </Workspace>
  );
}
