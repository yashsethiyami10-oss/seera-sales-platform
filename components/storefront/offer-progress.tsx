import { Gift, Truck, Check } from "lucide-react";
import { getOfferProgress } from "@/lib/utils/offer";

/**
 * Final Customer Experience Sprint, Phase 10 — shown in Cart and Checkout,
 * where a real, live subtotal exists to measure progress against. Reused
 * as-is in both places rather than forked per the brief's own "no fake
 * integrations / one real signal" discipline already established elsewhere
 * in this codebase.
 */
export function OfferProgress({ subtotal, threshold }: { subtotal: number; threshold: number }) {
  const { remaining, unlocked } = getOfferProgress(subtotal, threshold);

  return (
    <div className="muv-card" style={{ padding: "14px 18px" }}>
      {unlocked ? (
        <p className="muv-text-solid text-sm font-medium flex items-center gap-2">
          <Check size={15} style={{ color: "var(--lavender)" }} /> You've unlocked Free Delivery + a Surprise Sample
        </p>
      ) : (
        <p className="muv-text-body text-sm">
          <span className="muv-text-solid font-medium">₹{remaining}</span> away from unlocking:
        </p>
      )}
      <div className="flex items-center gap-4 mt-2">
        <span className="muv-text-meta text-xs flex items-center gap-1.5"><Gift size={13} style={{ color: unlocked ? "var(--lavender)" : undefined }} /> Surprise Sample</span>
        <span className="muv-text-meta text-xs flex items-center gap-1.5"><Truck size={13} style={{ color: unlocked ? "var(--lavender)" : undefined }} /> Free Delivery</span>
      </div>
      <p className="muv-text-faint text-[11px] mt-2">Every order includes a Muv Care Card.</p>
    </div>
  );
}
