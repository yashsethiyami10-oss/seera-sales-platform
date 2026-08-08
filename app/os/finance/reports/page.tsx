import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { prisma } from "@/lib/prisma";
import { getTrialBalance, getProfitAndLoss, getBalanceSheet, getCashFlowStatement, getFinancialKpis, getTaxReconciliation } from "@/actions/finance";

/** Milestone 8 — Formal Financial Statements. Every figure here is a pure aggregation over getTrialBalance's closing balances — no second source of truth. */
export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ periodId?: string }> }) {
  const { periodId } = await searchParams;
  const period = periodId
    ? await prisma.financeFiscalPeriod.findUnique({ where: { id: periodId } })
    : await prisma.financeFiscalPeriod.findFirst({ where: { organizationKey: "MUV", startDate: { lte: new Date() }, endDate: { gte: new Date() } } });
  const allPeriods = await prisma.financeFiscalPeriod.findMany({ where: { organizationKey: "MUV" }, orderBy: { startDate: "desc" }, take: 24 });

  if (!period) {
    return <Workspace><PageHeader title="Reports & Statements" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>No fiscal period found. Create one under Financial Calendar &amp; Periods.</p></Workspace>;
  }

  const [tb, pnl, bs, cf, kpis, taxRecon] = await Promise.all([
    getTrialBalance(period.id), getProfitAndLoss(period.id), getBalanceSheet(period.id), getCashFlowStatement(period.id), getFinancialKpis(period.id, new Date()), getTaxReconciliation(period.id),
  ]);

  const row = (label: string, value: number | undefined) => (
    <div className="flex justify-between text-sm py-1" style={{ borderBottom: "1px solid var(--card-border)" }}><span style={{ color: "rgba(var(--text-rgb),0.7)" }}>{label}</span><span style={{ color: "rgba(var(--text-rgb),0.9)" }}>₹{(value ?? 0).toLocaleString("en-IN")}</span></div>
  );

  return (
    <Workspace>
      <PageHeader title="Reports & Statements" description={`Fiscal period: ${period.name}`} />
      <div className="px-6 pb-10 space-y-6">
        <form className="flex gap-2 items-center">
          <select name="periodId" defaultValue={period.id} className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}>
            {allPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit" className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>View Period</button>
        </form>

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Trial Balance" description={tb.success ? (tb.data.balanced ? "Balanced" : "NOT BALANCED — integrity issue") : ""} />
            <div className="mt-3 max-h-80 overflow-y-auto">
              {tb.success ? tb.data.rows.map((r) => (
                <div key={r.accountId} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <span style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.accountCode} {r.accountName}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>Dr {Number(r.closingDebit).toLocaleString("en-IN")} / Cr {Number(r.closingCredit).toLocaleString("en-IN")}</span>
                </div>
              )) : <p className="text-sm" style={{ color: "#ef4444" }}>{tb.error.message}</p>}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Profit & Loss" />
            <div className="mt-3">
              {pnl.success ? <>
                {row("Total Revenue", pnl.data.totalRevenue)}
                {row("Total Expense", pnl.data.totalExpense)}
                <div className="flex justify-between text-sm py-2 font-semibold"><span>Net Profit</span><span>₹{pnl.data.netProfit.toLocaleString("en-IN")}</span></div>
              </> : <p className="text-sm" style={{ color: "#ef4444" }}>{pnl.error.message}</p>}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Balance Sheet" description={bs.success ? (bs.data.balances ? "Balances" : "DOES NOT BALANCE") : ""} />
            <div className="mt-3">
              {bs.success ? <>
                {row("Total Assets", bs.data.totalAssets)}
                {row("Total Liabilities", bs.data.totalLiabilities)}
                {row("Total Equity", bs.data.totalEquity)}
              </> : <p className="text-sm" style={{ color: "#ef4444" }}>{bs.error.message}</p>}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Cash Flow Statement" />
            <div className="mt-3">
              {cf.success ? <>
                {row("Operating", cf.data.netCashFromOperating)}
                {row("Investing", cf.data.netCashFromInvesting)}
                {row("Financing", cf.data.netCashFromFinancing)}
                <div className="flex justify-between text-sm py-2 font-semibold"><span>Net Change in Cash</span><span>₹{cf.data.netChangeInCash.toLocaleString("en-IN")}</span></div>
              </> : <p className="text-sm" style={{ color: "#ef4444" }}>{cf.error.message}</p>}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Financial KPIs" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {kpis.success ? Object.entries(kpis.data).filter(([k]) => k !== "asOfDate").map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ color: "rgba(var(--text-rgb),0.7)" }}><span>{k}</span><span>{typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}</span></div>
              )) : <p style={{ color: "#ef4444" }}>{kpis.error.message}</p>}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Tax Reconciliation" />
            <div className="mt-3">
              {taxRecon.success ? <>
                {row("Output Tax Collected", taxRecon.data.outputTaxCollected)}
                {row("Input Tax Paid", taxRecon.data.inputTaxPaid)}
                <div className="flex justify-between text-sm py-2 font-semibold"><span>Net Tax Position</span><span>₹{taxRecon.data.netTaxPosition.toLocaleString("en-IN")}</span></div>
              </> : <p className="text-sm" style={{ color: "#ef4444" }}>{taxRecon.error.message}</p>}
            </div>
          </section>
        </div>
      </div>
    </Workspace>
  );
}
