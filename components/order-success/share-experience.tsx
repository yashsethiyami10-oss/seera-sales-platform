import Link from "next/link";
import { MessageCircle, Instagram, Users, Star } from "lucide-react";
import { NewsletterForm } from "@/components/storefront/newsletter-form";

/**
 * WhatsApp share is real — `https://wa.me/?text=` is a public URL scheme,
 * not an API integration, so it genuinely works with zero backend. Instagram
 * has no equivalent generic share-URL for arbitrary link+text (unlike
 * WhatsApp), and "Refer a Friend" has no referral model anywhere in the
 * schema — both are shown, clearly labeled "coming soon," never a dead
 * link pretending to work (per the brief's "No fake integrations"). "Review
 * Product" links to the real product page for the first item in this
 * order — genuinely real, just not a fabricated review-submission widget
 * on this page itself. Newsletter reuses the existing, real NewsletterForm
 * (Phase 6C) — not rebuilt.
 */
export function ShareExperience({ firstProductSlug, firstProductName, orderNumber }: { firstProductSlug: string | null; firstProductName: string | null; orderNumber: string }) {
  const shareText = encodeURIComponent(`Just ordered from Muv — Home, Fabric, Body, Personal, and Car Care, held to one standard. Order #${orderNumber}`);

  return (
    <section className="mt-16">
      <p className="muv-eyebrow mb-3">Share Your Experience</p>
      <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.5rem" }}>Tell someone who'd love this</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {firstProductSlug && (
          <Link href={`/products/${firstProductSlug}`} className="muv-card muv-card-hover block">
            <Star size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
            <p className="muv-text-solid text-sm font-medium mt-3">Review {firstProductName}</p>
            <p className="muv-text-meta text-xs mt-1">Once you've had a chance to use it.</p>
          </Link>
        )}
        <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer noopener" className="muv-card muv-card-hover block">
          <MessageCircle size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
          <p className="muv-text-solid text-sm font-medium mt-3">Share on WhatsApp</p>
          <p className="muv-text-meta text-xs mt-1">Opens WhatsApp with a message ready.</p>
        </a>
        <div className="muv-card" style={{ opacity: 0.5, cursor: "not-allowed" }} aria-disabled>
          <Instagram size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
          <p className="muv-text-solid text-sm font-medium mt-3">Share on Instagram</p>
          <p className="muv-text-meta text-xs mt-1">Muving Soon™.</p>
        </div>
        <div className="muv-card" style={{ opacity: 0.5, cursor: "not-allowed" }} aria-disabled>
          <Users size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
          <p className="muv-text-solid text-sm font-medium mt-3">Refer a Friend</p>
          <p className="muv-text-meta text-xs mt-1">Muving Soon™.</p>
        </div>
      </div>

      <div className="muv-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          <p className="muv-text-solid text-sm font-medium mb-1">Join the movement</p>
          <p className="muv-text-meta text-sm">Early access to new launches, and nothing else.</p>
        </div>
        <NewsletterForm />
      </div>
    </section>
  );
}
