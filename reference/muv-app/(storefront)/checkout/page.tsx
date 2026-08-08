import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { CheckoutClient } from "@/components/checkout/checkout-client";

export const metadata = buildMetadata({ title: "Checkout", path: "/checkout", noIndex: true });

/**
 * Phase 18 — guest checkout. Previously this redirected straight to /login
 * for anyone without a session; now it only does that for a session that
 * exists but somehow has no matching Customer row (a genuine data problem,
 * not a guest). A visitor with no session at all now renders CheckoutClient
 * in guest mode (customerId: null) instead of being turned away.
 */
export default async function CheckoutPage() {
  const [session, storeSettings] = await Promise.all([
    auth(),
    // Phase 1C (GAP-004) — same real, admin-editable shipping/COD settings
    // createOrder (actions/orders.ts) now actually charges, passed down so
    // CheckoutClient's displayed Standard Delivery price and COD
    // availability match what the server will really do.
    prisma.storeSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const shippingSettings = {
    shippingFee: storeSettings?.shippingFee ?? 49,
    freeShippingThreshold: storeSettings?.freeShippingThreshold ?? 499,
    codEnabled: storeSettings?.codEnabled ?? true,
    codFee: storeSettings?.codFee ?? 0,
  };

  if (!session?.user) {
    return <CheckoutClient customerId={null} customerName="" customerEmail="" customerPhone={null} addresses={[]} {...shippingSettings} />;
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    include: { addresses: { orderBy: { isDefault: "desc" } } },
  });
  if (!customer) {
    // A real session with no Customer profile is a genuine account-data
    // problem (not the guest path) — same redirect as before for this case.
    redirect("/login?callbackUrl=/checkout");
  }

  return (
    <CheckoutClient
      customerId={customer.id}
      customerName={customer.name}
      customerEmail={customer.email}
      customerPhone={customer.phone}
      addresses={customer.addresses}
      {...shippingSettings}
    />
  );
}
