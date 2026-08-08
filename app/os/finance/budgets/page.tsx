import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listBudgets, exportChartOfAccounts, listFiscalPeriods } from "@/actions/finance";
import { BudgetsManager } from "@/components/os-finance/BudgetsManager";

export default async function BudgetsPage() {
  const [budgetsResult, accountsResult, periodsResult, fiscalYears] = await Promise.all([
    listBudgets({ pageSize: 50 }),
    exportChartOfAccounts(),
    listFiscalPeriods(),
    prisma.financeFiscalYear.findMany({ where: { organizationKey: "MUV" }, select: { id: true, code: true } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Budgets" description="Soft warning vs hard block, per line — configured, never hardcoded" />
      <div className="px-6 pb-10">
        {budgetsResult.success && accountsResult.success && periodsResult.success ? (
          <BudgetsManager
            budgets={budgetsResult.data.items.map((b) => ({ id: b.id, budgetNumber: b.budgetNumber, name: b.name, status: b.status, version: b.version }))}
            fiscalYears={fiscalYears}
            fiscalPeriods={periodsResult.data.map((p) => ({ id: p.id, name: p.name }))}
            accounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!budgetsResult.success ? budgetsResult.error.message : !accountsResult.success ? accountsResult.error.message : !periodsResult.success ? periodsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
