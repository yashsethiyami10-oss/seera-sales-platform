"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reserveInventoryAndAssignWarehouse } from "@/actions/operations";
import { useToast } from "@/components/ui/toast";

type Line = {
  itemId: string; productName: string; size: string | null; quantityOrdered: number;
  currentStock: number; reservedStock: number; availableStock: number; sufficient: boolean;
};

/**
 * Milestone 5 — Operations Foundation. Shows the server-computed Current/
 * Reserved/Available stock per line (never a client-side calculation) and,
 * for a CONFIRMED order, one action: reserve stock for every line and
 * assign the warehouse in one atomic step. Button disabled while pending
 * (prevents double-click) and disabled entirely if any line is already
 * known-insufficient at render time — the real re-check still happens
 * server-side regardless, this is just an honest UI hint.
 */
export function InventoryCheckPanel({ businessOrderId, status, lines, warehouseName }: { businessOrderId: string; status: string; lines: Line[]; warehouseName: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  const allSufficient = lines.length > 0 && lines.every((l) => l.sufficient);

  async function reserve() {
    if (pending) return;
    setPending(true);
    const result = await reserveInventoryAndAssignWarehouse(businessOrderId);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Stock reserved, warehouse assigned — order moved to Processing", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {warehouseName && (
        <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.7)" }}>Assigned Warehouse: {warehouseName}</p>
      )}
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["Product", "Size", "Ordered", "Current Stock", "Reserved Stock", "Available Stock", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.itemId} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{l.productName}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{l.size ?? "—"}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.quantityOrdered}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.currentStock}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.reservedStock}</td>
                <td className="px-3 py-2" style={{ color: l.sufficient ? "#22c55e" : "#ef4444" }}>{l.availableStock}</td>
                <td className="px-3 py-2 text-xs" style={{ color: l.sufficient ? "#22c55e" : "#ef4444" }}>{l.sufficient ? "OK" : "Insufficient"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status === "CONFIRMED" && (
        <button
          type="button" onClick={reserve} disabled={pending || !allSufficient}
          className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--lavender)", color: "#0b0b0f" }}
        >
          {pending ? "Reserving…" : "Check Inventory & Reserve Stock"}
        </button>
      )}
    </div>
  );
}
