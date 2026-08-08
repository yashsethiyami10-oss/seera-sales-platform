import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listVendorBills, exportChartOfAccounts } from "@/actions/finance";
import { PayablesManager } from "@/components/os-finance/PayablesManager";

export default async function PayablesPage() {
  const [billsResult, accountsResult, vendors] = await Promise.all([
    listVendorBills({ pageSize: 50 }),
    exportChartOfAccounts(),
    prisma.enterpriseVendor.findMany({ where: { status: "ACTIVE" }, take: 200, select: { id: true, displayName: true } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Payables" description="Purchase/Vendor Bills, Vendor Payments, AP Aging" />
      <div className="px-6 pb-10">
        {billsResult.success && accountsResult.success ? (
          <PayablesManager
            bills={billsResult.data.items.map((b) => ({ id: b.id, billNumber: b.billNumber, status: b.status, totalAmount: Number(b.totalAmount), outstandingAmount: Number(b.outstandingAmount), dueDate: b.dueDate.toISOString() }))}
            vendors={vendors}
            expenseAccounts={accountsResult.data.filter((a) => a.category === "EXPENSE" && a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!billsResult.success ? billsResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
