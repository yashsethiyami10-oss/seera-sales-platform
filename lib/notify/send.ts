import { prisma } from "@/lib/prisma";
import { getEmailProvider } from "@/lib/notify/providers/email";
import { retryWithBackoff } from "@/lib/retry";
import { logger } from "@/lib/logger";
import {
  orderConfirmationEmail,
  shippingConfirmationEmail,
  deliveryConfirmationEmail,
  orderCancelledEmail,
  refundProcessedEmail,
  welcomeEmail,
  passwordResetEmail,
  orderProcessingEmail,
  adminNewOrderEmail,
  adminFailedPaymentEmail,
  adminNewInquiryEmail,
  adminNewReviewEmail,
  adminLowStockEmail,
} from "@/lib/notify/templates";

/**
 * Every send goes through this one function so logging + retry behavior is
 * identical regardless of which email it is. A failure here is always
 * caught by the caller (see the `.catch()` calls in app/actions/orders.ts
 * and payments.ts) — a notification failing to send must never fail the
 * order/payment operation it's reporting on.
 */
async function sendEmail(type: string, to: string, payload: { subject: string; html: string }, relatedOrderId?: string) {
  try {
    const result = await retryWithBackoff(() => getEmailProvider().send({ to, ...payload }), { retries: 2 });
    await prisma.notificationLog.create({
      data: { channel: "EMAIL", type, recipient: to, status: "SENT", relatedOrderId },
    });
    logger.info("notify:email:sent", { type, to, providerId: result.id });
    return result;
  } catch (err) {
    await prisma.notificationLog.create({
      data: {
        channel: "EMAIL",
        type,
        recipient: to,
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err),
        relatedOrderId,
      },
    });
    logger.error("notify:email:failed", { type, to, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function sendOrderConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
  if (!order) return;
  const { subject, html } = orderConfirmationEmail({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    total: order.total,
    items: order.items.map((i) => ({ name: i.nameAtPurchase, size: i.sizeAtPurchase, quantity: i.quantity })),
  });
  return sendEmail("order_confirmation", order.customer.email, { subject, html }, order.id);
}

export async function sendShippingConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, shipment: true } });
  if (!order || !order.shipment?.awbNumber) return;
  const { subject, html } = shippingConfirmationEmail({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    awbNumber: order.shipment.awbNumber,
    courierName: order.shipment.courierName ?? undefined,
    trackingUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/account/orders/${order.id}`,
  });
  return sendEmail("shipping_confirmation", order.customer.email, { subject, html }, order.id);
}

export async function sendDeliveryConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = deliveryConfirmationEmail({ orderNumber: order.orderNumber, customerName: order.customer.name });
  return sendEmail("delivery_confirmation", order.customer.email, { subject, html }, order.id);
}

export async function sendOrderCancelledEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = orderCancelledEmail({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    reason: order.cancelReason ?? undefined,
  });
  return sendEmail("order_cancelled", order.customer.email, { subject, html }, order.id);
}

export async function sendRefundProcessedEmail(orderId: string, amount: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = refundProcessedEmail({ orderNumber: order.orderNumber, customerName: order.customer.name, amount });
  return sendEmail("refund_processed", order.customer.email, { subject, html }, order.id);
}

export async function sendWelcomeEmail(email: string, name: string) {
  const { subject, html } = welcomeEmail({ customerName: name });
  return sendEmail("welcome", email, { subject, html });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const { subject, html } = passwordResetEmail({ resetUrl });
  return sendEmail("password_reset", email, { subject, html });
}

export async function sendOrderProcessingEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = orderProcessingEmail({ orderNumber: order.orderNumber, customerName: order.customer.name });
  return sendEmail("order_processing", order.customer.email, { subject, html }, order.id);
}

// ---------------------------------------------------------------------------
// Admin/staff alerts (Phase 18) — each checks its own StoreSettings toggle
// and a configured destination address before sending anything; both
// default to "on" but with no address configured, nothing goes out (never
// guesses/fabricates an admin email). Every call site is fire-and-forget,
// same as every customer email above — a notification failure never blocks
// the real operation it's reporting on.
// ---------------------------------------------------------------------------

async function getAdminAlertTarget(toggle: "notifyAdminNewOrder" | "notifyAdminFailedPayment" | "notifyAdminLowStock" | "notifyAdminNewInquiry" | "notifyAdminNewReview") {
  const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.adminNotificationEmail || !settings[toggle]) return null;
  return settings.adminNotificationEmail;
}

export async function sendAdminNewOrderAlert(orderId: string) {
  const to = await getAdminAlertTarget("notifyAdminNewOrder");
  if (!to) return;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = adminNewOrderEmail({ orderNumber: order.orderNumber, customerName: order.customer.name, total: order.total, paymentMethod: order.paymentMethod });
  return sendEmail("admin_new_order", to, { subject, html }, order.id);
}

export async function sendAdminFailedPaymentAlert(orderId: string, reason: string) {
  const to = await getAdminAlertTarget("notifyAdminFailedPayment");
  if (!to) return;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;
  const { subject, html } = adminFailedPaymentEmail({ orderNumber: order.orderNumber, customerName: order.customer.name, reason });
  return sendEmail("admin_failed_payment", to, { subject, html }, order.id);
}

export async function sendAdminNewInquiryAlert(data: { name: string; businessType: string; email: string }) {
  const to = await getAdminAlertTarget("notifyAdminNewInquiry");
  if (!to) return;
  const { subject, html } = adminNewInquiryEmail(data);
  return sendEmail("admin_new_inquiry", to, { subject, html });
}

export async function sendAdminNewReviewAlert(data: { productName: string; customerName: string; rating: number }) {
  const to = await getAdminAlertTarget("notifyAdminNewReview");
  if (!to) return;
  const { subject, html } = adminNewReviewEmail(data);
  return sendEmail("admin_new_review", to, { subject, html });
}

export async function sendAdminLowStockAlert(data: { productName: string; size: string; quantity: number }) {
  const to = await getAdminAlertTarget("notifyAdminLowStock");
  if (!to) return;
  const { subject, html } = adminLowStockEmail(data);
  return sendEmail("admin_low_stock", to, { subject, html });
}
