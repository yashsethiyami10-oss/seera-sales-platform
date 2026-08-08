"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBusinessOrderStatus } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { DispatchDialog } from "@/components/os-orders/DispatchDialog";
import { DeliveryDialog } from "@/components/os-orders/DeliveryDialog";

/**
 * Milestone 4 — Order Management OS. Mirrors
 * components/os-sales/opportunities/OpportunityStageControl.tsx exactly —
 * same select + conditional-reason-input pattern, adapted to
 * BusinessOrderStatus's linear (not branching) allowed-transitions shape.
 * Only ever offers transitions the server itself will accept
 * (ALLOWED_TRANSITIONS in actions/business-orders.ts) — this is a UX
 * convenience, not the enforcement; the server re-validates independently.
 *
 * Milestone 6 — Dispatch & Delivery. Selecting DISPATCHED/DELIVERED no
 * longer calls updateBusinessOrderStatus directly (that action has no way
 * to collect dispatch method/courier/tracking/delivery-confirmation) —
 * instead it opens the matching dialog, which submits the whole thing
 * atomically via dispatchBusinessOrder/deliverBusinessOrder.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function BusinessOrderStatusControl({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [dialog, setDialog] = useState<"DISPATCH" | "DELIVER" | null>(null);

  const nextOptions = ALLOWED_TRANSITIONS[status] ?? [];

  async function apply(nextStatus: string, reason?: string) {
    setPending(true);
    const result = await updateBusinessOrderStatus({ id: orderId, status: nextStatus, reason });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Order marked ${nextStatus}`, { tone: "dark" });
    setStatus(nextStatus);
    setShowCancelReason(false);
    router.refresh();
  }

  function onSelect(next: string) {
    if (next === "CANCELLED") { setShowCancelReason(true); return; }
    if (next === "DISPATCHED") { setDialog("DISPATCH"); return; }
    if (next === "DELIVERED") { setDialog("DELIVER"); return; }
    void apply(next);
  }

  function closeDialog(nextStatus?: string) {
    setDialog(null);
    if (nextStatus) { setStatus(nextStatus); router.refresh(); }
  }

  if (nextOptions.length === 0) {
    return <span className="text-sm rounded-full px-3 py-1.5" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.6)" }}>{status} (final)</span>;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{status}</span>
      <select
        value=""
        disabled={pending}
        onChange={(e) => e.target.value && onSelect(e.target.value)}
        className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
      >
        <option value="">Change status…</option>
        {nextOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
      {showCancelReason && (
        <>
          <input
            value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (min 3 characters)…"
            className="muv-os-field rounded-lg px-3 py-1.5 text-sm bg-transparent"
            style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
          />
          <button
            type="button" onClick={() => apply("CANCELLED", cancelReason)}
            disabled={pending || cancelReason.trim().length < 3}
            className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
          >
            Confirm Cancel
          </button>
        </>
      )}
      {dialog === "DISPATCH" && (
        <DispatchDialog orderId={orderId} onClose={() => setDialog(null)} onDispatched={() => closeDialog("DISPATCHED")} />
      )}
      {dialog === "DELIVER" && (
        <DeliveryDialog orderId={orderId} onClose={() => setDialog(null)} onDelivered={() => closeDialog("DELIVERED")} />
      )}
    </div>
  );
}
