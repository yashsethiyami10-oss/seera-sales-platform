"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePlan, submitEndOfDay, saveRoute } from "@/actions/inst-planner";
import { useToast } from "@/components/ui/toast";

const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function PlannerNotesForm({ planDate, initialNotes }: { planDate: string; initialNotes: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await savePlan({ planDate, notes: notes || undefined });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Plan saved", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Morning notes for today…" className={field} style={fieldStyle} />
      <button type="button" onClick={save} disabled={saving} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>{saving ? "Saving…" : "Save Notes"}</button>
    </div>
  );
}

export function EndOfDayForm({ planDate, initialSummary }: { planDate: string; initialSummary: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!summary.trim()) { showToast("Add a summary before submitting", { tone: "dark" }); return; }
    setSaving(true);
    const result = await submitEndOfDay({ planDate, endOfDaySummary: summary });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("End of day summary submitted", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="What happened today?" className={field} style={fieldStyle} />
      <button type="button" onClick={submit} disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Submitting…" : "Submit End of Day"}</button>
    </div>
  );
}

export function RoutePlanForm({ planDate }: { planDate: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [stops, setStops] = useState("");
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const plannedStops = stops.split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
    const result = await saveRoute({ routeDate: planDate, plannedStops, plannedDistanceKm: distance ? Number(distance) : undefined });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Route saved", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input value={stops} onChange={(e) => setStops(e.target.value)} placeholder="Stops, comma-separated…" className={field} style={fieldStyle} />
      <input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="Planned distance (km)" className={field} style={fieldStyle} />
      <button type="button" onClick={save} disabled={saving} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>{saving ? "Saving…" : "Save Route"}</button>
    </div>
  );
}
