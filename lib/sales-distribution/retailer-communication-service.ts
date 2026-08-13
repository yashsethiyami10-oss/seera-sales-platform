import type { PrismaClient } from "@prisma/client";
import { recordAudit } from "@/lib/foundation/audit-service";
import type { MessagingProvider } from "@/lib/messaging/types";

// Provider-agnostic retailer communication event/outbox foundation (Founder-UAT closure pass,
// section 10-14). Reuses the existing `OutboxEvent` model (prisma/schema.prisma) — a generic,
// already-approved outbox pattern that was defined but never wired to a producer anywhere in this
// codebase — rather than inventing a second, parallel event table.
//
// Pre-launch Pass 0B: `dispatchRetailerCommunications` below is now wired to a real trigger —
// app/api/outbox/dispatch/route.ts, an internal-secret-gated POST route any external scheduler
// (cron, systemd timer, Vercel Cron, etc.) can call. It still never fakes delivery: with no
// MESSAGING_PROVIDER credentials configured (the current state of every environment in this repo),
// the real provider classes in lib/messaging/providers/* throw on their first network call (missing
// API key), which this function catches and records as a real FAILED/DEAD_LETTER outcome — an
// honest "queued, not yet deliverable" state, never a fabricated PUBLISHED/SENT status.

export const RETAILER_COMM_EVENT_TYPES = [
  "ORDER_RECORDED",
  "ORDER_ACCEPTED",
  "ORDER_PARTIAL",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REFUSED_OR_UNABLE",
  "FOLLOW_UP",
  "PERIODIC_ENGAGEMENT",
] as const;
export type RetailerCommEventType = (typeof RETAILER_COMM_EVENT_TYPES)[number];

function renderTemplate(
  eventType: RetailerCommEventType,
  language: "EN" | "HI",
  vars: { retailerName: string; orderNumber?: string; orderValue?: number; paymentType?: string; followUpAt?: Date | null },
): string {
  const hi = language === "HI";
  switch (eventType) {
    case "ORDER_RECORDED":
      return hi
        ? `धन्यवाद! आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है।\nऑर्डर: ${vars.orderNumber}\nमूल्य: ₹${vars.orderValue?.toLocaleString("en-IN")}\nभुगतान: ${vars.paymentType}\n— Seera | सर्व शक्तिमान`
        : `Thank you for your order with Seera. Your order has been recorded successfully.\n\nOrder: ${vars.orderNumber}\nOrder Value: ₹${vars.orderValue?.toLocaleString("en-IN")}\nPayment Type: ${vars.paymentType}\n\nOur distribution team will process your order.\n\n— Seera | Sarv Shaktiman`;
    case "REFUSED_OR_UNABLE":
      return hi
        ? `आपके समय के लिए धन्यवाद। हमारे Seera प्रतिनिधि ने आपकी दुकान का दौरा किया। हम आपकी सेवा करने के लिए तत्पर हैं।`
        : `Thank you for your time today.\nOur Seera representative visited your outlet.\nWe look forward to serving you.`;
    case "FOLLOW_UP":
      return hi
        ? `${vars.retailerName}, हम ${vars.followUpAt ? vars.followUpAt.toLocaleDateString("hi-IN") : "जल्द ही"} फिर से संपर्क करेंगे।`
        : `Hi ${vars.retailerName}, we'll follow up with you ${vars.followUpAt ? `on ${vars.followUpAt.toLocaleDateString("en-IN")}` : "soon"}.`;
    default:
      return "";
  }
}

export async function queueRetailerCommunication(
  db: PrismaClient,
  input: {
    eventType: RetailerCommEventType;
    retailerId: string;
    visitId?: string;
    actorId: string;
    language?: "EN" | "HI";
  },
): Promise<{ queued: boolean; reason?: string; outboxEventId?: string }> {
  const retailer = await db.seeraRetailer.findUnique({ where: { id: input.retailerId } });
  if (!retailer) return { queued: false, reason: "RETAILER_NOT_FOUND" };
  const language = input.language ?? "EN";
  const mobile = retailer.mobile;

  let orderNumber: string | undefined, orderValue: number | undefined, paymentType: string | undefined, followUpAt: Date | null = null;
  if (input.eventType === "ORDER_RECORDED") {
    const order = await db.seeraSalesOrder.findFirst({
      where: { retailerId: input.retailerId, salespersonId: input.actorId },
      orderBy: { createdAt: "desc" },
    });
    orderNumber = order?.orderNumber;
    orderValue = order ? Number(order.total) : undefined;
    paymentType = order?.commercialPaymentType ?? undefined;
  }
  if (input.eventType === "FOLLOW_UP" && input.visitId) {
    const visit = await db.seeraVisit.findUnique({ where: { id: input.visitId }, select: { followUpAt: true } });
    followUpAt = visit?.followUpAt ?? null;
  }

  const preview = renderTemplate(input.eventType, language, {
    retailerName: retailer.businessName,
    orderNumber,
    orderValue,
    paymentType,
    followUpAt,
  });

  if (!mobile) {
    // Checkout must still succeed with no mobile on file — this row exists purely as an honest,
    // auditable record of *why* nothing was queued, never a silent drop.
    const event = await db.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: "SeeraRetailer",
        aggregateId: input.retailerId,
        payload: { retailerId: input.retailerId, visitId: input.visitId ?? null, language, templatePreview: preview },
        status: "FAILED",
        lastErrorCode: "MOBILE_UNAVAILABLE",
      },
    });
    return { queued: false, reason: "MOBILE_UNAVAILABLE", outboxEventId: event.id };
  }

  // Non-spammy default for the low-signal "no order" outcome (REFUSED_OR_UNABLE here doubles as
  // the visit-completed/no-order courtesy message): at most one per retailer per calendar day,
  // rather than a per-policy engine this pass has no Founder-approved rules to build against yet.
  if (input.eventType === "REFUSED_OR_UNABLE") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const already = await db.outboxEvent.findFirst({
      where: { eventType: input.eventType, aggregateType: "SeeraRetailer", aggregateId: input.retailerId, createdAt: { gte: startOfDay } },
    });
    if (already) return { queued: false, reason: "ALREADY_SENT_TODAY" };
  }

  const event = await db.outboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: "SeeraRetailer",
      aggregateId: input.retailerId,
      payload: { retailerId: input.retailerId, visitId: input.visitId ?? null, mobile, language, templatePreview: preview },
      status: "PENDING",
    },
  });
  return { queued: true, outboxEventId: event.id };
}

export async function listRetailerCommunications(db: PrismaClient, input: { retailerId?: string; skip?: number; take?: number } = {}) {
  return db.outboxEvent.findMany({
    where: {
      aggregateType: "SeeraRetailer",
      eventType: { in: RETAILER_COMM_EVENT_TYPES as unknown as string[] },
      ...(input.retailerId ? { aggregateId: input.retailerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 50,
  });
}

// State model: PENDING -> PROCESSING -> PUBLISHED, or on failure PROCESSING -> FAILED, retried up
// to MAX_ATTEMPTS with exponential backoff (via availableAt), then FAILED -> DEAD_LETTER once
// exhausted (terminal, needs manual/operator attention). A worker that dies mid-send leaves a row
// in PROCESSING — reclaimStaleLocks() below returns those to PENDING after STALE_LOCK_MINUTES so
// they are never permanently stuck, without touching a row a still-running invocation genuinely
// holds. Every row transition here is a guarded `updateMany` keyed on the state the row was read
// in, so two overlapping dispatch runs (a retried trigger request, two overlapping cron firings)
// can race for the same row and only one of them will ever win the claim — the other observes
// `count !== 1` and skips it as SKIPPED_CONTENDED rather than double-sending.
const MAX_ATTEMPTS = 5;
const STALE_LOCK_MINUTES = 5;
const backoffMinutes = (attempts: number) => Math.min(60, 2 ** attempts);

export async function reclaimStaleOutboxLocks(db: PrismaClient, aggregateType = "SeeraRetailer") {
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

export async function dispatchRetailerCommunications(
  db: PrismaClient,
  getMessagingProvider: () => Pick<MessagingProvider, "sendWhatsApp">,
  input: { limit?: number } = {},
) {
  const now = new Date();
  await reclaimStaleOutboxLocks(db, "SeeraRetailer");

  // Eligible for a send attempt: never-tried PENDING rows, or FAILED rows still under the retry
  // cap whose backoff window has elapsed. DEAD_LETTER and exhausted rows are never picked up again.
  const candidates = await db.outboxEvent.findMany({
    where: {
      aggregateType: "SeeraRetailer",
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
    },
    orderBy: { availableAt: "asc" },
    take: input.limit ?? 20,
  });

  const provider = getMessagingProvider();
  const results: Array<{ id: string; status: "PUBLISHED" | "FAILED" | "DEAD_LETTER" | "SKIPPED_CONTENDED" }> = [];

  for (const event of candidates) {
    const claim = await db.outboxEvent.updateMany({
      where: { id: event.id, status: event.status },
      data: { status: "PROCESSING", lockedAt: now },
    });
    if (claim.count !== 1) {
      results.push({ id: event.id, status: "SKIPPED_CONTENDED" });
      continue;
    }
    try {
      const payload = event.payload as { mobile?: string; templatePreview?: string };
      if (!payload.mobile) throw new Error("MOBILE_UNAVAILABLE");
      // No Founder-approved WhatsApp template registry exists yet (a real provider account with
      // pre-approved templates is a separate, not-yet-made decision) — eventType stands in as the
      // template identifier and the rendered preview text as its sole parameter. This is a real,
      // documented limitation, not a fabricated integration detail; PUBLISHED is only ever set
      // after the provider call actually resolves without throwing — never assumed.
      await provider.sendWhatsApp(payload.mobile, event.eventType, [payload.templatePreview ?? ""]);
      await db.outboxEvent.update({ where: { id: event.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      results.push({ id: event.id, status: "PUBLISHED" });
    } catch (error) {
      const attempts = event.attempts + 1;
      const errorCode = error instanceof Error ? error.message : "SEND_FAILED";
      if (attempts >= MAX_ATTEMPTS) {
        await db.outboxEvent.update({ where: { id: event.id }, data: { status: "DEAD_LETTER", attempts, lastErrorCode: errorCode } });
        await recordAudit(db, { actorId: null, action: "outbox.dead_lettered", entityType: "OutboxEvent", entityId: event.id, outcome: "FAILURE", reason: errorCode, details: { attempts } });
        results.push({ id: event.id, status: "DEAD_LETTER" });
      } else {
        await db.outboxEvent.update({
          where: { id: event.id },
          data: { status: "FAILED", attempts, lastErrorCode: errorCode, availableAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000) },
        });
        results.push({ id: event.id, status: "FAILED" });
      }
    }
  }
  return results;
}
