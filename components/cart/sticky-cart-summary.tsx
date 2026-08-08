"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Same fixed-bottom-bar pattern as PDP's StickyMobileCTA
 * (components/storefront/sticky-mobile-cta.tsx) — not duplicated logic,
 * just the same real, established mobile pattern applied to the cart's own
 * real total.
 */
export function StickyCartSummary({ total }: { total: number }) {
  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 px-5 py-3"
      style={{ background: "rgba(17,17,23,0.92)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid var(--card-border)" }}
    >
      <div className="min-w-0">
        <p className="muv-text-meta text-[10px] uppercase tracking-widest">Total</p>
        <p className="muv-text-solid text-base" style={{ fontWeight: 500 }}>₹{total}</p>
      </div>
      <Link href="/checkout" className="flex-shrink-0">
        <Button variant="primary">Checkout <ChevronRight size={15} /></Button>
      </Link>
    </div>
  );
}
