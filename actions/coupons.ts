"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCouponSchema, updateCouponSchema, applyCouponSchema } from "@/lib/validations/coupon";

export async function createCoupon(input: unknown) {
  try {
    await requireStaff();
    const data = createCouponSchema.parse(input);
    const coupon = await prisma.coupon.create({ data });
    revalidatePath("/admin/marketing");
    return { success: true as const, data: coupon };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateCoupon(input: unknown) {
  try {
    await requireStaff();
    const { id, ...data } = updateCouponSchema.parse(input);
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Coupon");
    const coupon = await prisma.coupon.update({ where: { id }, data });
    revalidatePath("/admin/marketing");
    return { success: true as const, data: coupon };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteCoupon(id: string) {
  try {
    await requireStaff();
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Coupon");
    // Deactivate rather than delete if it's already been used — deleting
    // would orphan the couponId reference on past orders.
    if (existing.usedCount > 0) {
      await prisma.coupon.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.coupon.delete({ where: { id } });
    }
    revalidatePath("/admin/marketing");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Public — called from the cart page. Read-only: does not increment
 * usedCount (that only happens at order creation, see app/actions/orders.ts)
 * because a coupon that's merely previewed in the cart hasn't been "used"
 * yet, and the same code might get checked several times before checkout.
 */
export async function validateCoupon(input: unknown) {
  try {
    // Rate-limited by IP — 20/min, per SECURITY.md's original spec for this
    // endpoint. Without this, a coupon code is guessable by brute force
    // (short alphanumeric codes, no lockout) against a public, unauthenticated
    // action — this was the other endpoint flagged at P0 in AUDIT.md.
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`coupon-validate:${ip}`, 20, 60 * 1000);
    if (!allowed) throw new AppError("Too many attempts. Please wait a moment and try again.", 429, "RATE_LIMITED");

    const data = applyCouponSchema.parse(input);
    const coupon = await prisma.coupon.findUnique({ where: { code: data.code.toUpperCase() } });

    if (!coupon || !coupon.active) throw new AppError("Invalid or expired coupon code", 404, "INVALID_COUPON");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError("This coupon has expired", 400, "INVALID_COUPON");
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new AppError("This coupon has reached its usage limit", 400, "INVALID_COUPON");
    if (data.subtotal < coupon.minOrderValue) {
      throw new AppError(`Add ₹${coupon.minOrderValue - data.subtotal} more to use this coupon`, 400, "MIN_ORDER_NOT_MET");
    }

    const discount = coupon.type === "PERCENT" ? Math.round((data.subtotal * coupon.value) / 100) : coupon.value;
    return { success: true as const, data: { code: coupon.code, discount, type: coupon.type, value: coupon.value } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
