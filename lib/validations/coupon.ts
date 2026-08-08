import { z } from "zod";

const couponBaseSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9]+$/, "Coupon codes are uppercase letters and numbers only")
    .transform((s) => s.toUpperCase()),
  type: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int().positive(),
  minOrderValue: z.number().int().min(0).default(0),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const percentValueRefinement = (v: { type: string; value: number }) => v.type !== "PERCENT" || v.value <= 100;

// .refine() wraps a schema in ZodEffects, which drops object methods like
// .partial() — so the base object is kept separate and each variant applies
// its own refinement, rather than chaining .partial() off the refined schema.
export const createCouponSchema = couponBaseSchema.refine(percentValueRefinement, {
  message: "Percent-type coupons cannot exceed 100",
  path: ["value"],
});

export const updateCouponSchema = couponBaseSchema
  .partial()
  .extend({ id: z.string().cuid(), active: z.boolean().optional() })
  .refine((v) => v.type !== "PERCENT" || v.value == null || v.value <= 100, {
    message: "Percent-type coupons cannot exceed 100",
    path: ["value"],
  });

export const applyCouponSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().int().min(0),
});
