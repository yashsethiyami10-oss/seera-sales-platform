import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listDebitNotes, exportChartOfAccounts } from "@/actions/finance";
import { DebitNotesManager } from "@/components/os-finance/DebitNotesManager";

export default async function DebitNotesPage() {
  const [notesResult, accountsResult, vendorAccounts] = await Promise.all([
    listDebitNotes({ pageSize: 50 }),
    exportChartOfAccounts(),
    prisma.financeVendorAccount.findMany({ where: { organizationKey: "MUV" }, include: { vendor: { select: { displayName: true } } }, take: 200 }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Debit Notes" />
      <div className="px-6 pb-10">
        {notesResult.success && accountsResult.success ? (
          <DebitNotesManager
            debitNotes={notesResult.data.items.map((n) => ({ id: n.id, debitNoteNumber: n.debitNoteNumber, status: n.status, version: n.version, totalAmount: Number(n.totalAmount), reasonCode: n.reasonCode }))}
            vendorAccounts={vendorAccounts.map((v) => ({ id: v.id, vendorName: v.vendor.displayName }))}
            expenseAccounts={accountsResult.data.filter((a) => a.category === "EXPENSE" && a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!notesResult.success ? notesResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
