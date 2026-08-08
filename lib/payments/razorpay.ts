import crypto from "crypto";
import { retryWithBackoff } from "@/lib/retry";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

/**
 * Thin wrapper over Razorpay's REST API using plain `fetch` rather than
 * their SDK — avoids an extra dependency for what's a handful of endpoints,
 * and keeps the retry/logging behavior consistent with the rest of this
 * codebase. Swap for the official `razorpay` npm package if preferred; the
 * function signatures below wouldn't need to change for callers.
 */

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

function authHeader() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    // Founder Final Consolidated Polish, Part 2 — root cause of "checkout
    // fails" for every online payment method: these credentials are unset
    // in this deployment (confirmed: not present at all in Vercel
    // Production env, not just empty). Previously a plain Error, which
    // `toErrorResponse` (lib/errors.ts) funneled into a generic "Something
    // went wrong" message — the real cause was logged server-side only and
    // never surfaced. AppError gives the customer an honest, actionable
    // message and a distinct error code, without leaking which credential
    // specifically. COD is unaffected — it never calls this function.
    throw new AppError(
      "Online payment isn't available right now — please choose Cash on Delivery, or try again shortly.",
      503,
      "PAYMENT_PROVIDER_UNCONFIGURED"
    );
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function razorpayFetch(path: string, init: RequestInit) {
  const res = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error: any = new Error(`Razorpay ${path} failed: ${res.status} ${body}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

/**
 * Creates a Razorpay order — this must happen before the client opens the
 * checkout sheet; Razorpay requires a server-created order id to attach the
 * payment to. Amount is in paise (Razorpay's unit), converted from this
 * app's rupee-Int money fields at the boundary.
 */
export async function createRazorpayOrder(amountInRupees: number, receipt: string): Promise<RazorpayOrder> {
  return retryWithBackoff(() =>
    razorpayFetch("/orders", {
      method: "POST",
      body: JSON.stringify({ amount: amountInRupees * 100, currency: "INR", receipt, payment_capture: 1 }),
    })
  );
}

/**
 * Verifies the signature Razorpay's checkout.js returns to the client after
 * payment — this is the check that proves the payment response actually
 * came from Razorpay and wasn't forged by someone calling your "mark as
 * paid" endpoint directly. NEVER mark an order paid without this check
 * passing (or the webhook's equivalent check in verifyWebhookSignature).
 */
export function verifyPaymentSignature(params: { orderId: string; paymentId: string; signature: string }): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is not set");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  // Constant-time comparison — a naive `===` leaks timing information about
  // how many leading characters matched, which is a real (if slow) attack
  // vector against signature checks. `timingSafeEqual` throws (rather than
  // returning false) when the buffers differ in length, which a malformed
  // or forged `signature` of arbitrary length can trigger — same reasoning
  // as verifyWebhookSignature below.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
  } catch {
    return false;
  }
}

/**
 * Verifies an inbound webhook's signature — a *different* secret from the
 * one above (Razorpay's dashboard has a separate "webhook secret" you
 * configure when registering the webhook URL). This is what
 * app/api/webhooks/razorpay/route.ts calls before trusting any webhook body.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    // Buffers of different length throw in timingSafeEqual rather than
    // returning false — treat that as "signature doesn't match", not a crash.
    return false;
  }
}

export async function createRazorpayRefund(paymentId: string, amountInRupees: number) {
  logger.info("razorpay:refund:initiated", { paymentId, amountInRupees });
  return retryWithBackoff(() =>
    razorpayFetch(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: amountInRupees * 100 }),
    })
  );
}
