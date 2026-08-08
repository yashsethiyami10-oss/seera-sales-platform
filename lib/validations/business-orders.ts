import { z } from "zod";
import { quotationLineInput } from "@/lib/validations/inst-sales";

// Milestone 4 — Order Management OS. A new, dedicated file (not folded into
// lib/validations/inst-sales.ts) matching this app's existing convention of
// giving each domain its own validation file (lib/validations/order.ts,
// customer.ts, master-data.ts) — BusinessOrder is a distinct domain from the
// Inst* sales-pipeline entities even though it currently originates from one.

const cuid = z.string().cuid();

export const businessOrderStatus = z.enum(["CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"]);

export const createBusinessOrderFromQuotationSchema = z.object({
  quotationVersionId: cuid,
});

// Milestone 4.2 — Direct Business Order Workflow. Reuses the exact same
// line-item shape createQuotation/reviseQuotation already validate with
// (lib/validations/inst-sales.ts's quotationLineInput, now exported) —
// products/quantities/prices/discounts are validated identically regardless
// of which workflow entered them.
export const createDirectBusinessOrderSchema = z.object({
  opportunityId: cuid,
  lineItems: z.array(quotationLineInput).min(1).max(100),
});

export const updateBusinessOrderStatusSchema = z.object({
  id: cuid,
  status: businessOrderStatus,
  reason: z.string().trim().min(3).max(500).optional(),
});

export const recordBusinessOrderDispatchSchema = z.object({
  id: cuid,
  carrierName: z.string().trim().max(150).optional().or(z.literal("")),
  trackingReference: z.string().trim().max(150).optional().or(z.literal("")),
  dispatchDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
});

export const listBusinessOrdersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: businessOrderStatus.optional(),
  ownerId: cuid.optional(),
  territoryId: cuid.optional(),
  customerId: cuid.optional(),
});

// listAllOrders (actions/order-mgmt.ts) spans both the frozen D2C OrderStatus
// enum and BusinessOrderStatus, so `status` is a constrained pattern rather
// than a strict union of one enum — still rejects anything malformed before
// it reaches Prisma, without hardcoding a second copy of D2C's status list
// here (that list belongs to lib/validations/order.ts, not this file).
// Milestone 6 — Dispatch & Delivery. Basic courier information only, per
// approved scope — no courier API integration.
export const businessOrderDispatchMethod = z.enum(["COURIER", "SELF_DELIVERY", "TRANSPORT"]);

export const dispatchBusinessOrderSchema = z.object({
  id: cuid,
  dispatchMethod: businessOrderDispatchMethod,
  dispatchedAt: z.coerce.date().optional(),
  carrierName: z.string().trim().max(150).optional().or(z.literal("")),
  trackingReference: z.string().trim().max(150).optional().or(z.literal("")),
  dispatchNotes: z.string().trim().max(1000).optional().or(z.literal("")),
}).refine(
  (data) => data.dispatchMethod !== "COURIER" || (!!data.carrierName?.trim() && !!data.trackingReference?.trim()),
  { message: "Courier name and tracking/reference number are required when dispatch method is Courier", path: ["carrierName"] },
);

export const deliverBusinessOrderSchema = z.object({
  id: cuid,
  deliveredAt: z.coerce.date().optional(),
  deliveryConfirmation: z.string().trim().max(200).optional().or(z.literal("")),
  deliveryRemarks: z.string().trim().max(1000).optional().or(z.literal("")),
});

// Founder/Admin-only correction path for already-recorded dispatch/delivery
// data — never a status change, always requires a stated reason (matches
// the existing CANCELLED-reason convention above).
export const amendBusinessOrderDispatchDeliverySchema = z.object({
  id: cuid,
  dispatchMethod: businessOrderDispatchMethod.optional(),
  carrierName: z.string().trim().max(150).optional().or(z.literal("")),
  trackingReference: z.string().trim().max(150).optional().or(z.literal("")),
  dispatchNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  deliveryConfirmation: z.string().trim().max(200).optional().or(z.literal("")),
  deliveryRemarks: z.string().trim().max(1000).optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

export const listAllOrdersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  channel: z.enum(["DIRECT", "INSTITUTIONAL"]).optional(),
  status: z.string().trim().regex(/^[A-Z_]+$/, "Invalid status").max(30).optional(),
  q: z.string().trim().max(100).optional(),
});
