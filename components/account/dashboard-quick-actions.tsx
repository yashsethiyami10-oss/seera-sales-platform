import Link from "next/link";
import { Package, MapPin, User, LifeBuoy, ShoppingBag } from "lucide-react";

/** Every card links to a real, existing destination — no new routes invented here. */
const ACTIONS = [
  { icon: Package, label: "My Orders", href: "/account/orders" },
  { icon: MapPin, label: "Saved Addresses", href: "/account/profile" },
  { icon: User, label: "Profile", href: "/account/profile" },
  { icon: LifeBuoy, label: "Contact Support", href: "/contact" },
  { icon: ShoppingBag, label: "Continue Shopping", href: "/shop" },
];

export function DashboardQuickActions() {
  return (
    <section className="mb-10">
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} className="muv-card muv-card-hover flex flex-col items-center text-center gap-2" style={{ padding: "18px 10px" }}>
            <a.icon size={20} strokeWidth={1.3} style={{ color: "var(--lavender)" }} aria-hidden />
            <span className="muv-text-solid text-xs" style={{ fontWeight: 500 }}>{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
