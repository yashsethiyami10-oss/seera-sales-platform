import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listFinanceEventLog } from "@/actions/finance";
import { ExceptionsManager } from "@/components/os-finance/ExceptionsManager";

export default async function FinanceExceptionsPage() {
  const result = await listFinanceEventLog({ pageSize: 100 });
  return (
    <Workspace>
      <PageHeader title="Unposted Events / Finance Exceptions" description="A business event produces exactly one posting or a visible, retriable exception — never disappears silently" />
      <div className="px-6 pb-10">
        {result.success ? (
          <ExceptionsManager entries={result.data.items.map((e) => ({ id: e.id, sourceModule: e.sourceModule, sourceEventAction: e.sourceEventAction, sourceRecordId: e.sourceRecordId, status: e.status, failureReason: e.failureReason, retryCount: e.retryCount }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
