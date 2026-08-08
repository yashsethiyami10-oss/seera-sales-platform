"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSampleTrial } from "@/actions/inst-samples";
import { useToast } from "@/components/ui/toast";

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED"];
const RESULTS = ["POSITIVE", "NEGATIVE", "NEUTRAL", "NO_FEEDBACK"];

export function TrialUpdateControl({ sampleId, trialStatus, trialResult }: { sampleId: string; trialStatus: string; trialResult: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [status, setStatus] = useState(trialStatus);
  const [result, setResult] = useState(trialResult ?? "");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const res = await updateSampleTrial({ id: sampleId, trialStatus: status, trialResult: result || undefined, feedback: feedback || undefined });
    setPending(false);
    if (!res.success) { showToast(res.error.message, { tone: "dark" }); return; }
    showToast("Trial updated", { tone: "dark" });
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-2 py-1 text-xs bg-transparent";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={field} style={fieldStyle}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
      <select value={result} onChange={(e) => setResult(e.target.value)} className={field} style={fieldStyle}><option value="">No result</option>{RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback…" className={field} style={{ ...fieldStyle, width: 120 }} />
      <button type="button" onClick={save} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>{pending ? "…" : "Save"}</button>
    </div>
  );
}
