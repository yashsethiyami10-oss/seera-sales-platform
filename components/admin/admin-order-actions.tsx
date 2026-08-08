"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus, refundOrder } from "@/actions/orders";
import { orderStatusValues } from "@/lib/validations/order";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";

/** Reuses updateOrderStatus/refundOrder (actions/orders.ts) unmodified —
 * same ALLOWED_TRANSITIONS enforcement and real Razorpay refund call
 * already used by the storefront-facing cancel flow, not reimplemented. */
export function AdminOrderActions({ orderId, status, paymentStatus, total }: { orderId: string; status: string; paymentStatus: string; total: number }) {
  const [isPending, startTransition] = useTransition();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(String(total));
  const { showToast } = useToast();
  const router = useRouter();

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      const result = await updateOrderStatus({ orderId, status: newStatus });
      if (result.success) { showToast(`Order marked ${newStatus}`); router.refresh(); }
      else showToast(result.error.message);
    });
  }

  function handleRefund() {
    startTransition(async () => {
      const result = await refundOrder({ orderId, amount: Number(refundAmount), reason: "Refunded by staff" });
      if (result.success) { showToast("Refund processed"); setRefundOpen(false); router.refresh(); }
      else showToast(result.error.message);
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div>
        <label htmlFor="order-status" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Status</label>
        <select id="order-status" defaultValue={status} disabled={isPending} onChange={(e) => handleStatusChange(e.target.value)} className="muv-input" style={{ width: "auto" }}>
          {orderStatusValues.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {paymentStatus === "PAID" && (
        <Button variant="ghost" onClick={() => setRefundOpen(true)}>Refund</Button>
      )}

      {refundOpen && (
        <Modal title="Process Refund" onClose={() => setRefundOpen(false)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="refund-amount" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Amount (₹, max {total})</label>
              <input id="refund-amount" type="number" max={total} className="muv-input" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </div>
            <Button variant="primary" onClick={handleRefund} disabled={isPending} className="w-full">{isPending ? "Processing…" : "Confirm Refund"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
