import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { WishlistClient } from "@/components/account/wishlist-client";

export const metadata = buildMetadata({ title: "Wishlist", path: "/account/wishlist", noIndex: true });

export default async function WishlistPage() {
  const session = await auth();
  const customer = await prisma.customer.findUnique({ where: { userId: session!.user.id } });
  if (!customer) return null;

  const wishlist = await prisma.wishlist.findMany({
    where: { customerId: customer.id },
    include: { product: { include: { variants: { orderBy: { price: "asc" }, take: 1 } } } },
  });

  const shaped = wishlist.map((w) => ({
    id: w.id,
    productId: w.productId,
    name: w.product.name,
    slug: w.product.slug,
    image: w.product.images[0],
    price: w.product.variants[0]?.price ?? null,
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Wishlist</h1>
      <WishlistClient items={shaped} />
    </div>
  );
}
