import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { OrdersListClient } from "@/components/account/orders-list-client";

export const metadata = buildMetadata({ title: "Order History", path: "/account/orders", noIndex: true });

export default async function OrdersPage() {
  const session = await auth();
  const customer = await prisma.customer.findUnique({ where: { userId: session!.user.id } });
  if (!customer) return null;

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  const shaped = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    date: o.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    total: o.total,
    status: o.status,
    itemCount: o.items.length,
    // Founder Final Consolidated Polish, Part 3 — matches the server-side
    // rule in actions/orders.ts's cancelOrder exactly: only before Packed.
    canCancel: o.status === "PLACED",
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Order History</h1>
      <OrdersListClient orders={shaped} />
    </div>
  );
}
