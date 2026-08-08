"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOpportunity } from "@/actions/inst-opportunities";
import { useToast } from "@/components/ui/toast";

export function OpportunityEditPanel({
  opportunityId, initial,
}: {
  opportunityId: string;
  initial: { estimatedRevenue: number; expectedQuantity: number | null; probability: number; closingDate: string | null; risks: string | null; competitors: string | null; nextAction: string | null; nextActionDate: string | null };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = { id: opportunityId };
    for (const [key, value] of form.entries()) {
      if (value === "") continue;
      if (key === "estimatedRevenue" || key === "expectedQuantity" || key === "probability") raw[key] = Number(value);
      else raw[key] = value;
    }
    const result = await updateOpportunity(raw);
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Opportunity updated", { tone: "dark" });
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} style={labelStyle}>Estimated Revenue (₹)</label><input type="number" min={0} name="estimatedRevenue" defaultValue={initial.estimatedRevenue} className={field} style={fieldStyle} /></div>
        <div><label className={label} style={labelStyle}>Expected Quantity</label><input type="number" min={0} name="expectedQuantity" defaultValue={initial.expectedQuantity ?? ""} className={field} style={fieldStyle} /></div>
        <div><label className={label} style={labelStyle}>Probability (%)</label><input type="number" min={0} max={100} name="probability" defaultValue={initial.probability} className={field} style={fieldStyle} /></div>
        <div><label className={label} style={labelStyle}>Closing Date</label><input type="date" name="closingDate" defaultValue={initial.closingDate ?? ""} className={field} style={fieldStyle} /></div>
      </div>
      <div><label className={label} style={labelStyle}>Risks</label><textarea name="risks" rows={2} defaultValue={initial.risks ?? ""} className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Competitors</label><textarea name="competitors" rows={2} defaultValue={initial.competitors ?? ""} className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Next Action</label><input name="nextAction" defaultValue={initial.nextAction ?? ""} className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Next Action Date</label><input type="date" name="nextActionDate" defaultValue={initial.nextActionDate ?? ""} className={field} style={fieldStyle} /></div>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Saving…" : "Save"}</button>
    </form>
  );
}
