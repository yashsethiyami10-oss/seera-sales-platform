import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listJournals, exportChartOfAccounts } from "@/actions/finance";
import { JournalsManager } from "@/components/os-finance/JournalsManager";

export default async function JournalsPage() {
  const [journalsResult, accountsResult] = await Promise.all([listJournals({ pageSize: 50 }), exportChartOfAccounts()]);
  return (
    <Workspace>
      <PageHeader title="Journals" description="Draft → Submit → Approve → Post, maker-checker enforced" />
      <div className="px-6 pb-10">
        {journalsResult.success && accountsResult.success ? (
          <JournalsManager
            journals={journalsResult.data.items.map((j) => ({ id: j.id, journalNumber: j.journalNumber, journalType: j.journalType, status: j.status, version: j.version, totalDebit: Number(j.totalDebit), totalCredit: Number(j.totalCredit), description: j.description }))}
            accounts={accountsResult.data.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, accountCode: a.accountCode, name: a.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!journalsResult.success ? journalsResult.error.message : !accountsResult.success ? accountsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
