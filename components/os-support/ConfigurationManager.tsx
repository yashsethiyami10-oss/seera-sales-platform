"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDepartment, createSlaPolicy, addHoliday } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const cardStyle = { border: "1px solid var(--card-border)" } as const;

type Props = {
  departments: { id: string; code: string; name: string }[];
  slaPolicies: { id: string; name: string; category: string | null; priority: string | null; responseMinutes: number; resolutionMinutes: number }[];
  businessHours: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
  holidays: { id: string; date: Date; name: string }[];
  escalationRules: { id: string; name: string; triggerType: string }[];
};

export function ConfigurationManager({ departments, slaPolicies, businessHours, holidays, escalationRules }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [deptCode, setDeptCode] = useState("");
  const [deptName, setDeptName] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [responseMinutes, setResponseMinutes] = useState(60);
  const [resolutionMinutes, setResolutionMinutes] = useState(1440);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  async function act(fn: () => Promise<{ success: true; data: unknown } | { success: false; error: { message: string } }>, msg: string, reset: () => void) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(msg, { tone: "dark" });
    reset();
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Departments</p>
        {departments.map((d) => <p key={d.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{d.code} — {d.name}</p>)}
        <div className="flex gap-2">
          <input value={deptCode} onChange={(e) => setDeptCode(e.target.value)} placeholder="Code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} />
          <button type="button" onClick={() => act(() => createDepartment({ code: deptCode, name: deptName }), "Department created", () => { setDeptCode(""); setDeptName(""); })} disabled={pending || !deptCode || !deptName} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
        </div>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>SLA Policies</p>
        {slaPolicies.map((p) => <p key={p.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{p.name}: response {p.responseMinutes}m, resolution {p.resolutionMinutes}m {p.priority ? `(${p.priority})` : ""}</p>)}
        <div className="flex flex-wrap gap-2">
          <input value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="Policy name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={responseMinutes} onChange={(e) => setResponseMinutes(Number(e.target.value))} placeholder="Response min" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent w-28" style={fieldStyle} />
          <input type="number" value={resolutionMinutes} onChange={(e) => setResolutionMinutes(Number(e.target.value))} placeholder="Resolution min" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent w-28" style={fieldStyle} />
          <button type="button" onClick={() => act(() => createSlaPolicy({ name: policyName, responseMinutes, resolutionMinutes }), "SLA policy created", () => setPolicyName(""))} disabled={pending || !policyName} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
        </div>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Business Hours</p>
        {businessHours.map((b) => <p key={b.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>Day {b.dayOfWeek}: {b.startTime}–{b.endTime}</p>)}
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Holidays</p>
        {holidays.map((h) => <p key={h.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{new Date(h.date).toLocaleDateString()} — {h.name}</p>)}
        <div className="flex gap-2">
          <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} />
          <button type="button" onClick={() => act(() => addHoliday({ date: holidayDate, name: holidayName }), "Holiday added", () => { setHolidayDate(""); setHolidayName(""); })} disabled={pending || !holidayDate || !holidayName} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
        </div>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-2 lg:col-span-2" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Escalation Rules</p>
        {escalationRules.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No custom rules — the default chain applies.</p> :
          escalationRules.map((r) => <p key={r.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.name} ({r.triggerType})</p>)}
      </div>
    </div>
  );
}
