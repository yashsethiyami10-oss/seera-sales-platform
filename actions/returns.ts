"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCustomer, requireStaff } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  submitReturnRequestSchema,
  updateReturnRequestStatusSchema,
  returnEvidenceUploadRequestSchema,
  returnRequestStatusValues,
  RETURN_REQUEST_ALLOWED_TRANSITIONS,
} from "@/lib/validations/returns";
import { paginationSchema, paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

// Phase 1D — the approved policy's reporting deadline: 48 hours from
// delivery, enforced here (not just in the UI) so a request forged straight
// at this server action can't bypass the window either.
const REPORT_WINDOW_HOURS = 48;

function generateTicketNumber() {
  return `RET${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Same collision-retry shape as withOrderNumberRetry in actions/orders.ts —
 * ticketNumber is a unique column backed by the same bare random 6-digit
 * generator. */
async function withTicketNumberRetry<T>(attempt: (ticketNumber: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await attempt(generateTicketNumber());
    } catch (err) {
      const isCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("ticketNumber");
      if (!isCollision || i === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Signs a Cloudinary upload for return-evidence photos/videos — same
 * signing mechanics as getUploadUrl (actions/media.ts), but customer-gated
 * (requireCustomer, not requireStaff) since this is the customer's own
 * evidence upload, not an admin media-library entry. Deliberately doesn't
 * write a MediaAsset row — MediaAsset is the admin-curated media library;
 * the resulting URL is instead attached directly to the ReturnRequest via
 * submitReturnRequest below.
 */
export async function getReturnEvidenceUploadUrl(input: unknown) {
  try {
    const user = await requireCustomer();
    const data = returnEvidenceUploadRequestSchema.parse(input);

    const { allowed } = checkRateLimit(`return-evidence-upload:${user.id}`, 20, 60 * 60 * 1000);
    if (!allowed) throw new AppError("Too many uploads. Please try again later.", 429, "RATE_LIMITED");

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Missing Cloudinary configuration. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "Returns";
    const paramsToSign = { folder, timestamp };

    const signature = createHash("sha256")
      .update(
        `${Object.entries(paramsToSign)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}${apiSecret}`
      )
      .digest("hex");

    return { success: true as const, data: { cloudName, apiKey, timestamp, signature, folder } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Customer-facing "Report an Issue / Request Replacement". A Phase 1
 * commerce-support ticket — not a courier reverse-pickup record (that's
 * ReturnShipment/initiateReturnShipment in actions/shipping.ts, a separate,
 * pre-existing, currently-unwired feature) and not a future CRM module.
 */
export async function submitReturnRequest(input: unknown) {
  try {
    const user = await requireCustomer();
    const data = submitReturnRequestSchema.parse(input);

    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      include: { shipment: true, items: true },
    });
    if (!order || order.customerId !== customer.id) throw new NotFoundError("Order");

    const orderItem = order.items.find((i) => i.id === data.orderItemId);
    if (!orderItem) throw new NotFoundError("Order item");

    if (order.status !== "DELIVERED") {
      throw new AppError("Only delivered orders are eligible to report an issue", 400, "NOT_DELIVERED");
    }

    // Prefer the real courier-confirmed delivery timestamp; fall back to
    // when the order row was last touched (which is when staff manually
    // flipped status to DELIVERED, for orders with no Shipment tracking
    // record) — same fallback documented for this feature during planning.
    const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
    const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceDelivery > REPORT_WINDOW_HOURS) {
      throw new AppError(
        `This order was delivered more than ${REPORT_WINDOW_HOURS} hours ago and is no longer eligible to report an issue`,
        400,
        "REPORT_WINDOW_EXPIRED"
      );
    }

    const existing = await prisma.returnRequest.findFirst({
      where: { orderItemId: data.orderItemId, status: { notIn: ["REJECTED", "RESOLVED"] } },
    });
    if (existing) {
      throw new AppError(`A request for this item is already open (ticket ${existing.ticketNumber})`, 409, "REQUEST_ALREADY_OPEN");
    }

    const returnRequest = await withTicketNumberRetry((ticketNumber) =>
      prisma.returnRequest.create({
        data: {
          ticketNumber,
          orderId: order.id,
          orderItemId: orderItem.id,
          customerId: customer.id,
          issueType: data.issueType,
          description: data.description,
          evidenceUrls: data.evidenceUrls,
          contactPhone: data.contactPhone,
        },
      })
    );

    revalidatePath(`/account/orders/${order.id}`);
    revalidatePath("/admin/returns");

    return { success: true as const, data: { id: returnRequest.id, ticketNumber: returnRequest.ticketNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Phase 5.4 (Customer Intelligence) self-service reads. No customer-facing
 * "get my return status" read existed before this — the order detail page
 * only reads `order.returnRequests` inline off its own already-fetched
 * `Order` include (`app/account/orders/[id]/page.tsx`). Same ownership
 * discipline as that page and as `actions/orders.ts`'s new reads: resolve
 * the real Customer row from the session, never trust a caller-supplied id.
 */
export async function getMyReturnRequests() {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return { success: true as const, data: [] };

    const requests = await prisma.returnRequest.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    });
    return { success: true as const, data: requests };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** `ReturnShipment` (reverse-logistics courier pickup) is a distinct model
 * from `ReturnRequest` above (the per-item support ticket) — see
 * `initiateReturnShipment` in actions/shipping.ts, which creates it. This
 * reads its current status only; ownership is enforced via the parent
 * Order, since `ReturnShipment` itself has no `customerId` column. */
export async function getReturnShipmentStatus(orderId: string) {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { returnShipment: true } });
    if (!order || order.customerId !== customer.id) throw new NotFoundError("Order");

    return { success: true as const, data: order.returnShipment };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const returnRequestQuerySchema = paginationSchema.extend({
  status: z.enum(returnRequestStatusValues).optional(),
});

export async function listReturnRequests(input: unknown) {
  try {
    await requireStaff();
    const query = returnRequestQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where: Prisma.ReturnRequestWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          order: { select: { orderNumber: true } },
          orderItem: { select: { nameAtPurchase: true, sizeAtPurchase: true } },
          customer: { select: { name: true, email: true, phone: true } },
        },
      }),
      prisma.returnRequest.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateReturnRequestStatus(input: unknown) {
  try {
    await requireStaff();
    const data = updateReturnRequestStatusSchema.parse(input);

    const returnRequest = await prisma.returnRequest.findUnique({ where: { id: data.returnRequestId } });
    if (!returnRequest) throw new NotFoundError("Return request");

    const allowed = RETURN_REQUEST_ALLOWED_TRANSITIONS[returnRequest.status];
    if (!allowed.includes(data.status)) {
      throw new AppError(`Can't move a request from ${returnRequest.status} to ${data.status}`, 400, "INVALID_TRANSITION");
    }

    // Never auto-approve refunds — per the Phase 1D defect log, APPROVED
    // only records that evidence checked out; the actual refund/replacement
    // dispatch is a separate, deliberate staff action elsewhere (refundOrder
    // in actions/orders.ts, or a manual replacement order), never implied by
    // this status change alone.
    await prisma.returnRequest.update({
      where: { id: data.returnRequestId },
      data: { status: data.status, adminNotes: data.adminNotes },
    });

    revalidatePath("/admin/returns");
    revalidatePath(`/account/orders/${returnRequest.orderId}`);

    return { success: true as const, data: { status: data.status } };
  } catch (err) {
    logger.error("returns:update-status:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}
