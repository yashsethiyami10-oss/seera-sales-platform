"use client";

import { useState } from "react";
import { dispatchBusinessOrder } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

const DISPATCH_METHODS = [
  { value: "COURIER", label: "Courier" },
  { value: "SELF_DELIVERY", label: "Self Delivery" },
  { value: "TRANSPORT", label: "Transport" },
];

/**
 * Milestone 6 — Dispatch & Delivery. Opened from BusinessOrderStatusControl
 * when an officer selects DISPATCHED — collects dispatch method/date/
 * courier/tracking/notes and submits it atomically with the
 * PROCESSING -> DISPATCHED transition via dispatchBusinessOrder, replacing
 * the two-step status-then-info flow Milestone 4's DispatchPanel used.
 */
export function DispatchDialog({ orderId, onClose, onDispatched }: { orderId: string; onClose: () => void; onDispatched: () => void }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [dispatchMethod, setDispatchMethod] = useState("");
  const [dispatchedAt, setDispatchedAt] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trackingReference, setTrackingReference] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");

  const courierRequired = dispatchMethod === "COURIER";
  const canSubmit = !!dispatchMethod && (!courierRequired || (!!carrierName.trim() && !!trackingReference.trim()));

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    const result = await dispatchBusinessOrder({
      id: orderId, dispatchMethod, dispatchedAt: dispatchedAt || undefined,
      carrierName: carrierName.trim() || undefined, trackingReference: trackingReference.trim() || undefined,
      dispatchNotes: dispatchNotes.trim() || undefined,
    });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Order dispatched", { tone: "dark" });
    onDispatched();
  }

  return (
    <Modal title="Dispatch Order" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="dispatch-method" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Dispatch Method *</label>
          <select id="dispatch-method" className="muv-input" value={dispatchMethod} onChange={(e) => setDispatchMethod(e.target.value)}>
            <option value="">Select method…</option>
            {DISPATCH_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="dispatch-datetime" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Dispatch Date &amp; Time</label>
          <input id="dispatch-datetime" type="datetime-local" className="muv-input" value={dispatchedAt} onChange={(e) => setDispatchedAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="courier-name" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Courier Name{courierRequired ? " *" : ""}
          </label>
          <input id="courier-name" className="muv-input" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} placeholder="e.g. Delhivery, own fleet…" />
        </div>
        <div>
          <label htmlFor="tracking-reference" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Tracking / Reference Number{courierRequired ? " *" : ""}
          </label>
          <input id="tracking-reference" className="muv-input" value={trackingReference} onChange={(e) => setTrackingReference(e.target.value)} placeholder={courierRequired ? "Required for courier dispatch" : "Optional"} />
        </div>
        <div>
          <label htmlFor="dispatch-notes" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Dispatch Notes (optional)</label>
          <textarea id="dispatch-notes" className="muv-input" rows={3} value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)} />
        </div>
        <Button variant="primary" onClick={submit} disabled={pending || !canSubmit} className="w-full">
          {pending ? "Dispatching…" : "Confirm Dispatch"}
        </Button>
      </div>
    </Modal>
  );
}
