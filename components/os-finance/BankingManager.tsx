"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBankAccount } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type BankAccount = { id: string; code: string; name: string };
type Account = { id: string; accountCode: string; name: string };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function BankingManager({ bankAccounts, glAccounts }: { bankAccounts: BankAccount[]; glAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [linkedGlAccountId, setLinkedGlAccountId] = useState(glAccounts[0]?.id ?? "");

  async function submit() {
    setPending(true);
    const result = await createBankAccount({ code, name, linkedGlAccountId });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Bank account ${code} created`, { tone: "dark" });
    setCode(""); setName("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Bank Account</p>
        <div className="grid grid-cols-3 gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={linkedGlAccountId} onChange={(e) => setLinkedGlAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {glAccounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}
          </select>
        </div>
        <button type="button" onClick={submit} disabled={pending || !code || !name} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Bank Account</button>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Statement import, matching, and completing reconciliation are available via the underlying Business Services (banking-service.ts) — this page covers account setup; full reconciliation workspace UI is a scoping decision documented in the Milestone 8 report.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Code", "Name"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {bankAccounts.length === 0 ? <tr><td colSpan={2} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No bank accounts yet.</td></tr> :
              bankAccounts.map((b) => <tr key={b.id} style={{ borderBottom: "1px solid var(--card-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{b.code}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{b.name}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
