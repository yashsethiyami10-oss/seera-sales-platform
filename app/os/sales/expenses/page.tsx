import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listExpenses } from "@/actions/inst-expenses";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { ExpenseForm } from "@/components/os-sales/expenses/ExpenseForm";
import { ExpenseDecision } from "@/components/os-sales/expenses/ExpenseDecision";

const STATUS_COLOR: Record<string, string> = { PENDING_MANAGER: "rgba(245,158,11,0.14)", APPROVED: "rgba(34,197,94,0.14)", REJECTED: "rgba(239,68,68,0.14)" };

export default async function ExpensesPage() {
  const result = await listExpenses({ page: 1, pageSize: 50 });
  let canApprove = false;
  try { await requirePermission(PERMISSIONS.INST_EXPENSES_APPROVE); canApprove = true; } catch { canApprove = false; }

  if (!result.success) {
    return <Workspace><PageHeader title="Expenses" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total } = result.data;

  return (
    <Workspace>
      <PageHeader title="Expenses" description={`${total} expense${total === 1 ? "" : "s"} · Module 12`} />
      <div className="px-6 mb-4"><div className="muv-os-card rounded-2xl p-3" style={{ border: "1px solid var(--card-border)" }}><ExpenseForm /></div></div>
      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Date", "Officer", "Category", "Amount", "Description", "Status", "Decision"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No expenses yet.</td></tr>
              ) : (
                items.map((ex) => (
                  <tr key={ex.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.8)" }}>{new Date(ex.expenseDate).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{ex.officer.name}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{ex.category}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{ex.amount.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{ex.description ?? "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full px-2 py-0.5 text-xs" style={{ background: STATUS_COLOR[ex.status], color: "rgba(var(--text-rgb),0.85)" }}>{ex.status.replace(/_/g, " ")}</span></td>
                    <td className="px-4 py-3">{ex.status === "PENDING_MANAGER" ? <ExpenseDecision id={ex.id} canApprove={canApprove} /> : <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>{ex.approvedBy?.name ?? "—"}</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
