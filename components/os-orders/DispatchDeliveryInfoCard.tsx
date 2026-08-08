"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmendDispatchDeliveryDialog } from "@/components/os-orders/AmendDispatchDeliveryDialog";

type Props = {
  orderId: string;
  status: string;
  canAmend: boolean;
  dispatchMethod: string | null;
  carrierName: string | null;
  trackingReference: string | null;
  dispatchNotes: string | null;
  dispatchedAt: Date | string | null;
  dispatchedByName: string | null;
  deliveredAt: Date | string | null;
  deliveredByName: string | null;
  deliveryConfirmation: string | null;
  deliveryRemarks: string | null;
};

const field = (label: string, value: string | null) => (
  <div>
    <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{label}</p>
    <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{value ?? "—"}</p>
  </div>
);

/**
 * Milestone 6 — Dispatch & Delivery. Read-only summary of whatever
 * dispatchBusinessOrder/deliverBusinessOrder recorded (those are the only
 * normal write paths — this card never edits directly). A DISPATCHED or
 * DELIVERED order shows an "Amend" action only for Founder/Admin
 * (canAmend, computed server-side by getBusinessOrderDetail), matching the
 * approved "delivered orders are read-only except Founder/Admin" rule.
 */
export function DispatchDeliveryInfoCard(props: Props) {
  const router = useRouter();
  const [amendOpen, setAmendOpen] = useState(false);
  const hasDispatchInfo = props.status === "DISPATCHED" || props.status === "DELIVERED";

  return (
    <div className="space-y-4">
      {!hasDispatchInfo ? (
        <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
          Dispatch information will be recorded once this order is dispatched (via the status control above).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {field("Dispatch Method", props.dispatchMethod ? props.dispatchMethod.replace(/_/g, " ") : null)}
            {field("Courier Name", props.carrierName)}
            {field("Tracking / Reference Number", props.trackingReference)}
            {field("Dispatched At", props.dispatchedAt ? new Date(props.dispatchedAt).toLocaleString("en-IN") : null)}
            {field("Dispatched By", props.dispatchedByName)}
          </div>
          {props.dispatchNotes && <div>{field("Dispatch Notes", props.dispatchNotes)}</div>}
        </>
      )}

      {props.status === "DELIVERED" && (
        <div className="pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {field("Delivered At", props.deliveredAt ? new Date(props.deliveredAt).toLocaleString("en-IN") : null)}
            {field("Delivered By", props.deliveredByName)}
            {field("Delivery Confirmation", props.deliveryConfirmation)}
          </div>
          {props.deliveryRemarks && <div className="mt-3">{field("Delivery Remarks", props.deliveryRemarks)}</div>}
        </div>
      )}

      {hasDispatchInfo && props.canAmend && (
        <button
          type="button" onClick={() => setAmendOpen(true)}
          className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm"
          style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}
        >
          Amend Dispatch / Delivery Info
        </button>
      )}

      {amendOpen && (
        <AmendDispatchDeliveryDialog
          orderId={props.orderId}
          initial={{
            dispatchMethod: props.dispatchMethod, carrierName: props.carrierName, trackingReference: props.trackingReference,
            dispatchNotes: props.dispatchNotes, deliveryConfirmation: props.deliveryConfirmation, deliveryRemarks: props.deliveryRemarks,
          }}
          onClose={() => setAmendOpen(false)}
          onAmended={() => { setAmendOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
