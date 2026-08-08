"use client";

import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Mobile-only persistent bar. Deliberately does not duplicate size selection
 * or add-to-cart logic — that state already lives inside
 * ProductPurchasePanel, and re-implementing it here would risk adding the
 * wrong variant to the cart if the two ever drifted out of sync. Instead
 * this scrolls back up to the real purchase panel, which is exactly where
 * every action this bar could take already lives — a navigation aid, not a
 * second, competing transaction flow (PHASE_5 §11: never fork a one-off
 * component variant).
 */
export function StickyMobileCTA({ productName, price, outOfStock }: { productName: string; price: number; outOfStock: boolean }) {
  function scrollToPanel() {
    document.getElementById("purchase-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 px-5 py-3"
      style={{ background: "rgba(17,17,23,0.92)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid var(--card-border)" }}
    >
      <div className="min-w-0">
        <p className="muv-text-meta text-[10px] uppercase tracking-widest truncate">{productName}</p>
        <p className="muv-text-solid text-base" style={{ fontWeight: 500 }}>₹{price}</p>
      </div>
      <Button variant="primary" onClick={scrollToPanel} disabled={outOfStock} className="flex-shrink-0">
        {outOfStock ? "Unavailable" : <>Add to Cart <ArrowUp size={14} /></>}
      </Button>
    </div>
  );
}
