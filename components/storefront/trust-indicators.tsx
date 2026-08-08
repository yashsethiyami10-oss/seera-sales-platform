import { MapPin, FileCheck, Truck, ShieldCheck, MessageSquareQuote, LifeBuoy, PackageX } from "lucide-react";
import type { ComponentType } from "react";
import { Reveal } from "@/components/ui/reveal";

type TrustItem = { icon: ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; heading: string; description: string };

/**
 * Every claim is evidence-based, per PHASE_3 §7's Trust Philosophy. The
 * brief's example sets (both PDP's and Cart's) include claims with no real
 * field to back them ("Dermatologically Tested", generic "Fast Delivery"
 * without a real number) — no certification field exists anywhere in the
 * schema. Rather than fabricate them, these are the honest equivalent: real,
 * checkable facts. Default set is PDP's original six, unchanged — Cart
 * (Phase 9A) passes its own real subset via `items`, a backward-compatible
 * addition that doesn't alter PDP's rendered output.
 */
const DEFAULT_TRUST_ITEMS: TrustItem[] = [
  { icon: MapPin, heading: "Made in India", description: "An affordable luxury from India — not an apology, a statement of confidence." },
  { icon: FileCheck, heading: "Real Ingredient Disclosure", description: "What's in it is listed on this page, in plain language — not hidden behind a QR code." },
  { icon: Truck, heading: "Transparent Shipping", description: "Standard delivery in 4–6 business days, or Express in 1–2 — shown before you pay." },
  { icon: ShieldCheck, heading: "Secure Checkout", description: "Payments are processed through Razorpay — your card details never touch our servers." },
  { icon: MessageSquareQuote, heading: "Genuine Reviews Only", description: "Ratings shown here are never filtered to only-positive, never fabricated." },
  { icon: LifeBuoy, heading: "Real Support", description: "A real person reviews every enquiry — reach us any time from our Contact page." },
];

export const CART_TRUST_ITEMS: TrustItem[] = [
  { icon: ShieldCheck, heading: "Secure Checkout", description: "Payments are processed through Razorpay — your card details never touch our servers." },
  { icon: Truck, heading: "Transparent Shipping", description: "Standard delivery in 4–6 business days, or Express in 1–2 — shown before you pay." },
  { icon: MapPin, heading: "Made in India", description: "An affordable luxury from India — not an apology, a statement of confidence." },
  { icon: PackageX, heading: "Easy Returns", description: "Arrived damaged, wrong, or defective? Start a return from our Returns page." },
  { icon: LifeBuoy, heading: "Real Support", description: "A real person reviews every enquiry — reach us any time from our Contact page." },
];

export function TrustIndicators({ items = DEFAULT_TRUST_ITEMS }: { items?: TrustItem[] }) {
  return (
    <section className="mt-16">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {items.map((item, i) => (
          <Reveal key={item.heading} delay={i * 0.04}>
            <div className="muv-card h-full text-center" style={{ padding: "18px 12px" }}>
              <item.icon size={20} strokeWidth={1.3} style={{ color: "var(--lavender)", margin: "0 auto" }} aria-hidden />
              <p className="muv-text-solid text-xs font-medium mt-2.5" style={{ lineHeight: 1.3 }}>{item.heading}</p>
              <span className="sr-only">{item.description}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
