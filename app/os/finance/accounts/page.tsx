import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { exportChartOfAccounts } from "@/actions/finance";
import { ChartOfAccountsManager } from "@/components/os-finance/ChartOfAccountsManager";

export default async function ChartOfAccountsPage() {
  const result = await exportChartOfAccounts();
  return (
    <Workspace>
      <PageHeader title="Chart of Accounts" description="Account codes are organization-configured — never hardcoded" />
      <div className="px-6 pb-10">
        {result.success ? (
          <ChartOfAccountsManager accounts={result.data.map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name, category: a.category, normalBalance: a.normalBalance, status: a.status, version: a.version }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
