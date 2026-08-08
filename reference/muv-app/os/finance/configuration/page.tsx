import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { exportChartOfAccounts, listCostCenters, listProfitCenters, listApprovalRules } from "@/actions/finance";
import { ConfigurationManager } from "@/components/os-finance/ConfigurationManager";

export default async function FinanceConfigurationPage() {
  const [accountsResult, costCentersResult, profitCentersResult, rulesResult] = await Promise.all([
    exportChartOfAccounts(), listCostCenters(), listProfitCenters(), listApprovalRules(),
  ]);
  return (
    <Workspace>
      <PageHeader title="Finance Configuration" description="Cost/Profit Centers, Approval Matrix, Expense & Asset Categories" />
      <div className="px-6 pb-10">
        {accountsResult.success && costCentersResult.success && profitCentersResult.success && rulesResult.success ? (
          <ConfigurationManager
            accounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
            costCenters={costCentersResult.data}
            profitCenters={profitCentersResult.data}
            approvalRules={rulesResult.data.map((r) => ({ id: r.id, transactionType: r.transactionType, minAmount: Number(r.minAmount), maxAmount: r.maxAmount ? Number(r.maxAmount) : null, requiredRole: r.requiredRole }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>Unable to load configuration.</p>
        )}
      </div>
    </Workspace>
  );
}
