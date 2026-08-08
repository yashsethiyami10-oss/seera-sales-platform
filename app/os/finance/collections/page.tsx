import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listCollectionCases } from "@/actions/finance";
import { CollectionsManager } from "@/components/os-finance/CollectionsManager";

export default async function CollectionsPage() {
  const [casesResult, customerAccounts] = await Promise.all([
    listCollectionCases({ pageSize: 50 }),
    prisma.financeCustomerAccount.findMany({ where: { organizationKey: "MUV" }, include: { customer: { select: { name: true } } }, take: 200 }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Collections" description="Outstanding Invoice → Reminder → Follow-up → Promise to Pay → Escalation → Dispute → Final Notice → Write-off" />
      <div className="px-6 pb-10">
        {casesResult.success ? (
          <CollectionsManager cases={casesResult.data.items.map((c) => ({ id: c.id, caseNumber: c.caseNumber, status: c.status, priority: c.priority, agingBucket: c.agingBucket }))} customerAccounts={customerAccounts.map((c) => ({ id: c.id, customerName: c.customer.name }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{casesResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
