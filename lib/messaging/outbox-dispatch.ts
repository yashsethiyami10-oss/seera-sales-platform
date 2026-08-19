import type { PrismaClient, OutboxStatus } from "@prisma/client";
import { recordAudit } from "@/lib/foundation/audit-service";
import type { MessagingProvider } from "@/lib/messaging/types";
import { classifyWhatsAppError } from "@/lib/messaging/error-classification";

/**
 * Shared WhatsApp outbox dispatcher — the actual network-calling half of the non-blocking
 * send architecture. Every business trigger (retailer checkout, distributor/S.S. visit
 * completion, retailer delivery) only ever writes a durable, PENDING `OutboxEvent` row
 * (fast local DB write, see lib/sales-distribution/retailer-communication-service.ts and
 * lib/sales-distribution/partner-communication-service.ts); this module is the only place
 * that actually calls Meta's Cloud API, and only ever runs from a separate trigger
 * (app/api/outbox/dispatch/route.ts) — never inline inside a checkout/delivery request.
 *
 * One generic implementation shared by every aggregate type (SeeraRetailer, SeeraPartner)
 * — per the Founder directive not to build parallel outbox architectures per domain. Every
 * row this dispatcher handles stores a uniform WhatsApp send payload shape
 * (`WhatsAppOutboxPayload`) regardless of which business event created it.
 */

const MAX_ATTEMPTS = 5;
const STALE_LOCK_MINUTES = 5;
const backoffMinutes = (attempts: number) => Math.min(60, 2 ** attempts);

export type WhatsAppOutboxPayload = {
  /** Canonical `91XXXXXXXXXX` — already normalized at queue time (lib/messaging/phone.ts). */
  mobile: string;
  /** Exact Meta-approved template name (lib/messaging/whatsapp-templates.ts). */
  templateName: string;
  /** Ordered, sanitized {{1}}..{{n}} body parameters — never "undefined"/"null"/blank. */
  templateParams: string[];
  /** Governed template key, stored on the OutboxEvent row for audit/reporting. */
  templateKey: string;
  /** This specific template's own Meta-approved language code (e.g. "hi") — carried through
   *  from lib/messaging/whatsapp-templates.ts at queue time, never a global default. */
  languageCode: string;
};

export async function reclaimStaleOutboxLocks(db: PrismaClient, aggregateType: string) {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000);
  const reclaimed = await db.outboxEvent.updateMany({
    where: { aggregateType, status: "PROCESSING", lockedAt: { lt: staleCutoff } },
    data: { status: "PENDING", lockedAt: null },
  });
  if (reclaimed.count > 0)
    await recordAudit(db, {
      actorId: null,
      action: "outbox.stale_lock_reclaimed",
      entityType: "OutboxEvent",
      details: { aggregateType, count: reclaimed.count, staleCutoff: staleCutoff.toISOString() },
    });
  return reclaimed.count;
}

export type DispatchResult = { id: string; status: "PUBLISHED" | "FAILED" | "DEAD_LETTER" | "SKIPPED_CONTENDED" };

type OutboxEventRow = { id: string; status: OutboxStatus; attempts: number; payload: unknown; eventType: string };

/**
 * Claims (via the same guarded updateMany two overlapping callers can never both win) and
 * sends exactly one already-fetched row. Shared by both the batch dispatcher below (oldest-
 * first, used by the scheduled/external-triggered worker) and dispatchOutboxEventById (a
 * specific known row, used by the post-checkout immediate-dispatch nudge) — one send/failure-
 * classification/retry implementation, not two copies that could drift apart.
 */
async function claimAndSendOne(
  db: PrismaClient,
  provider: Pick<MessagingProvider, "sendWhatsApp">,
  event: OutboxEventRow,
  now: Date,
): Promise<DispatchResult> {
  const claim = await db.outboxEvent.updateMany({
    where: { id: event.id, status: event.status },
    data: { status: "PROCESSING", lockedAt: now },
  });
  if (claim.count !== 1) return { id: event.id, status: "SKIPPED_CONTENDED" };

  try {
    const payload = event.payload as Partial<WhatsAppOutboxPayload>;
    if (!payload.mobile || !payload.templateName || !Array.isArray(payload.templateParams) || !payload.languageCode) {
      throw Object.assign(new Error("OUTBOX_PAYLOAD_MALFORMED"), { status: 400 }); // classified PERMANENT below
    }
    const result = await provider.sendWhatsApp(payload.mobile, payload.templateName, payload.templateParams, payload.languageCode);
    await db.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        sentAt: new Date(),
        providerMessageId: result.id || null,
        channel: "WHATSAPP",
        templateKey: payload.templateKey ?? event.eventType,
      },
    });
    return { id: event.id, status: "PUBLISHED" };
  } catch (error) {
    const attempts = event.attempts + 1;
    const errorCode = error instanceof Error ? error.message : "SEND_FAILED";
    const isPermanent = classifyWhatsAppError(error) === "PERMANENT";
    if (isPermanent || attempts >= MAX_ATTEMPTS) {
      await db.outboxEvent.update({ where: { id: event.id }, data: { status: "DEAD_LETTER", attempts, lastErrorCode: errorCode, channel: "WHATSAPP" } });
      await recordAudit(db, {
        actorId: null,
        action: "outbox.dead_lettered",
        entityType: "OutboxEvent",
        entityId: event.id,
        outcome: "FAILURE",
        reason: errorCode,
        details: { attempts, permanent: isPermanent },
      });
      return { id: event.id, status: "DEAD_LETTER" };
    }
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", attempts, lastErrorCode: errorCode, channel: "WHATSAPP", availableAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000) },
    });
    return { id: event.id, status: "FAILED" };
  }
}

/**
 * Claims and sends up to `limit` eligible WhatsApp outbox rows for the given aggregateType,
 * OLDEST FIRST. This is the batch worker — the scheduled/external-cron entry point
 * (app/api/outbox/dispatch/route.ts) — and it is deliberately FIFO so a backlog drains in
 * order rather than starving old rows forever. That FIFO property is exactly why this function
 * must NEVER be used to try to send one specific just-queued event "immediately": with any
 * backlog ahead of it (proven to happen in production — see dispatchOutboxEventById's header),
 * a `limit:1` call here always re-attempts the oldest backlog item, not the new one.
 */
export async function dispatchWhatsAppOutbox(
  db: PrismaClient,
  getMessagingProvider: () => Pick<MessagingProvider, "sendWhatsApp">,
  input: { aggregateType: string; limit?: number },
): Promise<DispatchResult[]> {
  const now = new Date();
  await reclaimStaleOutboxLocks(db, input.aggregateType);

  const candidates = await db.outboxEvent.findMany({
    where: {
      aggregateType: input.aggregateType,
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
    },
    orderBy: { availableAt: "asc" },
    take: input.limit ?? 20,
  });

  const provider = getMessagingProvider();
  const results: DispatchResult[] = [];
  for (const event of candidates) results.push(await claimAndSendOne(db, provider, event, now));
  return results;
}

/**
 * Attempts exactly the one specific event id given — never "whichever is oldest." Exists
 * because a real production incident proved `dispatchWhatsAppOutbox(..., {limit:1})` is the
 * wrong tool for "try to send the message I just queued": a live trace showed a brand-new
 * checkout's OutboxEvent sitting at position #4 of 4 in the PENDING backlog (one row dated
 * back to before this session), so a limit:1 batch call kept re-attempting the four-day-old
 * row instead of the new one — the new message was never even looked at. This function claims
 * and sends only the given id, so the immediate post-checkout dispatch nudge (see
 * lib/sales-distribution/{retailer,partner}-communication-service.ts's
 * scheduleImmediateDispatchAttempt) actually attempts the event it was meant to, independent
 * of however large the backlog is. Draining that backlog is still the batch worker's job —
 * this function intentionally does not touch any other row.
 */
export async function dispatchOutboxEventById(
  db: PrismaClient,
  getMessagingProvider: () => Pick<MessagingProvider, "sendWhatsApp">,
  eventId: string,
): Promise<DispatchResult | null> {
  const event = await db.outboxEvent.findUnique({ where: { id: eventId } });
  if (!event || !["PENDING", "FAILED"].includes(event.status) || event.attempts >= MAX_ATTEMPTS) return null;
  return claimAndSendOne(db, getMessagingProvider(), event, new Date());
}
