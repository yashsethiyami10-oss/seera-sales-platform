"use client";

import { useState } from "react";
import { amendBusinessOrderDispatchDelivery } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

const DISPATCH_METHODS = [
  { value: "COURIER", label: "Courier" },
  { value: "SELF_DELIVERY", label: "Self Delivery" },
  { value: "TRANSPORT", label: "Transport" },
];

type Initial = {
  dispatchMethod: string | null; carrierName: string | null; trackingReference: string | null; dispatchNotes: string | null;
  deliveryConfirmation: string | null; deliveryRemarks: string | null;
};

/**
 * Milestone 6 — Dispatch & Delivery, Founder/Admin-only correction path.
 * Never changes order status — only the already-recorded dispatch/delivery
 * fields, and always requires a stated reason (its own audited entry,
 * distinct from the original ORDER_DISPATCHED/ORDER_DELIVERED audit row).
 */
export function AmendDispatchDeliveryDialog({ orderId, initial, onClose, onAmended }: { orderId: string; initial: Initial; onClose: () => void; onAmended: () => void }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [dispatchMethod, setDispatchMethod] = useState(initial.dispatchMethod ?? "");
  const [carrierName, setCarrierName] = useState(initial.carrierName ?? "");
  const [trackingReference, setTrackingReference] = useState(initial.trackingReference ?? "");
  const [dispatchNotes, setDispatchNotes] = useState(initial.dispatchNotes ?? "");
  const [deliveryConfirmation, setDeliveryConfirmation] = useState(initial.deliveryConfirmation ?? "");
  const [deliveryRemarks, setDeliveryRemarks] = useState(initial.deliveryRemarks ?? "");
  const [reason, setReason] = useState("");

  async function submit() {
    if (reason.trim().length < 3) return;
    setPending(true);
    const result = await amendBusinessOrderDispatchDelivery({
      id: orderId,
      dispatchMethod: dispatchMethod || undefined,
      carrierName: carrierName.trim() || undefined,
      trackingReference: trackingReference.trim() || undefined,
      dispatchNotes: dispatchNotes.trim() || undefined,
      deliveryConfirmation: deliveryConfirmation.trim() || undefined,
      deliveryRemarks: deliveryRemarks.trim() || undefined,
      reason: reason.trim(),
    });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Dispatch/delivery information amended", { tone: "dark" });
    onAmended();
  }

  return (
    <Modal title="Amend Dispatch / Delivery Info (Founder/Admin)" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="amend-dispatch-method" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Dispatch Method</label>
          <select id="amend-dispatch-method" className="muv-input" value={dispatchMethod} onChange={(e) => setDispatchMethod(e.target.value)}>
            <option value="">— unchanged —</option>
            {DISPATCH_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="amend-carrier-name" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Courier Name</label>
          <input id="amend-carrier-name" className="muv-input" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amend-tracking-reference" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Tracking / Reference Number</label>
          <input id="amend-tracking-reference" className="muv-input" value={trackingReference} onChange={(e) => setTrackingReference(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amend-dispatch-notes" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Dispatch Notes</label>
          <textarea id="amend-dispatch-notes" className="muv-input" rows={2} value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amend-delivery-confirmation" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Confirmation</label>
          <input id="amend-delivery-confirmation" className="muv-input" value={deliveryConfirmation} onChange={(e) => setDeliveryConfirmation(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amend-delivery-remarks" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Remarks</label>
          <textarea id="amend-delivery-remarks" className="muv-input" rows={2} value={deliveryRemarks} onChange={(e) => setDeliveryRemarks(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amend-reason" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Reason for Amendment * (min 3 characters)</label>
          <input id="amend-reason" className="muv-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being corrected?" />
        </div>
        <Button variant="primary" onClick={submit} disabled={pending || reason.trim().length < 3} className="w-full">
          {pending ? "Saving…" : "Confirm Amendment"}
        </Button>
      </div>
    </Modal>
  );
}
