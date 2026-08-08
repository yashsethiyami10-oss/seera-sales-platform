import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { exportChartOfAccounts } from "@/actions/finance";
import { BankingManager } from "@/components/os-finance/BankingManager";

export default async function BankingPage() {
  const [accountsResult, bankAccounts] = await Promise.all([
    exportChartOfAccounts(),
    prisma.financeBankAccount.findMany({ where: { organizationKey: "MUV" }, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Banking & Reconciliation" />
      <div className="px-6 pb-10">
        {accountsResult.success ? (
          <BankingManager bankAccounts={bankAccounts} glAccounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{accountsResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
