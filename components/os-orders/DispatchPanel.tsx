"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordBusinessOrderDispatch } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";

/**
 * Milestone 4 — Order Management OS, Dispatch panel. Deliberately simple:
 * carrier, tracking reference, dispatch date, expected delivery date. No
 * courier API, no AWB generation, no label, no warehouse allocation — those
 * are explicitly out of scope for this milestone.
 */
export function DispatchPanel({
  orderId,
  initial,
}: {
  orderId: string;
  initial: { carrierName: string | null; trackingReference: string | null; dispatchedAt: string | null; expectedDeliveryDate: string | null };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [carrierName, setCarrierName] = useState(initial.carrierName ?? "");
  const [trackingReference, setTrackingReference] = useState(initial.trackingReference ?? "");
  const [dispatchDate, setDispatchDate] = useState(initial.dispatchedAt ?? "");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(initial.expectedDeliveryDate ?? "");

  async function submit() {
    setPending(true);
    const result = await recordBusinessOrderDispatch({
      id: orderId,
      carrierName: carrierName || undefined,
      trackingReference: trackingReference || undefined,
      dispatchDate: dispatchDate || undefined,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
    });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Dispatch information saved", { tone: "dark" });
    router.refresh();
  }

  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
          Carrier / delivery method
          <input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} placeholder="e.g. Own fleet, Delhivery…" className="muv-os-field w-full rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
        </label>
        <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
          Tracking / reference number
          <input value={trackingReference} onChange={(e) => setTrackingReference(e.target.value)} placeholder="Optional" className="muv-os-field w-full rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
        </label>
        <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
          Dispatch date
          <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="muv-os-field w-full rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
        </label>
        <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
          Expected delivery date
          <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className="muv-os-field w-full rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
        </label>
      </div>
      <button type="button" onClick={submit} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>
        Save Dispatch Info
      </button>
    </div>
  );
}
