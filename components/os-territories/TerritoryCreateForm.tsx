"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTerritory } from "@/actions/territories";
import { useToast } from "@/components/ui/toast";

export function TerritoryCreateForm({ territories }: { territories: { id: string; name: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await createTerritory({
      name: form.get("name"),
      code: form.get("code"),
      level: form.get("level"),
      parentTerritoryId: form.get("parentTerritoryId") || undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      return;
    }
    setAdding(false);
    showToast("Territory created", { tone: "dark" });
    router.refresh();
  }

  if (!adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        <Plus size={14} /> New Territory
      </button>
    );
  }

  const field = "muv-os-field rounded-lg px-2 py-1.5 text-sm bg-transparent";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <form onSubmit={onSubmit} className="rounded-lg p-3 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
      {error && (
        <p role="alert" className="text-xs rounded-lg px-2 py-1.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required placeholder="Name *" className={field} style={fieldStyle} />
        <input name="code" required placeholder="Code *" className={field} style={fieldStyle} />
        <select name="level" required defaultValue="TERRITORY" className={field} style={fieldStyle}>
          <option value="STATE">State</option>
          <option value="CITY">City</option>
          <option value="AREA">Area</option>
          <option value="TERRITORY">Territory</option>
        </select>
        <select name="parentTerritoryId" className={field} style={fieldStyle}>
          <option value="">No parent</option>
          {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Saving…" : "Create"}</button>
        <button type="button" onClick={() => setAdding(false)} className="muv-os-btn-ghost px-2 py-1 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Cancel</button>
      </div>
    </form>
  );
}
