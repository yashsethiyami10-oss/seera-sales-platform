import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/primitives";
import { NewsletterForm } from "@/components/storefront/newsletter-form";
import { DashboardQuickActions } from "@/components/account/dashboard-quick-actions";
import { FutureFeatures } from "@/components/account/future-features";
import { ChangePasswordButton } from "@/components/account/change-password-button";

export const metadata = buildMetadata({ title: "My Account", path: "/account", noIndex: true });

const SUPPORT_LINKS = [
  { label: "Contact Support", href: "/contact" },
  { label: "FAQs", href: "/faq" },
  { label: "Shipping Policy", href: "/shipping" },
  { label: "Returns Policy", href: "/returns" },
];

export default async function AccountDashboard() {
  const session = await auth();
  const customer = await prisma.customer.findUnique({
    where: { userId: session!.user.id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 3 },
      addresses: { where: { isDefault: true }, take: 1 },
    },
  });
  if (!customer) return null;

  const [completedOrders, totalOrders] = await Promise.all([
    prisma.order.count({ where: { customerId: customer.id, status: "DELIVERED" } }),
    prisma.order.count({ where: { customerId: customer.id } }),
  ]);

  const latestOrder = customer.orders[0];
  const defaultAddress = customer.addresses[0];

  return (
    <div>
      {/* ---- 1. Premium Welcome Hero — real data only ---- */}
      <h1 className="font-display text-white mb-1" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Welcome back, {customer.name.split(" ")[0]}.</h1>
      <p className="muv-text-meta text-sm mb-7">
        Member since {customer.createdAt.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        {latestOrder && <> · Last order {latestOrder.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</>}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="muv-card">
          <p className="font-display muv-text-solid" style={{ fontSize: 26, fontWeight: 500 }}>{completedOrders}</p>
          <p className="muv-text-meta text-xs mt-1">Completed Orders</p>
        </div>
        <div className="muv-card">
          <p className="font-display muv-text-solid" style={{ fontSize: 26, fontWeight: 500 }}>{totalOrders}</p>
          <p className="muv-text-meta text-xs mt-1">Total Orders</p>
        </div>
      </div>

      {/* ---- 2. Quick Actions ---- */}
      <DashboardQuickActions />

      {/* ---- 3. Recent Orders ---- */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Recent Orders</h2>
          {customer.orders.length > 0 && <Link href="/account/orders" className="text-xs" style={{ color: "var(--lavender)" }}>View all</Link>}
        </div>
        {customer.orders.length === 0 ? (
          <div className="muv-card text-center py-10">
            <p className="muv-text-meta text-sm mb-4">You haven&rsquo;t placed any orders yet.</p>
            <Link href="/shop" className="muv-btn-primary" style={{ display: "inline-flex" }}>Continue Shopping</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {customer.orders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="muv-card muv-card-hover flex items-center justify-between flex-wrap gap-3 block">
                <div>
                  <p className="font-display muv-text-solid text-sm" style={{ fontWeight: 500 }}>#{o.orderNumber}</p>
                  <p className="muv-text-meta text-xs mt-1">{o.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ₹{o.total}</p>
                </div>
                <Badge tone={o.status === "CANCELLED" ? "muted" : "positive"}>{o.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- 4. Saved Addresses ---- */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Saved Addresses</h2>
          <Link href="/account/profile" className="text-xs" style={{ color: "var(--lavender)" }}>Manage</Link>
        </div>
        {defaultAddress ? (
          <div className="muv-card">
            <span className="muv-tag-pill">{defaultAddress.label}</span>
            <span className="muv-tag-pill ml-2">Default</span>
            <p className="muv-text-body text-sm mt-2">{defaultAddress.line1}, {defaultAddress.city}, {defaultAddress.state} – {defaultAddress.pincode}</p>
          </div>
        ) : (
          <p className="muv-text-meta text-sm">No saved addresses yet.</p>
        )}
      </section>

      {/* ---- 5. Profile Information (summary — full editing on /account/profile) ---- */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Profile</h2>
          <Link href="/account/profile" className="text-xs" style={{ color: "var(--lavender)" }}>Edit</Link>
        </div>
        <div className="muv-card space-y-1">
          <p className="muv-text-solid text-sm">{customer.name}</p>
          <p className="muv-text-meta text-sm">{customer.email}</p>
          {customer.phone && <p className="muv-text-meta text-sm">{customer.phone}</p>}
        </div>
      </section>

      {/* ---- 6. Account Settings ---- */}
      <section className="mb-10">
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Account Settings</h2>
        <div className="muv-card space-y-3">
          <ChangePasswordButton email={customer.email} />
          <p className="muv-text-faint text-xs">Log out is always available from the header above.</p>
        </div>
      </section>

      {/* ---- 7. Support ---- */}
      <section className="mb-10">
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Support</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SUPPORT_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="muv-card muv-card-hover text-center" style={{ padding: "16px 10px" }}>
              <span className="muv-text-solid text-xs" style={{ fontWeight: 500 }}>{l.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- 8. Newsletter ---- */}
      <section className="mb-10">
        <div className="muv-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <p className="muv-text-solid text-sm font-medium mb-1">Join the movement</p>
            <p className="muv-text-meta text-sm">Early access to new launches, and nothing else.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>

      {/* ---- 9. Future Features ---- */}
      <FutureFeatures />
    </div>
  );
}
