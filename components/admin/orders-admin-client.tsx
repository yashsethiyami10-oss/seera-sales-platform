"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/actions/orders";
import { useToast } from "@/components/ui/toast";
import { orderStatusValues } from "@/lib/validations/order";

type Order = { id: string; orderNumber: string; customer: string; total: number; status: string; paymentMethod: string };

export function OrdersAdminClient({ orders }: { orders: Order[] }) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleStatusChange(orderId: string, status: string) {
    startTransition(async () => {
      const result = await updateOrderStatus({ orderId, status });
      if (result.success) {
        showToast(`Order marked ${status}`);
        router.refresh();
      } else {
        // Includes real INVALID_TRANSITION rejections from ALLOWED_TRANSITIONS
        // in lib/validations/order.ts — e.g. trying to jump PLACED straight
        // to DELIVERED is rejected here with the actual server-side reason.
        showToast(result.error.message);
      }
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>{["Order", "Customer", "Total", "Payment", "Status", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>#{o.orderNumber}</td>
              <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{o.customer}</td>
              <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{o.total}</td>
              <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{o.paymentMethod}</td>
              <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                <select
                  defaultValue={o.status}
                  disabled={isPending}
                  onChange={(e) => handleStatusChange(o.id, e.target.value)}
                  className="muv-input"
                  style={{ width: "auto", minHeight: "auto", padding: "6px 10px" }}
                >
                  {orderStatusValues.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                <Link href={`/admin/orders/${o.id}`} className="text-xs" style={{ color: "var(--lavender)" }}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
