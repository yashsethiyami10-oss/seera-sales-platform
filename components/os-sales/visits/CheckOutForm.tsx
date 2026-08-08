"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkOutVisit } from "@/actions/inst-visits";
import { useToast } from "@/components/ui/toast";

const OUTCOMES = ["POSITIVE", "NEUTRAL", "NEGATIVE", "NO_DECISION_MAKER", "RESCHEDULED"];

export function CheckOutForm({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const competitorProducts = String(form.get("competitorProducts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const photoUrls = String(form.get("photoUrls") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const result = await checkOutVisit({
      id: visitId,
      meetingNotes: String(form.get("meetingNotes") ?? "") || undefined,
      requirements: String(form.get("requirements") ?? "") || undefined,
      decisionMaker: String(form.get("decisionMaker") ?? "") || undefined,
      outcome: String(form.get("outcome") ?? "") || undefined,
      nextFollowUpDate: form.get("nextFollowUpDate") ? String(form.get("nextFollowUpDate")) : undefined,
      competitorProducts, photoUrls,
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Checked out", { tone: "dark" });
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div><label className={label} style={labelStyle}>Meeting Notes</label><textarea name="meetingNotes" rows={3} className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Customer Requirements</label><textarea name="requirements" rows={2} className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Decision Maker</label><input name="decisionMaker" className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Competitor Products (comma-separated)</label><input name="competitorProducts" className={field} style={fieldStyle} /></div>
      <div><label className={label} style={labelStyle}>Photo URLs (comma-separated)</label><input name="photoUrls" className={field} style={fieldStyle} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} style={labelStyle}>Visit Outcome</label>
          <select name="outcome" className={field} style={fieldStyle}>
            <option value="">Select…</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div><label className={label} style={labelStyle}>Next Follow-up Date</label><input type="date" name="nextFollowUpDate" className={field} style={fieldStyle} /></div>
      </div>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Saving…" : "Check Out"}</button>
    </form>
  );
}
