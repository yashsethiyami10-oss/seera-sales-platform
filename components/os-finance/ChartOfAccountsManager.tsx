"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAccount, activateAccount } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Account = { id: string; accountCode: string; name: string; category: string; normalBalance: string; status: string; version: number };
const CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function ChartOfAccountsManager({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("ASSET");
  const [normalBalance, setNormalBalance] = useState("DEBIT");

  async function submit() {
    setPending(true);
    const result = await createAccount({ accountCode, name, category, normalBalance });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Account ${accountCode} created (DRAFT)`, { tone: "dark" });
    setAccountCode(""); setName("");
    router.refresh();
  }

  async function activate(account: Account) {
    setPending(true);
    const result = await activateAccount(account.id, account.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Account ${account.accountCode} activated`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Account</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} placeholder="Account code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="DEBIT">DEBIT</option>
            <option value="CREDIT">CREDIT</option>
          </select>
        </div>
        <button type="button" onClick={submit} disabled={pending || !accountCode || !name} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
          {pending ? "Saving…" : "Create Account"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Code", "Name", "Category", "Normal Balance", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No accounts yet.</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{a.accountCode}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.category}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.normalBalance}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.status}</td>
                <td className="px-4 py-3">{a.status === "DRAFT" && <button type="button" onClick={() => activate(a)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Activate</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
