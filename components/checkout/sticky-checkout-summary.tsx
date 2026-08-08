"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** Same fixed-bottom-bar pattern as Cart's StickyCartSummary and the PDP's
 * StickyMobileCTA — mobile only, real total, triggers the real place-order
 * handler passed down from CheckoutClient rather than a second, competing
 * implementation of order placement. */
export function StickyCheckoutSummary({ total, onPlaceOrder, placing, disabled }: { total: number; onPlaceOrder: () => void; placing: boolean; disabled: boolean }) {
  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 px-5 py-3"
      style={{ background: "rgba(17,17,23,0.92)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid var(--card-border)" }}
    >
      <div className="min-w-0">
        <p className="muv-text-meta text-[10px] uppercase tracking-widest">Grand Total</p>
        <p className="muv-text-solid text-base" style={{ fontWeight: 500 }}>₹{total}</p>
      </div>
      <Button variant="primary" onClick={onPlaceOrder} disabled={disabled || placing} aria-busy={placing} className="flex-shrink-0">
        {placing ? <Loader2 size={15} className="animate-spin" /> : "Place Order"}
      </Button>
    </div>
  );
}
