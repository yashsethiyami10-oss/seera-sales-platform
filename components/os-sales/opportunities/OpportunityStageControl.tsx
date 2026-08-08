"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeOpportunityStage } from "@/actions/inst-opportunities";
import { useToast } from "@/components/ui/toast";

const STAGES = ["QUALIFICATION", "CUSTOMER_VISIT", "REQUIREMENT_ANALYSIS", "SAMPLE_ISSUED", "FOLLOW_UP", "TRIAL", "QUOTATION", "NEGOTIATION", "WON", "LOST"];

export function OpportunityStageControl({ opportunityId, currentStage }: { opportunityId: string; currentStage: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(currentStage);
  const [lostReason, setLostReason] = useState("");
  const [showLostReason, setShowLostReason] = useState(false);

  async function apply(nextStage: string, reason?: string) {
    setPending(true);
    const result = await changeOpportunityStage({ id: opportunityId, stage: nextStage, lostReason: reason });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Stage changed to ${nextStage.replace(/_/g, " ")}`, { tone: "dark" });
    setStage(nextStage);
    setShowLostReason(false);
    router.refresh();
  }

  function onSelect(next: string) {
    if (next === "LOST") { setShowLostReason(true); return; }
    void apply(next);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={stage} disabled={pending} onChange={(e) => onSelect(e.target.value)} className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}>
        {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
      {showLostReason && (
        <>
          <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Reason for loss…" className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }} />
          <button type="button" onClick={() => apply("LOST", lostReason)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Confirm Lost</button>
        </>
      )}
    </div>
  );
}
