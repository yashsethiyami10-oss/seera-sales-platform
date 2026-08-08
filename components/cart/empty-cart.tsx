import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Aura, Button } from "@/components/ui/primitives";

/**
 * "Premium illustration space" via the same signature Aura motif already
 * used in the Hero (components/ui/primitives.tsx) — a real, existing brand
 * element, not a placeholder graphic or a fabricated illustration asset
 * that doesn't exist in the library.
 */
export function EmptyCart() {
  return (
    <div className="text-center py-28 relative overflow-hidden">
      <Aura size={420} style={{ top: "10%", left: "50%", transform: "translateX(-50%)" }} />
      <Reveal>
        <div className="relative z-10 flex flex-col items-center">
          <div className="muv-icon-circle mb-6" style={{ width: 64, height: 64 }} aria-hidden>
            <ShoppingBag size={24} />
          </div>
          <h1 className="font-display text-white mb-3" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>
            Your cart is quiet, for now.
          </h1>
          <p className="muv-text-meta text-sm mb-8" style={{ maxWidth: "42ch" }}>
            Nothing here yet — five categories are waiting, held to the same standard.
          </p>
          <Link href="/shop">
            <Button variant="primary">Explore Products</Button>
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
