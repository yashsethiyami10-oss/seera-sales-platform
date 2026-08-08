import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listCashAccounts, exportChartOfAccounts } from "@/actions/finance";
import { CashManager } from "@/components/os-finance/CashManager";

export default async function CashPage() {
  const [cashResult, accountsResult] = await Promise.all([listCashAccounts(), exportChartOfAccounts()]);
  return (
    <Workspace>
      <PageHeader title="Cash & Petty Cash" description="Every cash voucher posts through the same journal engine as everything else" />
      <div className="px-6 pb-10">
        {cashResult.success && accountsResult.success ? (
          <CashManager
            cashAccounts={cashResult.data.map((c) => ({ id: c.id, name: c.name, isPettyCash: c.isPettyCash, currentBalance: Number(c.currentBalance) }))}
            glAccounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!cashResult.success ? cashResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
