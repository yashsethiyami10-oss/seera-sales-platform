import { z } from "zod";

export const orderStatusValues = [
  "PLACED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
] as const;

// Enforced server-side (not just disabled in the UI) — a request forged
// straight at the server action must not be able to skip steps or resurrect
// a cancelled order. Keys are current status, value is the set of statuses
// it's legal to move to next.
export const ALLOWED_TRANSITIONS: Record<(typeof orderStatusValues)[number], string[]> = {
  PLACED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  CANCELLED: [],
  RETURN_REQUESTED: ["RETURNED"],
  RETURNED: [],
};

// Phase 18 — guest checkout. A logged-in customer sends `addressId`
// (unchanged, references one of their own saved Address rows). A guest
// sends `guest` instead — their contact details plus a raw address, since
// they have no saved Address to reference yet. createOrder (actions/
// orders.ts) requires exactly one of the two, decided by whether a real
// session exists, not by which field the client happened to send — a
// request can't claim to be a guest order while a real session is present.
const guestAddressSchema = z.object({
  label: z.string().min(1).max(40).default("Home"),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
});

export const guestContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  address: guestAddressSchema,
});

export const createOrderSchema = z
  .object({
    addressId: z.string().cuid().optional(),
    guest: guestContactSchema.optional(),
    paymentMethod: z.enum(["UPI", "CARD", "NETBANKING", "COD"]),
    // Phase 1D correction pass — previously the client computed and
    // displayed an Express Delivery surcharge that was never sent here, so
    // createOrder always charged Standard's rate regardless of what was
    // shown at checkout. Defaults to STANDARD so any existing caller that
    // doesn't send this (there shouldn't be one after this change, but this
    // keeps the schema backward-compatible) gets the pre-existing behavior.
    shippingMethod: z.enum(["STANDARD", "EXPRESS"]).default("STANDARD"),
    couponCode: z.string().optional(),
    deliveryInstructions: z.string().max(300).optional(),
    items: z
      .array(
        z.object({
          variantId: z.string().cuid(),
          quantity: z.number().int().min(1).max(20),
        })
      )
      .min(1, "Your cart is empty"),
  })
  .refine((data) => !!data.addressId || !!data.guest, {
    message: "A delivery address is required",
    path: ["addressId"],
  });

export const updateOrderStatusSchema = z.object({
  orderId: z.string().cuid(),
  status: z.enum(orderStatusValues),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().cuid(),
  reason: z.string().min(3, "Let us know why so we can improve").max(300),
});

export const refundOrderSchema = z.object({
  orderId: z.string().cuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(3).max(300),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
