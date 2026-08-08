import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Aura, Button } from "@/components/ui/primitives";

/**
 * Shown when the order number in the URL doesn't resolve to a real order
 * this signed-in customer actually owns — either genuinely missing, or
 * (deliberately, for security) presented identically when it belongs to
 * someone else, so this page can never be used to confirm whether an order
 * number exists. Same premium-empty-state treatment (the real Aura motif)
 * as components/cart/empty-cart.tsx, not a generic 404.
 */
export function OrderInvalid() {
  return (
    <div className="text-center py-28 relative overflow-hidden">
      <Aura size={380} style={{ top: "10%", left: "50%", transform: "translateX(-50%)" }} />
      <Reveal>
        <div className="relative z-10 flex flex-col items-center">
          <div className="muv-icon-circle mb-6" style={{ width: 64, height: 64 }} aria-hidden>
            <PackageSearch size={24} />
          </div>
          <h1 className="font-display text-white mb-3" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>
            We couldn&rsquo;t find that order.
          </h1>
          <p className="muv-text-meta text-sm mb-8" style={{ maxWidth: "42ch" }}>
            The order number may be incorrect, or it may not be associated with this account.
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link href="/account/orders"><Button variant="ghost">Go to Orders</Button></Link>
            <Link href="/shop"><Button variant="primary">Go to Shop</Button></Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
