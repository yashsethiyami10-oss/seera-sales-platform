import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { sendOrderConfirmationEmail } from "@/lib/notify/send";
import { logger } from "@/lib/logger";

/**
 * This webhook — not the client's post-payment redirect, and not
 * `verifyPayment`'s signature check alone — is the actual final source of
 * truth for payment status in production. `verifyPayment` (app/actions/
 * payments.ts) handles the common case where the browser successfully
 * returns from checkout.js, but a payment can also succeed or fail after
 * the browser has already closed/redirected/lost connection — this webhook
 * is what catches those cases and is why Razorpay recommends never relying
 * on the client-side callback alone.
 *
 * Configure this URL (https://yourdomain.com/api/webhooks/razorpay) in the
 * Razorpay dashboard, subscribed to at least `payment.captured` and
 * `payment.failed` events, with a webhook secret set as
 * RAZORPAY_WEBHOOK_SECRET (different from the API key secret).
 */
export async function POST(req: NextRequest) {
  // Signature verification needs the *raw* request body — parsing to JSON
  // first and re-serializing would produce a different byte sequence than
  // what Razorpay actually signed, and the signature check would fail even
  // for a genuine webhook.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    logger.warn("webhook:razorpay:invalid-signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  logger.info("webhook:razorpay:received", { event: event.event });

  try {
    switch (event.event) {
      case "payment.captured": {
        const payment = event.payload.payment.entity;
        const order = await prisma.order.findFirst({ where: { razorpayOrderId: payment.order_id } });
        if (!order) {
          logger.warn("webhook:razorpay:order-not-found", { razorpayOrderId: payment.order_id });
          break;
        }
        if (order.paymentStatus !== "PAID") {
          await prisma.$transaction([
            prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", razorpayPaymentId: payment.id } }),
            prisma.paymentAttempt.updateMany({ where: { orderId: order.id, razorpayOrderId: payment.order_id }, data: { status: "CAPTURED", razorpayPaymentId: payment.id } }),
          ]);
          sendOrderConfirmationEmail(order.id).catch((err) => logger.error("notify:order-confirmation:failed", { orderId: order.id, error: String(err) }));
        }
        break;
      }
      case "payment.failed": {
        const payment = event.payload.payment.entity;
        const order = await prisma.order.findFirst({ where: { razorpayOrderId: payment.order_id } });
        if (order) {
          await prisma.paymentAttempt.updateMany({
            where: { orderId: order.id, razorpayOrderId: payment.order_id },
            data: { status: "FAILED", failureReason: payment.error_description ?? "Payment failed" },
          });
        }
        break;
      }
      case "refund.processed": {
        const refund = event.payload.refund.entity;
        const order = await prisma.order.findFirst({ where: { razorpayPaymentId: refund.payment_id } });
        if (order) {
          const status = refund.amount === order.total * 100 ? "REFUNDED" : "PARTIALLY_REFUNDED";
          await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: status } });
        }
        break;
      }
      default:
        logger.info("webhook:razorpay:unhandled-event", { event: event.event });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Always return 200 once the signature is verified, even if our own
    // processing throws — returning an error status here makes Razorpay
    // retry the webhook, which can cause duplicate processing. Log the
    // failure and let it be investigated manually instead.
    logger.error("webhook:razorpay:processing-failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ received: true });
  }
}
