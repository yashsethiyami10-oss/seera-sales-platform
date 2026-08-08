"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJournalDraft, addJournalLine, submitJournal, approveJournal, postJournal } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Journal = { id: string; journalNumber: string; journalType: string; status: string; version: number; totalDebit: number; totalCredit: number; description: string | null };
type Account = { id: string; accountCode: string; name: string };

const JOURNAL_TYPES = ["GENERAL", "ADJUSTMENT", "OPENING_BALANCE"];
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function JournalsManager({ journals, accounts }: { journals: Journal[]; accounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [journalType, setJournalType] = useState("GENERAL");
  const [description, setDescription] = useState("");
  const [selectedJournalId, setSelectedJournalId] = useState("");
  const [lineAccountId, setLineAccountId] = useState(accounts[0]?.id ?? "");
  const [lineDebit, setLineDebit] = useState(0);
  const [lineCredit, setLineCredit] = useState(0);

  async function createDraft() {
    setPending(true);
    const now = new Date().toISOString();
    const result = await createJournalDraft({ journalType, postingDate: now, documentDate: now, description });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Journal ${result.data.journalNumber} drafted`, { tone: "dark" });
    setSelectedJournalId(result.data.id);
    router.refresh();
  }

  async function addLine() {
    const journal = journals.find((j) => j.id === selectedJournalId);
    if (!journal) { showToast("Select a draft journal first", { tone: "dark" }); return; }
    setPending(true);
    const result = await addJournalLine(selectedJournalId, journal.version, { accountId: lineAccountId, debitAmount: lineDebit, creditAmount: lineCredit });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Line added", { tone: "dark" });
    router.refresh();
  }

  async function submit(j: Journal) {
    setPending(true);
    const result = await submitJournal(j.id, j.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Submitted for approval", { tone: "dark" });
    router.refresh();
  }
  async function approve(j: Journal) {
    setPending(true);
    const result = await approveJournal(j.id, j.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Approved", { tone: "dark" });
    router.refresh();
  }
  async function post(j: Journal) {
    setPending(true);
    const result = await postJournal(j.id, j.version, `ui:${j.id}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Journal ${j.journalNumber} posted`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Journal Draft</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={journalType} onChange={(e) => setJournalType(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {JOURNAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent col-span-2" style={fieldStyle} />
        </div>
        <button type="button" onClick={createDraft} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Draft</button>

        <p className="text-sm font-medium pt-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Add Line to a Draft</p>
        <div className="grid grid-cols-4 gap-2">
          <select value={selectedJournalId} onChange={(e) => setSelectedJournalId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="">Select draft journal…</option>
            {journals.filter((j) => j.status === "DRAFT").map((j) => <option key={j.id} value={j.id}>{j.journalNumber}</option>)}
          </select>
          <select value={lineAccountId} onChange={(e) => setLineAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}
          </select>
          <input type="number" value={lineDebit} onChange={(e) => setLineDebit(Number(e.target.value))} placeholder="Debit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={lineCredit} onChange={(e) => setLineCredit(Number(e.target.value))} placeholder="Credit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={addLine} disabled={pending || !selectedJournalId} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>+ Add Line</button>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Number", "Type", "Status", "Debit", "Credit", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {journals.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No journals yet.</td></tr>
            ) : journals.map((j) => (
              <tr key={j.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{j.journalNumber}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{j.journalType}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{j.status}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{j.totalDebit.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{j.totalCredit.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 flex gap-1">
                  {j.status === "DRAFT" && <button type="button" onClick={() => submit(j)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Submit</button>}
                  {j.status === "SUBMITTED" && <button type="button" onClick={() => approve(j)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Approve</button>}
                  {j.status === "APPROVED" && <button type="button" onClick={() => post(j)} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Post</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
