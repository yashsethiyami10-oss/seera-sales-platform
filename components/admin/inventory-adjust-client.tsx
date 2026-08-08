"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/actions/inventory";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";

type Reason = "RESTOCK" | "MANUAL_ADJUSTMENT" | "RETURN";

/** Reuses the existing, real `adjustStock` action (actions/inventory.ts)
 * unmodified — same StockHistory-logged transaction the product edit form
 * already relies on for MANUAL_ADJUSTMENT, just exposed here for all three
 * reasons a staff member can legally trigger directly (ORDER_FULFILLMENT /
 * ORDER_CANCELLED only ever happen inside the order actions, by design). */
export function InventoryAdjustClient({ variantId, label, quantity }: { variantId: string; label: string; quantity: number }) {
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState("0");
  const [reason, setReason] = useState<Reason>("RESTOCK");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleSubmit() {
    const delta = Number(change);
    if (!delta) return;
    startTransition(async () => {
      const result = await adjustStock({ variantId, change: delta, reason, note: note || undefined });
      if (result.success) {
        showToast(`Stock updated to ${result.data.quantity}`);
        setOpen(false);
        setChange("0");
        setNote("");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs" style={{ color: "var(--lavender)" }}>Adjust</button>
      {open && (
        <Modal title={`Adjust Stock — ${label}`} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <p className="muv-text-meta text-xs">Current quantity: {quantity}</p>
            <div>
              <label htmlFor="adjust-change" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Change (use negative to remove)</label>
              <input id="adjust-change" type="number" className="muv-input" value={change} onChange={(e) => setChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="adjust-reason" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Reason</label>
              <select id="adjust-reason" className="muv-input" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
                <option value="RESTOCK">Restock</option>
                <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                <option value="RETURN">Return</option>
              </select>
            </div>
            <div>
              <label htmlFor="adjust-note" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Note (optional)</label>
              <input id="adjust-note" className="muv-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </div>
            <Button variant="primary" onClick={handleSubmit} disabled={isPending || !Number(change)} className="w-full">{isPending ? "Saving…" : "Apply Adjustment"}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
