"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDebitNoteDraft, approveDebitNote, postDebitNote } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type DebitNote = { id: string; debitNoteNumber: string; status: string; version: number; totalAmount: number; reasonCode: string };
type Account = { id: string; accountCode: string; name: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function DebitNotesManager({ debitNotes, vendorAccounts, expenseAccounts }: { debitNotes: DebitNote[]; vendorAccounts: { id: string; vendorName: string }[]; expenseAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [vendorAccountId, setVendorAccountId] = useState(vendorAccounts[0]?.id ?? "");
  const [reasonCode, setReasonCode] = useState("SHORT_SUPPLY");
  const [lineAmount, setLineAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState(expenseAccounts[0]?.id ?? "");

  async function submit() {
    setPending(true);
    const result = await createDebitNoteDraft({ vendorAccountId, reasonCode, lines: [{ description, lineAmount, accountId }] });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Debit note ${result.data.debitNoteNumber} drafted`, { tone: "dark" });
    router.refresh();
  }
  async function approve(n: DebitNote) {
    setPending(true);
    const result = await approveDebitNote(n.id, n.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Approved", { tone: "dark" });
    router.refresh();
  }
  async function post(n: DebitNote) {
    setPending(true);
    const result = await postDebitNote(n.id, n.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Debit note ${n.debitNoteNumber} posted`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Debit Note</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={vendorAccountId} onChange={(e) => setVendorAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {vendorAccounts.map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
          </select>
          <input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="Reason code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Line description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={lineAmount} onChange={(e) => setLineAmount(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode}</option>)}
          </select>
        </div>
        <button type="button" onClick={submit} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Draft</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Number", "Reason", "Amount", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {debitNotes.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No debit notes yet.</td></tr> :
              debitNotes.map((n) => (
                <tr key={n.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{n.debitNoteNumber}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{n.reasonCode}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{n.totalAmount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{n.status}</td>
                  <td className="px-4 py-3 flex gap-1">
                    {n.status === "DRAFT" && <button type="button" onClick={() => approve(n)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Approve</button>}
                    {n.status === "APPROVED" && <button type="button" onClick={() => post(n)} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Post</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
