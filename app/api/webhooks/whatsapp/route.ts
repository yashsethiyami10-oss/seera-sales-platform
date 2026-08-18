import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { recordAudit } from "@/lib/foundation/audit-service";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";

/**
 * Seera's own dedicated WhatsApp Cloud API webhook — GET handles Meta's one-time subscription
 * verification handshake, POST ingests delivery-status and inbound-message events for every
 * message this app sends via lib/messaging/providers/whatsapp-business.ts. This is the only
 * inbound channel that updates OutboxEvent rows past PUBLISHED (to DELIVERED/READ/FAILED) — see
 * prisma/schema.prisma's OutboxEvent/OutboxStatus and lib/messaging/outbox-dispatch.ts.
 *
 * Follows this app's existing raw-body-then-HMAC-verify webhook convention (see the Razorpay/
 * shipping-provider webhooks in reference/muv-app/api/webhooks/*) — req.text() first, never
 * req.json() first, so re-serialization can never change the bytes the signature was computed
 * over. Same "always 200 once verified, log-and-move-on on internal failure" posture too, so a
 * bug on our side can never trigger a Meta retry-storm.
 *
 * SECURITY — three independent layers, deliberately not just one:
 *  1. GET: hub.verify_token must match WHATSAPP_WEBHOOK_VERIFY_TOKEN exactly.
 *  2. POST: X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed by WHATSAPP_APP_SECRET) is
 *     verified whenever WHATSAPP_APP_SECRET is configured — rejects the request outright on any
 *     mismatch. If WHATSAPP_APP_SECRET is NOT configured, this step is skipped and logged as a
 *     degraded-security warning (see the audit report's MANUAL META ACTIONS for the exact env
 *     var name still required) rather than silently pretending signature verification happened.
 *  3. POST (always, independent of #2): every `metadata.phone_number_id` in the payload must
 *     equal this deployment's own WHATSAPP_PHONE_NUMBER_ID. A payload for a different phone
 *     number/WABA (e.g. accidentally misconfigured to point at MUV's number, if MUV ever had
 *     one, or any other unrelated number) is dropped, never processed — this is the concrete
 *     MUV/cross-tenant isolation guard at the webhook boundary.
 */

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header) return false;
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const configuredToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!configuredToken) {
    console.error("whatsapp_webhook.verify_token_not_configured");
    return new NextResponse("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured", { status: 503 });
  }
  if (mode === "subscribe" && token === configuredToken && challenge) {
    // Meta requires the raw challenge string echoed back verbatim — not JSON-wrapped.
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, signature, appSecret)) {
      console.error("whatsapp_webhook.invalid_signature");
      return new NextResponse("Invalid signature", { status: 403 });
    }
  } else {
    console.warn("whatsapp_webhook.signature_verification_skipped — WHATSAPP_APP_SECRET not configured");
  }

  // Light rate limit — Meta can legitimately send bursts of status events, so this is generous
  // (protects against something actually wrong, e.g. a misbehaving retry loop) not a throttle
  // on normal traffic.
  try {
    enforceRateLimit("whatsapp-webhook:global", 600, 60_000);
  } catch {
    return new NextResponse(null, { status: 200 }); // never invite a retry-storm even when self-throttling
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("whatsapp_webhook.invalid_json_body");
    return new NextResponse(null, { status: 200 });
  }

  const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const configuredWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  try {
    const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      // Second, independent isolation check — the WABA id itself (Meta's top-level `entry.id`),
      // not just the phone number under it. A payload for a different WhatsApp Business Account
      // is dropped here even before looking at its phone_number_id.
      if (configuredWabaId && entry?.id && entry.id !== configuredWabaId) {
        console.warn("whatsapp_webhook.waba_id_mismatch", { received: entry.id });
        continue;
      }
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? {};
        const metadataPhoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        // Isolation/spoofing guard: only ever act on events for THIS deployment's own configured
        // phone number. A payload for any other phone_number_id (including, concretely, any
        // number belonging to a different app/product such as MUV) is logged and dropped.
        if (configuredPhoneNumberId && metadataPhoneNumberId && metadataPhoneNumberId !== configuredPhoneNumberId) {
          console.warn("whatsapp_webhook.phone_number_id_mismatch", { received: metadataPhoneNumberId });
          continue;
        }

        const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const status of statuses) {
          await processStatusEvent(status);
        }

        const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          await processInboundMessage(message, value?.contacts?.[0]);
        }
      }
    }
  } catch (error) {
    // Same posture as this app's shipping-provider webhook: verified-but-failed-internally is
    // still a 200 (Meta must not retry-storm a failure that's on our side), logged for follow-up.
    console.error("whatsapp_webhook.processing_failed", { error: error instanceof Error ? error.message : String(error) });
  }

  return new NextResponse(null, { status: 200 });
}

const STATUS_RANK: Record<string, number> = { PENDING: 0, PROCESSING: 0, PUBLISHED: 1, DELIVERED: 2, READ: 3, FAILED: -1, DEAD_LETTER: -1 };

async function processStatusEvent(status: { id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number; title?: string }> }) {
  if (!status?.id || !status?.status) return;
  const dedupeKey = `${status.id}:${status.status}:${status.timestamp ?? ""}`;
  try {
    await prisma.whatsAppWebhookReceipt.create({ data: { dedupeKey } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return; // already processed this exact redelivery — no-op
    throw error;
  }

  const event = await prisma.outboxEvent.findFirst({ where: { providerMessageId: status.id } });
  if (!event) {
    // A status for a message id we don't recognize (e.g. the test-send path, or a message sent
    // outside this outbox architecture) — nothing to update, but not an error either.
    console.info("whatsapp_webhook.status_unmatched", { providerMessageId: status.id, status: status.status });
    return;
  }

  const nextStatus = status.status === "delivered" ? "DELIVERED" : status.status === "read" ? "READ" : status.status === "failed" ? "FAILED" : status.status === "sent" ? "PUBLISHED" : null;
  if (!nextStatus) return;

  // Never regress a status that has already advanced further (e.g. a late "sent" webhook
  // arriving after "delivered" already landed) — idempotent w.r.t. out-of-order redelivery, not
  // just exact-duplicate redelivery.
  if ((STATUS_RANK[nextStatus] ?? 0) <= (STATUS_RANK[event.status] ?? 0) && nextStatus !== "FAILED") return;

  const failureCode = status.status === "failed" ? String(status.errors?.[0]?.code ?? "WHATSAPP_DELIVERY_FAILED") : undefined;
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: nextStatus,
      ...(nextStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      ...(nextStatus === "READ" ? { readAt: new Date() } : {}),
      ...(nextStatus === "FAILED" ? { lastErrorCode: failureCode } : {}),
    },
  });
  await recordAudit(prisma, {
    actorId: null,
    action: `whatsapp.status.${status.status}`,
    entityType: "OutboxEvent",
    entityId: event.id,
    details: { providerMessageId: status.id, status: status.status, errorCode: failureCode },
  });
}

async function processInboundMessage(message: { id?: string; from?: string; type?: string }, contact?: { profile?: { name?: string } }) {
  if (!message?.id) return;
  const dedupeKey = `inbound:${message.id}`;
  try {
    await prisma.whatsAppWebhookReceipt.create({ data: { dedupeKey } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return;
    throw error;
  }
  // No automated inbound-message handling exists in this codebase yet (no chatbot/agent reads
  // WhatsApp replies) — audited only, so a human can review it, never silently dropped or
  // auto-actioned. Recipient phone number intentionally not logged in full here (data
  // minimization in the audit log's `details`); the dedupe receipt above already proves receipt.
  await recordAudit(prisma, {
    actorId: null,
    action: "whatsapp.inbound_message_received",
    entityType: "WhatsAppWebhookReceipt",
    details: { messageId: message.id, type: message.type ?? "unknown", fromKnownContact: Boolean(contact?.profile?.name) },
  });
}
