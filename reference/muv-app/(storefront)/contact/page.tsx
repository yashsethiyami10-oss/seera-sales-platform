import { Mail, Phone, MapPin, ArrowDown } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { BusinessInquiryForm } from "@/components/storefront/business-inquiry-form";
import { buildMetadata, buildBreadcrumbSchema } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Contact & Business Enquiries",
  description:
    "Get in touch with Muv, or enquire about bulk and institutional supply for hotels, hospitals, restaurants, offices, car washes, and laundry operations.",
  path: "/contact",
});

/**
 * Real contact details only — pulled from configured env vars, never
 * hardcoded placeholders. WAREHOUSE_PHONE/WAREHOUSE_ADDRESS_LINE1 aren't
 * filled in yet (confirmed empty in .env), so those blocks simply don't
 * render until they are — no fabricated phone number or address.
 */
const CONTACT_EMAIL = process.env.EMAIL_FROM_ADDRESS?.match(/<(.+)>/)?.[1] ?? "orders@muv.co.in";
const CONTACT_PHONE = process.env.WAREHOUSE_PHONE || null;
const CONTACT_ADDRESS = process.env.WAREHOUSE_ADDRESS_LINE1 || null;

export default function ContactPage() {
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Contact", path: "/contact" },
  ]);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* ---- Hero ---- */}
      <section className="px-6" style={{ paddingTop: 96, paddingBottom: 64 }}>
        <div className="max-w-7xl mx-auto text-center" style={{ maxWidth: "62ch" }}>
          <Reveal>
            <p className="muv-eyebrow mb-5">Get in Touch</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3.2rem)", lineHeight: 1.15 }}>
              Talk to Muv.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="muv-text-body mt-6" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.8 }}>
              Muv is premium home, fabric, body, personal, and car care, made in India. Whether you have a
              general question or you&rsquo;re supplying a hotel, hospital, restaurant, office, car wash, or
              laundry operation, this is the fastest way to reach a real person.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <a
              href="#enquiry-form"
              className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest inline-flex items-center gap-2 mt-8"
            >
              Jump to the enquiry form <ArrowDown size={13} />
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---- Contact information ---- */}
      <section className="px-6 pb-8">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="muv-business-panel grid grid-cols-1 sm:grid-cols-3 gap-8">
              <div className="flex items-start gap-3">
                <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
                  <Mail size={16} />
                </span>
                <div>
                  <p className="muv-text-meta text-xs uppercase tracking-widest mb-1.5">Email</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="muv-footer-link muv-text-solid text-sm break-all">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>

              {CONTACT_PHONE && (
                <div className="flex items-start gap-3">
                  <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
                    <Phone size={16} />
                  </span>
                  <div>
                    <p className="muv-text-meta text-xs uppercase tracking-widest mb-1.5">Phone</p>
                    <a href={`tel:${CONTACT_PHONE}`} className="muv-footer-link muv-text-solid text-sm">
                      {CONTACT_PHONE}
                    </a>
                  </div>
                </div>
              )}

              {CONTACT_ADDRESS && (
                <div className="flex items-start gap-3">
                  <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
                    <MapPin size={16} />
                  </span>
                  <div>
                    <p className="muv-text-meta text-xs uppercase tracking-widest mb-1.5">Address</p>
                    <p className="muv-text-solid text-sm">{CONTACT_ADDRESS}</p>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Business inquiry ---- */}
      <section id="enquiry-form" className="px-6 py-20 md:py-28 scroll-mt-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <Reveal>
              <p className="muv-eyebrow mb-5">For Business</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>
                Supplied in bulk, for businesses that never stop Muving™.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="muv-text-meta text-sm mt-4" style={{ lineHeight: 1.7 }}>
                Tell us a little about your business and what you need — a real person from our business team
                reviews every enquiry and follows up directly, usually within 1–2 business days.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.24}>
            <BusinessInquiryForm />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
