import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({ title: "Terms of Service", description: "The terms that apply to using Muv and placing an order.", path: "/terms" });

/**
 * Real and general — no fabricated liability limitations, dispute-resolution
 * clauses, or jurisdiction-specific language this project has no legal
 * authority to draft. States what's actually true about how orders and
 * pricing work on this platform; points to a real person for anything
 * requiring an actual legal answer. Same honesty discipline as /returns
 * and /privacy.
 */
export default function TermsPage() {
  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="max-w-2xl mx-auto">
        <Reveal><p className="muv-eyebrow mb-5">Terms</p></Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>Terms of Service</h1>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="space-y-6 muv-text-body text-sm" style={{ lineHeight: 1.8 }}>
            <p>
              Placing an order on Muv is an offer to purchase at the price shown at checkout, including GST — the
              price you see is the price you pay, with no hidden charges added afterward.
            </p>
            <p>
              Payments are processed securely through Razorpay. An order is confirmed once payment is verified
              (or immediately, for Cash on Delivery). Stock is reserved at the moment your order is placed, not
              earlier.
            </p>
            <p>
              For return and refund terms, see our{" "}
              <Link href="/returns" className="muv-footer-link muv-text-solid">Returns</Link> page. For how your
              information is handled, see our{" "}
              <Link href="/privacy" className="muv-footer-link muv-text-solid">Privacy Policy</Link>.
            </p>
            <p className="muv-text-meta text-xs">
              For anything not covered plainly here,{" "}
              <Link href="/contact" className="muv-footer-link">contact us</Link> directly — we'd rather clarify
              than leave it ambiguous.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
