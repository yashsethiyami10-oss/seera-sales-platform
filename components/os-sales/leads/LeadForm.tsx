"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLead, updateLead } from "@/actions/inst-leads";
import { useToast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

type Option = { id: string; name: string };

export function LeadForm({
  territories, leadSources, officers, initial,
}: {
  territories: Option[]; leadSources: Option[]; officers: Option[];
  initial?: Record<string, unknown> & { id?: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null); setFieldErrors(undefined);

    const form = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (value === "") continue;
      if (key === "estimatedValue") raw[key] = Number(value);
      else raw[key] = value;
    }

    const result = initial?.id ? await updateLead({ id: initial.id, ...raw }) : await createLead(raw);
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      if ("fieldErrors" in result.error) setFieldErrors(result.error.fieldErrors as Record<string, string[]>);
      return;
    }
    showToast(initial?.id ? "Lead updated" : "Lead created", { tone: "dark" });
    router.push(`/os/sales/leads/${result.data.id}`);
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;
  function d(name: string, fallback = ""): string {
    const value = initial?.[name];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>{error}</p>}

      <section className="pb-6 border-b" style={{ borderColor: "var(--card-border)" }}>
        <div className="mb-3"><SectionHeader title="Lead Details" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label} style={labelStyle}>Organization Name *</label><input name="organizationName" required defaultValue={d("organizationName")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Contact Person *</label><input name="contactPerson" required defaultValue={d("contactPerson")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Phone *</label><input name="phone" required defaultValue={d("phone")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Email</label><input type="email" name="email" defaultValue={d("email")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>City</label><input name="city" defaultValue={d("city")} className={field} style={fieldStyle} /></div>
          <div>
            <label className={label} style={labelStyle}>Territory</label>
            <select name="territoryId" defaultValue={d("territoryId")} className={field} style={fieldStyle}>
              <option value="">None</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3"><SectionHeader title="Qualification" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label} style={labelStyle}>Source</label>
            <select name="leadSourceId" defaultValue={d("leadSourceId")} className={field} style={fieldStyle}>
              <option value="">Unknown</option>
              {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} style={labelStyle}>Priority</label>
            <select name="priority" defaultValue={d("priority", "MEDIUM")} className={field} style={fieldStyle}>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label className={label} style={labelStyle}>Estimated Value (₹)</label><input type="number" min={0} name="estimatedValue" defaultValue={d("estimatedValue")} className={field} style={fieldStyle} /></div>
          {!initial?.id && (
            <div>
              <label className={label} style={labelStyle}>Assign To</label>
              <select name="assignedToId" defaultValue="" className={field} style={fieldStyle}>
                <option value="">Myself</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {!initial?.id && (
            <div className="sm:col-span-2"><label className={label} style={labelStyle}>Note</label><textarea name="note" rows={3} className={field} style={fieldStyle} /></div>
          )}
        </div>
      </section>

      {fieldErrors && (
        <ul role="alert" className="text-xs rounded-lg px-3 py-2 space-y-0.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {Object.entries(fieldErrors).map(([f, errs]) => <li key={f}>{f}: {errs.join(", ")}</li>)}
        </ul>
      )}

      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Saving…" : initial?.id ? "Save Changes" : "Create Lead"}
      </button>
    </form>
  );
}
