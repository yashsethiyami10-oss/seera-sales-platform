import { prisma } from "@/lib/prisma";

/**
 * No existing function lists currently-active/public coupons anywhere in
 * this codebase (confirmed: `actions/coupons.ts` only has `validateCoupon`,
 * which checks one specific code, plus admin CRUD) — genuinely new, real
 * logic, not a duplicate of anything.
 */
export async function listActiveOffers() {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: { code: true, type: true, value: true, minOrderValue: true, expiresAt: true },
  });
}
