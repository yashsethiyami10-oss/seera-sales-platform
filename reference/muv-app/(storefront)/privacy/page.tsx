import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({ title: "Privacy Policy", description: "How Muv handles your personal data.", path: "/privacy" });

/**
 * Real, general, honest — no fabricated specific clauses (data retention
 * periods, third-party processor names, etc.) this project has no authority
 * to state. Same treatment as /returns (built in Phase 6D): states what's
 * actually true about how the platform is built, points to a real person
 * for anything specific, never invents a legal claim.
 */
export default function PrivacyPage() {
  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="max-w-2xl mx-auto">
        <Reveal><p className="muv-eyebrow mb-5">Privacy</p></Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>Privacy Policy</h1>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="space-y-6 muv-text-body text-sm" style={{ lineHeight: 1.8 }}>
            <p>
              Muv collects the information needed to take and fulfil an order — your name, contact details,
              delivery address, and order history — and nothing beyond that. Payment details are handled
              directly by Razorpay; your card or bank details never reach Muv's own servers.
            </p>
            <p>
              Account information is used to let you track orders, save addresses, and reorder faster. Marketing
              communication is opt-in — see the checkbox on your account profile — and can be withdrawn at any
              time.
            </p>
            <p>
              You can request access to, correction of, or deletion of your personal data at any time by{" "}
              <Link href="/contact" className="muv-footer-link muv-text-solid">contacting us</Link>.
            </p>
            <p className="muv-text-meta text-xs">
              For specific questions about how your data is handled, reach us directly rather than relying on this
              page alone — we'd rather give you a straight answer than a boilerplate one.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
