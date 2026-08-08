"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openCollectionCase, recordCollectionActivity } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Case = { id: string; caseNumber: string; status: string; priority: string; agingBucket: string | null };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const ACTIVITY_TYPES = ["REMINDER", "FOLLOWUP", "PROMISE_TO_PAY", "NOTE", "ESCALATION", "DISPUTE_RAISED"];

export function CollectionsManager({ cases, customerAccounts }: { cases: Case[]; customerAccounts: { id: string; customerName: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [customerAccountId, setCustomerAccountId] = useState(customerAccounts[0]?.id ?? "");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [activityType, setActivityType] = useState("REMINDER");
  const [notes, setNotes] = useState("");

  async function openCase() {
    setPending(true);
    const result = await openCollectionCase({ customerAccountId });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Case ${result.data.caseNumber} opened`, { tone: "dark" });
    router.refresh();
  }
  async function addActivity() {
    if (!selectedCaseId) { showToast("Select a case", { tone: "dark" }); return; }
    setPending(true);
    const result = await recordCollectionActivity(selectedCaseId, { activityType, notes });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Activity recorded", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Open Collection Case</p>
        <div className="flex gap-2">
          <select value={customerAccountId} onChange={(e) => setCustomerAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle}>
            {customerAccounts.map((c) => <option key={c.id} value={c.id}>{c.customerName}</option>)}
          </select>
          <button type="button" onClick={openCase} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Open Case</button>
        </div>
      </div>
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Record Activity</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            <option value="">Select case…</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
          </select>
          <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={addActivity} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Record</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Case #", "Status", "Priority", "Aging"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {cases.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No collection cases yet.</td></tr> :
              cases.map((c) => <tr key={c.id} style={{ borderBottom: "1px solid var(--card-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{c.caseNumber}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.status}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.priority}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.agingBucket ?? "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Write-off request/approval (requestWriteOff/approveWriteOff) is available via the underlying Business Service; not wired into this page's UI this pass.</p>
    </div>
  );
}
