import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listExpenseClaims } from "@/actions/finance";
import { ExpensesManager } from "@/components/os-finance/ExpensesManager";

export default async function ExpensesPage() {
  const [claimsResult, categories] = await Promise.all([
    listExpenseClaims({ pageSize: 50 }),
    prisma.financeExpenseCategory.findMany({ where: { organizationKey: "MUV", status: "ACTIVE" } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Expenses" description="Draft → Submit → Approve → Post → Reimburse" />
      <div className="px-6 pb-10">
        {!claimsResult.success ? (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{claimsResult.error.message}</p>
        ) : categories.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>No expense categories exist yet — create one via Configuration before submitting claims.</p>
        ) : (
          <ExpensesManager claims={claimsResult.data.items.map((c) => ({ id: c.id, claimNumber: c.claimNumber, status: c.status, version: c.version, totalClaimedAmount: Number(c.totalClaimedAmount) }))} categories={categories} />
        )}
      </div>
    </Workspace>
  );
}
