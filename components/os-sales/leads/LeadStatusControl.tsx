"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeLeadStatus } from "@/actions/inst-leads";
import { useToast } from "@/components/ui/toast";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "SAMPLE_REQUIRED", "SAMPLE_GIVEN", "TRIAL_RUNNING", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST"];

export function LeadStatusControl({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [lostReason, setLostReason] = useState("");
  const [showLostReason, setShowLostReason] = useState(false);

  async function apply(nextStatus: string, reason?: string) {
    setPending(true);
    const result = await changeLeadStatus({ id: leadId, status: nextStatus, lostReason: reason });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Status changed to ${nextStatus.replace(/_/g, " ")}`, { tone: "dark" });
    setStatus(nextStatus);
    setShowLostReason(false);
    router.refresh();
  }

  function onSelect(next: string) {
    if (next === "LOST") { setShowLostReason(true); return; }
    void apply(next);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => onSelect(e.target.value)}
        className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
      {showLostReason && (
        <>
          <input
            value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Reason for loss…"
            className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
          />
          <button type="button" onClick={() => apply("LOST", lostReason)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Confirm Lost</button>
        </>
      )}
    </div>
  );
}
