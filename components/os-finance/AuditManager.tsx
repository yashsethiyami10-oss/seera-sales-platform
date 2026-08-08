"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuditFinding, closeAuditFinding, reopenAuditFinding } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Finding = { id: string; findingNumber: string; area: string; severity: string; status: string; description: string; fraudRiskFlag: boolean };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function AuditManager({ findings }: { findings: Finding[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [fraudRiskFlag, setFraudRiskFlag] = useState(false);

  async function submit() {
    setPending(true);
    const result = await createAuditFinding({ area, description, severity, fraudRiskFlag });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Finding ${result.data.findingNumber} recorded`, { tone: "dark" });
    setArea(""); setDescription("");
    router.refresh();
  }
  async function close(id: string) {
    setPending(true);
    const result = await closeAuditFinding(id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Finding closed", { tone: "dark" });
    router.refresh();
  }
  async function reopen(id: string) {
    setPending(true);
    const result = await reopenAuditFinding(id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Finding reopened", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Audit Finding</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent col-span-2" style={fieldStyle} />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <label className="text-xs flex items-center gap-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}><input type="checkbox" checked={fraudRiskFlag} onChange={(e) => setFraudRiskFlag(e.target.checked)} /> Fraud-risk flag (observation only — no accusation implied)</label>
        <button type="button" onClick={submit} disabled={pending || !area || !description} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Record Finding</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Number", "Area", "Severity", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {findings.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No findings recorded.</td></tr> :
              findings.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{f.findingNumber}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.area}</td>
                  <td className="px-4 py-3" style={{ color: f.severity === "CRITICAL" || f.severity === "HIGH" ? "#ef4444" : "rgba(var(--text-rgb),0.7)" }}>{f.severity}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.status}</td>
                  <td className="px-4 py-3">
                    {f.status === "OPEN" && <button type="button" onClick={() => close(f.id)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Close</button>}
                    {f.status === "CLOSED" && <button type="button" onClick={() => reopen(f.id)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Reopen</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
