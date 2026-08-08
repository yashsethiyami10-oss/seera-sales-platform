import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

const STEPS = ["Your Info", "Delivery", "Payment", "Review"];

export function CheckoutHero({ step }: { step: number }) {
  return (
    <div className="mb-10">
      <Reveal>
        <p className="muv-text-meta text-xs uppercase tracking-widest mb-3">
          <Link href="/cart" className="muv-footer-link hover:text-white">Cart</Link> / Checkout
        </p>
      </Reveal>
      <Reveal delay={0.05}>
        <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "clamp(1.8rem,4vw,2.4rem)" }}>Checkout</h1>
        <p className="muv-text-body text-sm mb-8" style={{ maxWidth: "50ch" }}>
          A few real steps, nothing hidden until the end — your total is visible the whole way through.
        </p>
      </Reveal>

      {/* Founder Final Consolidated Polish, Part 2 — three genuinely
          distinct visual tiers, not two: current is dominant (solid white,
          bold label), completed is secondary (lavender check, body-weight
          label — visibly done, not just "not future"), future stays
          muted. Previously completed and future steps shared the same
          faint label weight, undercutting "completed" as its own tier. */}
      <div className="flex items-center gap-2 overflow-x-auto" role="list" aria-label="Checkout progress">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-shrink-0" role="listitem" aria-current={i === step ? "step" : undefined}>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
              style={{
                background: i < step ? "var(--lavender)" : i === step ? "#fff" : "rgba(120,120,130,0.25)",
                color: i <= step ? "#0b0b0f" : "rgba(var(--text-rgb),0.4)",
                boxShadow: i === step ? "0 0 0 3px rgba(183,171,240,0.25)" : "none",
                transition: "box-shadow 0.3s var(--ease), background 0.3s var(--ease)",
              }}
              aria-hidden
            >
              {i < step ? <Check size={12} /> : i + 1}
            </div>
            <span className={i === step ? "muv-text-solid text-xs font-medium" : i < step ? "muv-text-body text-xs" : "muv-text-meta text-xs"}>{label}</span>
            {i < STEPS.length - 1 && <div className="w-6 h-px" style={{ background: i < step ? "rgba(183,171,240,0.4)" : "var(--hairline)" }} aria-hidden />}
          </div>
        ))}
      </div>
    </div>
  );
}

export const CHECKOUT_STEPS = STEPS;
