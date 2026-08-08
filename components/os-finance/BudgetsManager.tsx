"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBudgetDraft, approveBudget, syncBudgetActuals } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Budget = { id: string; budgetNumber: string; name: string; status: string; version: number };
type FiscalYear = { id: string; code: string };
type FiscalPeriod = { id: string; name: string };
type Account = { id: string; accountCode: string; name: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function BudgetsManager({ budgets, fiscalYears, fiscalPeriods, accounts }: { budgets: Budget[]; fiscalYears: FiscalYear[]; fiscalPeriods: FiscalPeriod[]; accounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [fiscalYearId, setFiscalYearId] = useState(fiscalYears[0]?.id ?? "");
  const [name, setName] = useState("");
  const [fiscalPeriodId, setFiscalPeriodId] = useState(fiscalPeriods[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [budgetedAmount, setBudgetedAmount] = useState(0);
  const [hardBlock, setHardBlock] = useState(false);

  async function submit() {
    setPending(true);
    const result = await createBudgetDraft({ fiscalYearId, name, lines: [{ fiscalPeriodId, accountId, budgetedAmount, hardBlock }] });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Budget ${result.data.budgetNumber} drafted`, { tone: "dark" });
    router.refresh();
  }
  async function approve(b: Budget) {
    setPending(true);
    const result = await approveBudget(b.id, b.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Budget approved and active", { tone: "dark" });
    router.refresh();
  }
  async function sync(b: Budget) {
    setPending(true);
    const result = await syncBudgetActuals(b.id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Actuals synced from GL", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Budget</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={fiscalYearId} onChange={(e) => setFiscalYearId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {fiscalYears.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Budget name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={fiscalPeriodId} onChange={(e) => setFiscalPeriodId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {fiscalPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}
          </select>
          <input type="number" value={budgetedAmount} onChange={(e) => setBudgetedAmount(Number(e.target.value))} placeholder="Budgeted amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <label className="text-xs flex items-center gap-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}><input type="checkbox" checked={hardBlock} onChange={(e) => setHardBlock(e.target.checked)} /> Hard block when exceeded (otherwise soft warning only)</label>
        <button type="button" onClick={submit} disabled={pending || !name} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Draft</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Number", "Name", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {budgets.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No budgets yet.</td></tr> :
              budgets.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{b.budgetNumber}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{b.name}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{b.status}</td>
                  <td className="px-4 py-3 flex gap-1">
                    {b.status === "DRAFT" && <button type="button" onClick={() => approve(b)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Approve</button>}
                    {b.status === "ACTIVE" && <button type="button" onClick={() => sync(b)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Sync Actuals</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
