import { prisma } from "@/lib/prisma";
import { CouponsTableClient } from "@/components/admin/coupons-table-client";

export default async function AdminMarketingPage() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });

  const shaped = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    minOrderValue: c.minOrderValue,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    active: c.active,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Marketing — Coupons</h1>
      <CouponsTableClient coupons={shaped} />
    </div>
  );
}
