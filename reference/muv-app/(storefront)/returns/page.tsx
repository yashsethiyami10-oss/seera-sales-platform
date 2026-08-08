import { Clock, ShieldCheck, XCircle, MessageCircle } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Returns",
  description: "Muv's return and replacement policy — eligibility window, what's covered, and how to request one.",
  path: "/returns",
});

/**
 * Phase 1D — this is the approved, final Muv return/replacement policy
 * (previously this page deliberately stated no fixed window existed, since
 * none was defined anywhere in the codebase; one now is, and is enforced
 * server-side, not just stated here — see the 48-hour check in
 * actions/returns.ts's submitReturnRequest).
 */
export default function ReturnsPage() {
  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <p className="muv-eyebrow mb-5">Returns &amp; Replacements</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>
            If something arrived wrong.
          </h1>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="muv-card flex items-start gap-4 mb-6">
            <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
              <Clock size={16} />
            </span>
            <div>
              <p className="muv-text-solid text-sm font-medium mb-1.5">48-hour reporting window</p>
              <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
                Report an issue within 48 hours of your order being marked delivered. Requests submitted after that
                window can&rsquo;t be accepted through this process.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="muv-card flex items-start gap-4 mb-6">
            <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="muv-text-solid text-sm font-medium mb-1.5">What&rsquo;s covered</p>
              <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
                Damaged items, leaked bottles, and wrong products received. Photo or video evidence is required with
                every request so we can verify the issue.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.26}>
          <div className="muv-card flex items-start gap-4 mb-6">
            <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
              <XCircle size={16} />
            </span>
            <div>
              <p className="muv-text-solid text-sm font-medium mb-1.5">What&rsquo;s not covered</p>
              <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
                Used or consumed products, and change-of-mind requests, are not eligible for return or replacement.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.32}>
          <div className="muv-card flex items-start gap-4">
            <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
              <MessageCircle size={16} />
            </span>
            <div>
              <p className="muv-text-solid text-sm font-medium mb-1.5">How to request one</p>
              <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
                Open the order in{" "}
                <a href="/account/orders" className="muv-footer-link muv-text-solid">
                  your order history
                </a>{" "}
                and use &ldquo;Report an Issue / Request Replacement&rdquo; on the delivered order. After we verify
                your evidence, eligible requests are resolved by replacement, refund, or another outcome as
                appropriate — the final decision is subject to Muv&rsquo;s review. You can also{" "}
                <a href="/contact" className="muv-footer-link muv-text-solid">
                  contact us
                </a>{" "}
                directly with your order number.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
