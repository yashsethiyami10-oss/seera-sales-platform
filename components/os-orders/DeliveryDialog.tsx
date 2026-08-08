"use client";

import { useState } from "react";
import { deliverBusinessOrder } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

/**
 * Milestone 6 — Dispatch & Delivery. Opened from BusinessOrderStatusControl
 * when an officer selects DELIVERED. "Delivered By" is not a field here —
 * it is always the acting user, set server-side (deliverBusinessOrder),
 * never accepted from client input.
 */
export function DeliveryDialog({ orderId, onClose, onDelivered }: { orderId: string; onClose: () => void; onDelivered: () => void }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState("");
  const [deliveryConfirmation, setDeliveryConfirmation] = useState("");
  const [deliveryRemarks, setDeliveryRemarks] = useState("");

  async function submit() {
    setPending(true);
    const result = await deliverBusinessOrder({
      id: orderId, deliveredAt: deliveredAt || undefined,
      deliveryConfirmation: deliveryConfirmation.trim() || undefined,
      deliveryRemarks: deliveryRemarks.trim() || undefined,
    });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Order marked delivered", { tone: "dark" });
    onDelivered();
  }

  return (
    <Modal title="Mark Order Delivered" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="delivery-date" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Date</label>
          <input id="delivery-date" type="date" className="muv-input" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="delivery-confirmation" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Confirmation</label>
          <input id="delivery-confirmation" className="muv-input" value={deliveryConfirmation} onChange={(e) => setDeliveryConfirmation(e.target.value)} placeholder="e.g. Received by security desk, signed by customer…" />
        </div>
        <div>
          <label htmlFor="delivery-remarks" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Remarks (optional)</label>
          <textarea id="delivery-remarks" className="muv-input" rows={3} value={deliveryRemarks} onChange={(e) => setDeliveryRemarks(e.target.value)} />
        </div>
        <Button variant="primary" onClick={submit} disabled={pending} className="w-full">
          {pending ? "Saving…" : "Confirm Delivery"}
        </Button>
      </div>
    </Modal>
  );
}
