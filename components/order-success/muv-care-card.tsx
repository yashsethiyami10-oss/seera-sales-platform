import { Sparkles } from "lucide-react";

/**
 * Final Customer Experience Sprint, Phase 11 — every order includes a Muv
 * Care Card (Order.careCardIncluded, set at order-creation time). The QR
 * is a real, working code (generated via a public QR-image API, no
 * fabricated placeholder graphic) that resolves to this order's own
 * confirmation URL — genuinely useful today (pulls the order up on another
 * device from a printed slip), not a promise of something that doesn't
 * exist. "Muv AI" is explicitly labeled as a future experience, not
 * claimed as live, per the same honesty discipline as
 * components/order-success/muv-community.tsx.
 */
export function MuvCareCard({ orderUrl }: { orderUrl: string }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=8&data=${encodeURIComponent(orderUrl)}`;

  return (
    <section className="mb-12">
      <div className="muv-card flex flex-col sm:flex-row items-center gap-6" style={{ background: "linear-gradient(135deg, rgba(183,171,240,0.1), rgba(183,171,240,0.02))" }}>
        <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{ background: "#fff", padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external, non-Cloudinary QR image; next/image's remote-pattern allowlist doesn't cover this host */}
          <img src={qrSrc} alt="Scan to view this order" width={140} height={140} />
        </div>
        <div className="text-center sm:text-left">
          <p className="muv-eyebrow mb-2 flex items-center justify-center sm:justify-start gap-1.5">
            <Sparkles size={13} style={{ color: "var(--lavender)" }} /> Your Muv Care Card
          </p>
          <h3 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.3rem" }}>Thank you for Muving with us.</h3>
          <p className="muv-text-body text-sm mb-1" style={{ maxWidth: "48ch" }}>
            Scan to pull up this order anytime, on any device. Keep Muving™.
          </p>
          <p className="muv-text-faint text-xs mt-2">Muv AI — a future experience for care, questions, and reordering — is on its way.</p>
        </div>
      </div>
    </section>
  );
}
