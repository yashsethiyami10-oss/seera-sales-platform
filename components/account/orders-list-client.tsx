"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { cancelOrder } from "@/actions/orders";
import { useToast } from "@/components/ui/toast";
import { Badge, Button } from "@/components/ui/primitives";

type Order = { id: string; orderNumber: string; date: string; total: number; status: string; itemCount: number; canCancel: boolean };

export function OrdersListClient({ orders }: { orders: Order[] }) {
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleCancel() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const result = await cancelOrder({ orderId: cancelTarget.id, reason: reason || "Changed my mind" });
      if (result.success) {
        showToast("Order cancelled");
        setCancelTarget(null);
        router.refresh(); // re-fetches the Server Component's Prisma query — reflects the real new status
      } else {
        showToast(result.error.message);
      }
    });
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="muv-icon-circle mb-5" style={{ width: 56, height: 56, margin: "0 auto" }} aria-hidden>
          <Package size={22} />
        </div>
        <p className="muv-text-solid text-sm font-medium mb-1.5">No orders yet</p>
        <p className="muv-text-meta text-sm mb-6">When you place one, it'll show up here.</p>
        <Link href="/shop"><Button variant="ghost">Explore Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="muv-card flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-display muv-text-solid text-sm" style={{ fontWeight: 500 }}>#{o.orderNumber}</p>
            <p className="muv-text-meta text-xs mt-1">{o.date} · {o.itemCount} item{o.itemCount > 1 ? "s" : ""} · ₹{o.total}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={o.status === "CANCELLED" ? "muted" : "positive"}>{o.status}</Badge>
            <Link href={`/account/orders/${o.id}`} className="text-xs" style={{ color: "var(--lavender)" }}>View Details</Link>
            {o.canCancel ? (
              <button className="text-xs" style={{ color: "var(--lavender)" }} onClick={() => setCancelTarget(o)}>Cancel</button>
            ) : (
              !["CANCELLED", "DELIVERED", "RETURNED", "RETURN_REQUESTED"].includes(o.status) && (
                <span className="muv-text-faint text-xs" title="Orders can only be cancelled before they enter the Packed stage.">Cancellation unavailable</span>
              )
            )}
          </div>
        </div>
      ))}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(5,5,7,0.7)" }} onClick={() => setCancelTarget(null)}>
          <div className="muv-modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display muv-text-solid text-lg mb-2">Cancel Order #{cancelTarget.orderNumber}?</h3>
            <p className="muv-text-meta text-xs mb-4">Orders can only be cancelled before they enter the Packed stage. After Packed, cancellation is unavailable.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="muv-input muv-textarea mb-4" />
            <div className="flex gap-3">
              <button className="muv-btn-ghost" onClick={() => setCancelTarget(null)}>Keep Order</button>
              <button className="muv-btn-primary" onClick={handleCancel} disabled={isPending}>{isPending ? "Cancelling…" : "Confirm Cancel"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
