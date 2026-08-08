import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listCreditNotes, exportChartOfAccounts } from "@/actions/finance";
import { CreditNotesManager } from "@/components/os-finance/CreditNotesManager";

export default async function CreditNotesPage() {
  const [notesResult, accountsResult, customerAccounts] = await Promise.all([
    listCreditNotes({ pageSize: 50 }),
    exportChartOfAccounts(),
    prisma.financeCustomerAccount.findMany({ where: { organizationKey: "MUV" }, include: { customer: { select: { name: true } } }, take: 200 }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Credit Notes" />
      <div className="px-6 pb-10">
        {notesResult.success && accountsResult.success ? (
          <CreditNotesManager
            creditNotes={notesResult.data.items.map((n) => ({ id: n.id, creditNoteNumber: n.creditNoteNumber, status: n.status, version: n.version, totalAmount: Number(n.totalAmount), reasonCode: n.reasonCode }))}
            customers={customerAccounts.map((c) => ({ id: c.id, customerId: c.customerId, customerName: c.customer.name }))}
            revenueAccounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!notesResult.success ? notesResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
