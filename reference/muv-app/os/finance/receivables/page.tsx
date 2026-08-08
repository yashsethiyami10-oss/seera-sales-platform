import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listReceivableInvoices, exportChartOfAccounts } from "@/actions/finance";
import { ReceivablesManager } from "@/components/os-finance/ReceivablesManager";

export default async function ReceivablesPage() {
  const [invoicesResult, accountsResult, customers] = await Promise.all([
    listReceivableInvoices({ pageSize: 50 }),
    exportChartOfAccounts(),
    prisma.customer.findMany({ where: { active: true }, take: 200, select: { id: true, name: true } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Receivables" description="Sales Invoices, Customer Receipts, AR Aging" />
      <div className="px-6 pb-10">
        {invoicesResult.success && accountsResult.success ? (
          <ReceivablesManager
            invoices={invoicesResult.data.items.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, status: i.status, totalAmount: Number(i.totalAmount), outstandingAmount: Number(i.outstandingAmount), dueDate: i.dueDate.toISOString() }))}
            customers={customers}
            revenueAccounts={accountsResult.data.filter((a) => a.category === "REVENUE" && a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!invoicesResult.success ? invoicesResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
