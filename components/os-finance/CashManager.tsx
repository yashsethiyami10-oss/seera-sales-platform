"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCashAccount, createCashVoucherDraft, approveAndPostCashVoucher } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type CashAccount = { id: string; name: string; isPettyCash: boolean; currentBalance: number; version?: number };
type Account = { id: string; accountCode: string; name: string };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function CashManager({ cashAccounts, glAccounts }: { cashAccounts: CashAccount[]; glAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState(glAccounts[0]?.accountCode ?? "");
  const [isPettyCash, setIsPettyCash] = useState(false);
  const [cashAccountId, setCashAccountId] = useState("");
  const [voucherType, setVoucherType] = useState<"RECEIPT" | "PAYMENT">("PAYMENT");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [contraAccountCode, setContraAccountCode] = useState(glAccounts[0]?.accountCode ?? "");

  async function createAccountRow() {
    setPending(true);
    const result = await createCashAccount({ name, accountCode, isPettyCash });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Cash account ${name} created`, { tone: "dark" });
    setName("");
    router.refresh();
  }

  async function createVoucher() {
    if (!cashAccountId) { showToast("Select a cash account", { tone: "dark" }); return; }
    setPending(true);
    const result = await createCashVoucherDraft({ cashAccountId, voucherType, amount, description });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    setPending(true);
    const posted = await approveAndPostCashVoucher(result.data.id, result.data.version, contraAccountCode);
    setPending(false);
    if (!posted.success) { showToast(`Voucher created but not posted: ${posted.error.message}`, { tone: "dark" }); router.refresh(); return; }
    showToast(`Cash voucher ${result.data.voucherNumber} posted`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Cash / Petty Cash Account</p>
        <div className="grid grid-cols-3 gap-2 items-center">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {glAccounts.map((a) => <option key={a.id} value={a.accountCode}>{a.accountCode} — {a.name}</option>)}
          </select>
          <label className="text-xs flex items-center gap-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}><input type="checkbox" checked={isPettyCash} onChange={(e) => setIsPettyCash(e.target.checked)} /> Petty Cash</label>
        </div>
        <button type="button" onClick={createAccountRow} disabled={pending || !name} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create</button>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Cash Voucher (Receipt / Payment)</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="">Select cash account…</option>
            {cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={voucherType} onChange={(e) => setVoucherType(e.target.value as "RECEIPT" | "PAYMENT")} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="RECEIPT">Receipt</option>
            <option value="PAYMENT">Payment</option>
          </select>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={contraAccountCode} onChange={(e) => setContraAccountCode(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {glAccounts.map((a) => <option key={a.id} value={a.accountCode}>{a.accountCode} (contra)</option>)}
          </select>
        </div>
        <button type="button" onClick={createVoucher} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create &amp; Post Voucher</button>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Name", "Type", "Balance"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {cashAccounts.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No cash accounts yet.</td></tr> :
              cashAccounts.map((c) => <tr key={c.id} style={{ borderBottom: "1px solid var(--card-border)" }}><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{c.name}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.isPettyCash ? "Petty Cash" : "Cash"}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{c.currentBalance.toLocaleString("en-IN")}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
