"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, ForbiddenError, AppError } from "@/lib/errors";
import { createRazorpayOrder, verifyPaymentSignature, createRazorpayRefund } from "@/lib/payments/razorpay";
import { z } from "zod";
import { sendOrderConfirmationEmail, sendAdminFailedPaymentAlert } from "@/lib/notify/send";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notify/send-messaging";
import { logger } from "@/lib/logger";

/**
 * Phase 18 — guest checkout means these payment actions can no longer
 * assume a session always exists. A logged-in caller must still own the
 * order exactly as before (customer.userId === user.id). An unauthenticated
 * caller is only allowed through for an order whose Customer genuinely has
 * no linked account (a real guest order) — never an authenticated
 * customer's order. The order's real, unguessable cuid id (never put in a
 * URL, only ever held in the checkout page's own React state from the
 * createOrder response moments earlier) is what stands in for proof of
 * "this is the browser that just placed this order," the same trust model
 * most guest checkouts use.
 */
async function requireOrderAccess(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) throw new NotFoundError("Order");

  const session = await auth();
  if (session?.user) {
    if (order.customer.userId !== session.user.id) throw new ForbiddenError();
  } else if (order.customer.userId) {
    // Anonymous caller, but this order belongs to a real account — never
    // allowed, regardless of whether they somehow know the order id.
    throw new ForbiddenError();
  }

  return order;
}

/**
 * PAYMENT FLOW — how this connects to `createOrder` in app/actions/orders.ts:
 *
 *   1. `createOrder` runs first (stock check/decrement, GST calc, order row
 *      created with paymentStatus PENDING for any non-COD method).
 *   2. For non-COD orders, the client then calls `initiatePayment(orderId)`
 *      below, which creates the Razorpay order and opens checkout.js.
 *   3. Razorpay's checkout.js returns razorpay_order_id/payment_id/signature
 *      to the client on success → client calls `verifyPayment(...)`.
 *   4. On checkout.js failure/dismissal → client calls
 *      `recordFailedPayment(...)`, which does NOT cancel the order — it
 *      leaves room for `retryPayment(orderId)` to issue a fresh Razorpay
 *      order for the same MUV order, so the customer doesn't have to redo
 *      checkout from scratch. This is the "failed payment recovery" flow.
 *   5. Orders left PENDING payment past a cutoff (e.g. 30 minutes) should be
 *      auto-cancelled and restocked by a scheduled job — see the note at the
 *      bottom of this file; nothing here does that automatically yet.
 */

export async function initiatePayment(orderId: string) {
  try {
    const order = await requireOrderAccess(orderId);
    if (order.paymentStatus === "PAID") throw new AppError("This order is already paid", 409, "ALREADY_PAID");
    if (order.paymentMethod === "COD") throw new AppError("COD orders don't need online payment", 400, "NOT_APPLICABLE");

    const razorpayOrder = await createRazorpayOrder(order.total, order.orderNumber);

    await prisma.paymentAttempt.create({
      data: { orderId: order.id, razorpayOrderId: razorpayOrder.id, status: "CREATED" },
    });
    await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: razorpayOrder.id } });

    return {
      success: true as const,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      },
    };
  } catch (err) {
    logger.error("payment:initiate:failed", { orderId, error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

const verifyPaymentInput = z.object({
  orderId: z.string().cuid(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export async function verifyPayment(input: unknown) {
  try {
    const data = verifyPaymentInput.parse(input);
    const order = await requireOrderAccess(data.orderId);
    if (!order.razorpayOrderId) throw new AppError("No payment was initiated for this order", 400, "NO_PAYMENT_ATTEMPT");

    const isValid = verifyPaymentSignature({
      orderId: order.razorpayOrderId,
      paymentId: data.razorpayPaymentId,
      signature: data.razorpaySignature,
    });

    if (!isValid) {
      // A failed signature check is treated identically to a failed
      // payment — it either means the payment genuinely failed, or someone
      // is attempting to forge a "paid" response. Either way, the order
      // must not be marked paid.
      await prisma.paymentAttempt.updateMany({
        where: { orderId: order.id, razorpayOrderId: order.razorpayOrderId },
        data: { status: "FAILED", failureReason: "Signature verification failed" },
      });
      throw new AppError("Payment verification failed", 400, "INVALID_SIGNATURE");
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", razorpayPaymentId: data.razorpayPaymentId, razorpaySignature: data.razorpaySignature },
      }),
      prisma.paymentAttempt.updateMany({
        where: { orderId: order.id, razorpayOrderId: order.razorpayOrderId },
        data: { status: "CAPTURED", razorpayPaymentId: data.razorpayPaymentId },
      }),
    ]);

    // Best-effort — a notification failure must never roll back a
    // successful payment. See lib/notify/send.ts for its own retry/logging.
    sendOrderConfirmationEmail(order.id).catch((err) => logger.error("notify:order-confirmation:failed", { orderId: order.id, error: String(err) }));
    if (order.customer.phone) {
      // "payment_confirmed" must be a pre-approved WhatsApp template name in
      // whichever provider is configured — same placeholder-until-approved
      // caveat as sendShippingUpdateWhatsApp (actions/shipping.ts).
      sendPaymentConfirmationWhatsApp(order.customer.phone, [order.orderNumber, String(order.total)], order.id).catch((err) => logger.error("notify:whatsapp:failed", { orderId: order.id, error: String(err) }));
    }

    revalidatePath("/account/orders");
    revalidatePath("/admin/orders");
    return { success: true as const, data: { orderId: order.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const recordFailureInput = z.object({ orderId: z.string().cuid(), reason: z.string().max(300).optional() });

export async function recordFailedPayment(input: unknown) {
  try {
    const data = recordFailureInput.parse(input);
    const order = await requireOrderAccess(data.orderId);

    await prisma.paymentAttempt.updateMany({
      where: { orderId: order.id, razorpayOrderId: order.razorpayOrderId ?? undefined },
      data: { status: "FAILED", failureReason: data.reason ?? "Payment not completed" },
    });

    sendAdminFailedPaymentAlert(order.id, data.reason ?? "Payment not completed").catch((err) => logger.error("notify:admin-failed-payment:failed", { orderId: order.id, error: String(err) }));

    return { success: true as const, data: { orderId: order.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** The actual "recovery" step — issues a fresh Razorpay order for an
 * existing MUV order whose last payment attempt failed, so checkout doesn't
 * have to restart from the cart. */
export async function retryPayment(orderId: string) {
  try {
    const order = await requireOrderAccess(orderId);
    if (order.paymentStatus === "PAID") throw new AppError("This order is already paid", 409, "ALREADY_PAID");
    if (order.status === "CANCELLED") throw new AppError("This order was cancelled and can't be retried", 400, "ORDER_CANCELLED");

    return initiatePayment(orderId);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function processRefund(orderId: string, amountInRupees: number) {
  await requireStaff(); // enforced here too — this function is itself a directly callable Server Action
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Order");
  if (!order.razorpayPaymentId) throw new AppError("No captured payment to refund", 400, "NOTHING_TO_REFUND");

  const refund = await createRazorpayRefund(order.razorpayPaymentId, amountInRupees);
  logger.info("payment:refund:completed", { orderId, refundId: refund.id });
  return refund;
}

/**
 * SCHEDULED CLEANUP NOTE: orders left in PLACED + paymentStatus PENDING for
 * too long (customer abandoned checkout, payment page never completed) tie
 * up stock indefinitely if nothing ever cancels them. A Vercel Cron job
 * (or any scheduler) should call something like:
 *
 *   prisma.order.findMany({ where: { paymentStatus: "PENDING", paymentMethod: { not: "COD" }, createdAt: { lt: thirtyMinutesAgo } } })
 *
 * ...and run each through the same restock transaction `cancelOrder` uses
 * in app/actions/orders.ts. Not implemented as a route here since it needs
 * to be wired to whatever scheduler this deploys with (Vercel Cron,
 * a queue, etc.) — the query and restock logic are the only real parts,
 * both of which already exist elsewhere in this codebase.
 */
