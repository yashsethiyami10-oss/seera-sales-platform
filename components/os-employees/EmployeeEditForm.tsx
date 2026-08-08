"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployee } from "@/actions/employees";
import { useToast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

type Option = { id: string; name: string };

export function EmployeeEditForm({
  employee, departments, territories, managers,
}: {
  employee: { id: string; departmentId: string | null; designation: string | null; territoryId: string | null; reportingManagerId: string | null; active: boolean };
  departments: Option[]; territories: Option[]; managers: Option[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await updateEmployee({
      id: employee.id,
      departmentId: form.get("departmentId") || null,
      designation: form.get("designation") || null,
      territoryId: form.get("territoryId") || null,
      reportingManagerId: form.get("reportingManagerId") || null,
      active: form.get("active") === "on",
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      return;
    }
    showToast("Employee updated", { tone: "dark" });
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <SectionHeader title="Employment Details" />
      {error && (
        <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label} style={labelStyle}>Department</label>
          <select name="departmentId" defaultValue={employee.departmentId ?? ""} className={field} style={fieldStyle}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div><label className={label} style={labelStyle}>Designation</label><input name="designation" defaultValue={employee.designation ?? ""} className={field} style={fieldStyle} /></div>
        <div>
          <label className={label} style={labelStyle}>Territory</label>
          <select name="territoryId" defaultValue={employee.territoryId ?? ""} className={field} style={fieldStyle}>
            <option value="">None</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} style={labelStyle}>Reporting Manager</label>
          <select name="reportingManagerId" defaultValue={employee.reportingManagerId ?? ""} className={field} style={fieldStyle}>
            <option value="">None</option>
            {managers.filter((m) => m.id !== employee.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
        <input type="checkbox" name="active" defaultChecked={employee.active} /> Active
      </label>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
