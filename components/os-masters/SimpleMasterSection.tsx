"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

export interface MasterFieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox";
  required?: boolean;
}

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: { message: string } };

/**
 * MUV OS™ — Milestone 2 (refined), Common Masters. One generic table+form,
 * reused across all seven Common Master entities — genuine, present
 * duplication avoided across seven real call sites, not a speculative
 * abstraction. Refinement pass: consistent SectionHeader, toast feedback,
 * and the shared muv-os-* hover/focus classes so every one of the seven
 * masters looks and behaves identically without repeating the styling.
 *
 * Scope, deliberately unchanged from the original pass: Create + toggle
 * Active/Inactive. The explicit requirement ("Administrator must be able
 * to create new Institution Categories without changing code") is about
 * creation, which this covers in full; renaming/editing an existing row's
 * other fields is still deferred.
 */
export function SimpleMasterSection<T extends { id: string; active: boolean }>({
  title,
  description,
  fields,
  displayColumns,
  items,
  createAction,
  toggleActiveAction,
}: {
  title: string;
  description?: string;
  fields: MasterFieldConfig[];
  displayColumns: { key: keyof T; label: string; format?: (item: T) => string }[];
  items: T[];
  createAction: (input: unknown) => Promise<ActionResult>;
  toggleActiveAction: (id: string, active: boolean) => Promise<ActionResult>;
}) {
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
    const input: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "checkbox") input[f.key] = form.get(f.key) === "on";
      else if (f.type === "number") input[f.key] = form.get(f.key) ? Number(form.get(f.key)) : undefined;
      else input[f.key] = form.get(f.key) || undefined;
    }
    const result = await createAction(input);
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      return;
    }
    setAdding(false);
    showToast(`${title.replace(/s$/, "")} created`, { tone: "dark" });
    router.refresh();
  }

  async function onToggle(item: T) {
    const result = await toggleActiveAction(item.id, !item.active);
    if (result.success) {
      showToast(item.active ? "Deactivated" : "Activated", { tone: "dark" });
      router.refresh();
    } else {
      showToast(result.error.message, { tone: "dark" });
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <SectionHeader title={title} description={description} />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="muv-os-interactive flex flex-shrink-0 items-center gap-1.5 text-xs px-2 py-1"
          style={{ color: "var(--lavender)" }}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {adding && (
        <form onSubmit={onSubmit} className="mb-3 space-y-2 rounded-lg p-3" style={{ border: "1px solid var(--card-border)" }}>
          {error && (
            <p role="alert" className="text-xs rounded-lg px-2 py-1.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {fields.map((f) =>
              f.type === "checkbox" ? (
                <label key={f.key} className="flex items-center gap-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
                  <input type="checkbox" name={f.key} /> {f.label}
                </label>
              ) : (
                <input
                  key={f.key}
                  name={f.key}
                  type={f.type}
                  required={f.required}
                  aria-label={f.label}
                  placeholder={f.label + (f.required ? " *" : "")}
                  className="muv-os-field rounded-lg px-2 py-1.5 text-sm bg-transparent"
                  style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
                />
              )
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {displayColumns.map((c) => (
                <th key={String(c.key)} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={displayColumns.length + 1} className="px-3 py-8 text-center text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Nothing here yet — use &ldquo;Add&rdquo; above to create the first one.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {displayColumns.map((c) => (
                    <td key={String(c.key)} className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.8)" }}>
                      {c.format ? c.format(item) : String(item[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => onToggle(item)} className="muv-os-btn-ghost px-2 py-1 text-xs" style={{ color: item.active ? "#ef4444" : "var(--lavender)" }}>
                      {item.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
