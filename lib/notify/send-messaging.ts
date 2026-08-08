import { prisma } from "@/lib/prisma";
import { getMessagingProvider } from "@/lib/messaging";
import { retryWithBackoff } from "@/lib/retry";
import { logger } from "@/lib/logger";

/**
 * Mirrors lib/notify/send.ts's pattern exactly (log every attempt, retry
 * transient failures, never let a failure here bubble up and fail the
 * order/shipping operation it's reporting on) but for SMS/WhatsApp instead
 * of email. Kept as a separate file from send.ts because the two channels
 * have different template/content models (WhatsApp needs pre-approved
 * template names, not freeform HTML) — merging them would blur that
 * distinction rather than clarify it.
 */

async function logAttempt(channel: "SMS" | "WHATSAPP", type: string, recipient: string, status: "SENT" | "FAILED", relatedOrderId?: string, lastError?: string) {
  await prisma.notificationLog.create({ data: { channel, type, recipient, status, relatedOrderId, lastError } });
}

export async function sendOrderConfirmationSms(phone: string, orderNumber: string, relatedOrderId?: string) {
  const message = `Your Muv order #${orderNumber} is confirmed. Thank you for shopping with us!`;
  try {
    await retryWithBackoff(() => getMessagingProvider().sendSms(phone, message), { retries: 2 });
    await logAttempt("SMS", "order_confirmation", phone, "SENT", relatedOrderId);
  } catch (err) {
    await logAttempt("SMS", "order_confirmation", phone, "FAILED", relatedOrderId, err instanceof Error ? err.message : String(err));
    logger.error("notify:sms:failed", { type: "order_confirmation", phone, error: String(err) });
    throw err;
  }
}

/**
 * `templateName` must already exist as an approved template in whichever
 * provider's dashboard is configured (Meta/Twilio/MSG91/Interakt all require
 * pre-approval for business-initiated WhatsApp messages) — there is no
 * generic "send this text" WhatsApp path by design; Meta's policy doesn't
 * allow one.
 */
export async function sendShippingUpdateWhatsApp(phone: string, templateName: string, params: string[], relatedOrderId?: string) {
  try {
    await retryWithBackoff(() => getMessagingProvider().sendWhatsApp(phone, templateName, params), { retries: 2 });
    await logAttempt("WHATSAPP", "shipping_update", phone, "SENT", relatedOrderId);
  } catch (err) {
    await logAttempt("WHATSAPP", "shipping_update", phone, "FAILED", relatedOrderId, err instanceof Error ? err.message : String(err));
    logger.error("notify:whatsapp:failed", { type: "shipping_update", phone, error: String(err) });
    throw err;
  }
}

// Phase 18 — the two WhatsApp events named in the brief that weren't wired
// yet (Order Confirmation and Shipment already were). Same real provider
// call, same "templateName must already be approved in the provider's
// dashboard" constraint documented above — not something this codebase can
// verify exists, only wire correctly assuming it does.
export async function sendPaymentConfirmationWhatsApp(phone: string, params: string[], relatedOrderId?: string) {
  try {
    await retryWithBackoff(() => getMessagingProvider().sendWhatsApp(phone, "payment_confirmed", params), { retries: 2 });
    await logAttempt("WHATSAPP", "payment_confirmation", phone, "SENT", relatedOrderId);
  } catch (err) {
    await logAttempt("WHATSAPP", "payment_confirmation", phone, "FAILED", relatedOrderId, err instanceof Error ? err.message : String(err));
    logger.error("notify:whatsapp:failed", { type: "payment_confirmation", phone, error: String(err) });
    throw err;
  }
}

export async function sendDeliveryUpdateWhatsApp(phone: string, params: string[], relatedOrderId?: string) {
  try {
    await retryWithBackoff(() => getMessagingProvider().sendWhatsApp(phone, "order_delivered", params), { retries: 2 });
    await logAttempt("WHATSAPP", "delivery_update", phone, "SENT", relatedOrderId);
  } catch (err) {
    await logAttempt("WHATSAPP", "delivery_update", phone, "FAILED", relatedOrderId, err instanceof Error ? err.message : String(err));
    logger.error("notify:whatsapp:failed", { type: "delivery_update", phone, error: String(err) });
    throw err;
  }
}
