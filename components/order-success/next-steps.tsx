import Link from "next/link";
import { Package, LifeBuoy, ShoppingBag, FileText } from "lucide-react";

/**
 * Every card routes somewhere real. "Track Order" points at /account/orders
 * — real order history. "View Invoice" now opens the real, working
 * print-to-PDF invoice view (Founder Final Consolidated Polish, Part 2;
 * previously scrolled to this page's own invoice summary since no
 * downloadable invoice existed yet).
 */
export function NextSteps({ invoiceHref }: { invoiceHref: string }) {
  const steps = [
    { icon: Package, label: "Track Order", description: "See real-time status in your order history.", href: "/account/orders" },
    { icon: FileText, label: "Download Invoice", description: "GST invoice for this order.", href: invoiceHref },
    { icon: LifeBuoy, label: "Contact Support", description: "A real person reviews every enquiry.", href: "/contact" },
    { icon: ShoppingBag, label: "Continue Shopping", description: "Explore the rest of the range.", href: "/shop" },
  ];

  return (
    <section className="mt-16">
      <p className="muv-eyebrow mb-3">Next Steps</p>
      <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.5rem" }}>What happens now</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s) => (
          <Link key={s.label} href={s.href} target={s.href.startsWith("/invoice") ? "_blank" : undefined} className="muv-card muv-card-hover block">
            <s.icon size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
            <p className="muv-text-solid text-sm font-medium mt-3">{s.label}</p>
            <p className="muv-text-meta text-xs mt-1" style={{ lineHeight: 1.5 }}>{s.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
