import { prisma } from "@/lib/prisma";
import { OrdersAdminClient } from "@/components/admin/orders-admin-client";

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: true },
    take: 50,
  });

  const shaped = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customer: o.customer.name,
    total: o.total,
    status: o.status,
    paymentMethod: o.paymentMethod,
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Orders</h1>
      <OrdersAdminClient orders={shaped} />
    </div>
  );
}
