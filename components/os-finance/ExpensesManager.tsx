"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExpenseClaimDraft, submitExpenseClaim, postApprovedExpenseClaim, reimburseExpenseClaim } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Claim = { id: string; claimNumber: string; status: string; version: number; totalClaimedAmount: number };
type Category = { id: string; code: string; name: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function ExpensesManager({ claims, categories }: { claims: Claim[]; categories: Category[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [claimedAmount, setClaimedAmount] = useState(0);

  async function submit() {
    setPending(true);
    const result = await createExpenseClaimDraft({ lines: [{ categoryId, description, expenseDate: new Date().toISOString(), claimedAmount }] });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Expense claim ${result.data.claimNumber} drafted`, { tone: "dark" });
    router.refresh();
  }
  async function submitForApproval(c: Claim) {
    setPending(true);
    const result = await submitExpenseClaim(c.id, c.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Submitted for approval", { tone: "dark" });
    router.refresh();
  }
  async function post(c: Claim) {
    setPending(true);
    const result = await postApprovedExpenseClaim(c.id, c.version, `ui:expense:${c.id}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Posted", { tone: "dark" });
    router.refresh();
  }
  async function reimburse(c: Claim) {
    setPending(true);
    const result = await reimburseExpenseClaim(c.id, c.version, `ui:reimburse:${c.id}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Reimbursed", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Expense Claim</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={claimedAmount} onChange={(e) => setClaimedAmount(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={submit} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Draft</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Claim #", "Amount", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {claims.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No expense claims yet.</td></tr> :
              claims.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{c.claimNumber}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{c.totalClaimedAmount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.status}</td>
                  <td className="px-4 py-3 flex gap-1">
                    {c.status === "DRAFT" && <button type="button" onClick={() => submitForApproval(c)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Submit</button>}
                    {c.status === "APPROVED" && <button type="button" onClick={() => post(c)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Post</button>}
                    {c.status === "POSTED" && <button type="button" onClick={() => reimburse(c)} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Reimburse</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Line-item approval (approveExpenseClaim, per-line approved amounts) is available via the underlying Business Service; this page's Submit/Post/Reimburse cover the primary lifecycle.</p>
    </div>
  );
}
