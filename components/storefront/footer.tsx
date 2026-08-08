import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { InstagramIcon, FacebookIcon, XIcon } from "@/components/ui/social-icons";
import { NewsletterForm } from "@/components/storefront/newsletter-form";

const COLUMNS = [
  { title: "Shop", links: [
    { label: "Home Care", href: "/collections/home-care" },
    { label: "Fabric Care", href: "/collections/fabric-care" },
    { label: "Body Care", href: "/collections/body-care" },
    { label: "Personal Care", href: "/collections/personal-care" },
    { label: "Car Care", href: "/collections/car-care" },
  ]},
  { title: "Company", links: [
    { label: "Our Story", href: "/about" },
    { label: "Journal", href: "/journal" },
    { label: "Contact", href: "/contact" },
  ]},
  { title: "Support", links: [
    { label: "Track Order", href: "/account/orders" },
    { label: "Shipping", href: "/shipping" },
    { label: "Returns", href: "/returns" },
    { label: "FAQs", href: "/faq" },
  ]},
  // The footer's standing, always-available business/bulk entry point
  // (PHASE_6A §4.9) — independent of whether a visitor saw the homepage's
  // Business section. Points at /contact, same target the nav's "For
  // Business" link uses. The public submission form and its backend
  // (actions/inquiries.ts, the BusinessInquiry model) are real; as of
  // Phase 1C an admin management view exists at /admin/inquiries too.
  { title: "Business", links: [
    { label: "Bulk & Institutional Orders", href: "/contact" },
  ]},
];

/**
 * Phase 1C (GAP-009) — social links now read from the real, admin-editable
 * StoreSettings fields instead of linking to each platform's generic
 * homepage. An icon whose URL isn't configured simply doesn't render,
 * rather than pointing somewhere that isn't actually Muv. There is no
 * StoreSettings field for a YouTube URL, so that icon (previously a
 * hardcoded, always-wrong link) is not shown at all rather than inventing
 * one — see PHASE_1C_DECISION_LOG.md.
 */
function buildSocialLinks(settings: { instagramUrl: string | null; facebookUrl: string | null; twitterUrl: string | null } | null) {
  return [
    { label: "Instagram", href: settings?.instagramUrl, Icon: InstagramIcon },
    { label: "Facebook", href: settings?.facebookUrl, Icon: FacebookIcon },
    { label: "X (Twitter)", href: settings?.twitterUrl, Icon: XIcon },
  ].filter((link): link is { label: string; href: string; Icon: typeof InstagramIcon } => Boolean(link.href));
}

export async function Footer() {
  const [newsletter, storeSettings] = await Promise.all([
    prisma.newsletterContent.findUnique({ where: { id: "singleton" } }),
    prisma.storeSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const socialLinks = buildSocialLinks(storeSettings);

  return (
    <footer style={{ background: "var(--ink)", borderTop: "1px solid var(--hairline)" }} className="pt-24 pb-10 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Newsletter strip — top of the footer, its own visual beat before
            the link columns, matching the premium-D2C pattern (a genuine
            invitation, not squeezed into a corner). */}
        <div
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-14 mb-14"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div>
            <h3 className="font-display text-white text-2xl" style={{ fontWeight: 500 }}>
              {newsletter?.heading ?? "Stay close to the ritual"}
            </h3>
            <p className="muv-text-meta text-sm mt-2">{newsletter?.subtext ?? "Thoughtful updates from Muv, for the moments that matter most."}</p>
          </div>
          <NewsletterForm />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-10">
          <div className="col-span-2">
            <Image src="/logo.png" alt="Muv" width={150} height={57} style={{ height: "32px", width: "auto" }} />
            <p className="muv-text-meta text-sm mt-5 max-w-xs leading-6">
              Care for the rituals that carry life forward. <span style={{ color: "var(--lavender)", fontWeight: 500 }}>Keep Muving.</span>
            </p>
            <div className="mt-5 h-px w-16" style={{ background: "linear-gradient(90deg, rgba(183,171,240,0.6), transparent)" }} />
            <p className="mt-3 text-[11px] uppercase tracking-[0.28em]" style={{ color: "rgba(var(--text-rgb), 0.62)" }}>
              Care that keeps Muving
            </p>
            <div className="flex items-center gap-2.5 mt-6">
              {socialLinks.map(({ label, href, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer noopener" aria-label={label} className="muv-social-icon">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="muv-text-strong text-xs uppercase tracking-widest mb-5">{col.title}</p>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="muv-footer-link muv-text-meta hover:text-white text-sm">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 flex flex-col sm:flex-row justify-between gap-3 muv-text-faint text-xs" style={{ borderTop: "1px solid var(--hairline)" }}>
          <span>© 2026 Muv. All rights reserved.</span>
          <span>Designed &amp; built for the Keep Muving™ movement.</span>
        </div>
      </div>
    </footer>
  );
}
