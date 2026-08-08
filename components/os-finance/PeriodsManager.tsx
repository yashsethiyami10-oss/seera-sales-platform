"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softClosePeriod, hardClosePeriod, reopenPeriod, addHoliday } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Period = { id: string; name: string; status: string; version: number };
type Holiday = { id: string; name: string; date: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function PeriodsManager({ periods, holidays, currentUserId }: { periods: Period[]; holidays: Holiday[]; currentUserId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  async function softClose(p: Period) {
    setPending(true);
    const result = await softClosePeriod(p.id, p.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`${p.name} soft-closed`, { tone: "dark" });
    router.refresh();
  }
  async function hardClose(p: Period) {
    setPending(true);
    const result = await hardClosePeriod(p.id, p.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`${p.name} hard-closed`, { tone: "dark" });
    router.refresh();
  }
  async function reopen(p: Period) {
    if (reopenReason.trim().length < 3) { showToast("A reason (min 3 characters) is required to reopen a period", { tone: "dark" }); return; }
    setPending(true);
    const result = await reopenPeriod(p.id, p.version, currentUserId, reopenReason);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`${p.name} reopened`, { tone: "dark" });
    router.refresh();
  }
  async function addHolidayRow() {
    setPending(true);
    const result = await addHoliday(new Date(holidayDate), holidayName);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Holiday added", { tone: "dark" });
    setHolidayDate(""); setHolidayName("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Period", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{p.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{p.status}</td>
                <td className="px-4 py-3 flex gap-1 items-center flex-wrap">
                  {p.status === "OPEN" && <button type="button" onClick={() => softClose(p)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Soft Close</button>}
                  {(p.status === "OPEN" || p.status === "SOFT_CLOSED") && <button type="button" onClick={() => hardClose(p)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Hard Close</button>}
                  {p.status === "HARD_CLOSED" && (
                    <>
                      <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Reopen reason…" className="muv-os-field rounded-lg px-2 py-1 text-xs bg-transparent" style={fieldStyle} />
                      <button type="button" onClick={() => reopen(p)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Governed Reopen</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Holiday Calendar</p>
        <div className="grid grid-cols-3 gap-2">
          <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Holiday name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={addHolidayRow} disabled={pending || !holidayDate || !holidayName} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>+ Add Holiday</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {holidays.map((h) => <span key={h.id} className="text-xs rounded-full px-3 py-1" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.7)" }}>{h.name} — {new Date(h.date).toLocaleDateString("en-IN")}</span>)}
        </div>
      </div>
    </div>
  );
}
