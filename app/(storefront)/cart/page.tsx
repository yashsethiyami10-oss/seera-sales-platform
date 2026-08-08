import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { CartClient } from "@/components/cart/cart-client";
import type { FeaturedProduct } from "@/components/storefront/featured-products";
import { extractUSP } from "@/lib/utils/extract-usp";

export const metadata = buildMetadata({ title: "Your Cart", path: "/cart", noIndex: true });

/**
 * Server Component wrapper — cart state itself is client-only (localStorage,
 * see lib/cart-context.tsx), but "Recommended Products" (Phase 9A §5) needs
 * a real server query, and the interactive cart is extracted into
 * CartClient (same page.tsx-wraps-a-client-component pattern already used
 * by components/checkout/checkout-client.tsx) so this can stay a Server
 * Component rather than fetching recommendations through a new client-side
 * API call.
 */
export default async function CartPage() {
  const [featuredRaw, session, storeSettings] = await Promise.all([
    prisma.product.findMany({
      where: { isFeatured: true, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { category: true, variants: { orderBy: { price: "asc" }, include: { inventory: true } }, reviews: { where: { status: "APPROVED" } }, content: { select: { keyBenefits: true } } },
    }),
    auth(),
    // Phase 1C (GAP-004) — real, admin-editable shipping settings, passed
    // to CartClient so its displayed estimate matches what createOrder
    // (actions/orders.ts) actually charges. Same fallback values as before
    // if the singleton row doesn't exist yet.
    prisma.storeSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  let wishlistedIds: string[] = [];
  if (session?.user && featuredRaw.length > 0) {
    const customer = await prisma.customer.findUnique({ where: { userId: session.user.id } });
    if (customer) {
      const entries = await prisma.wishlist.findMany({
        where: { customerId: customer.id, productId: { in: featuredRaw.map((p) => p.id) } },
        select: { productId: true },
      });
      wishlistedIds = entries.map((e) => e.productId);
    }
  }

  const recommendedProducts: FeaturedProduct[] = featuredRaw.map((p, i) => {
    const sortedVariants = [...p.variants].sort((a, b) => {
      const aInStock = (a.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      const bInStock = (b.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      return aInStock !== bInStock ? aInStock - bInStock : a.price - b.price;
    });
    const v = sortedVariants[0];
    const variant = v ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 } : null;
    const rating = p.reviews.length ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length : null;
    const badge: FeaturedProduct["badge"] = variant && variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold ? "Limited" : i === 0 ? "New" : null;
    return { id: p.id, name: p.name, slug: p.slug, category: { name: p.category.name }, images: p.images, usp: extractUSP(p.content?.keyBenefits ?? null), badge, rating, reviewCount: p.reviews.length, variant };
  });

  return (
    <CartClient
      recommendedProducts={recommendedProducts}
      wishlistedIds={wishlistedIds}
      shippingFee={storeSettings?.shippingFee ?? 49}
      freeShippingThreshold={storeSettings?.freeShippingThreshold ?? 499}
    />
  );
}
