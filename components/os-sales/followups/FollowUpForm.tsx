"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFollowUp } from "@/actions/inst-followups";
import { useToast } from "@/components/ui/toast";

const TYPES = ["CALL", "VISIT", "WHATSAPP", "EMAIL", "REMINDER"];

export function FollowUpForm({ opportunityId, customerId, leadId }: { opportunityId?: string; customerId?: string; leadId?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await createFollowUp({
      opportunityId, customerId, leadId,
      type: String(form.get("type")), dueDate: String(form.get("dueDate")), notes: String(form.get("notes") ?? "") || undefined,
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Follow-up created", { tone: "dark" });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <select name="type" defaultValue="CALL" className={field} style={fieldStyle}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      <input type="date" name="dueDate" required className={field} style={fieldStyle} />
      <input name="notes" placeholder="Notes…" className={field} style={{ ...fieldStyle, minWidth: 200 }} />
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Adding…" : "Add Follow-up"}</button>
    </form>
  );
}
