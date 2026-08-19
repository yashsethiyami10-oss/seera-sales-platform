import { after } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MessagingProvider } from "@/lib/messaging/types";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { templateFor, sanitizeTemplateParam, isTemplateSendable, type WhatsAppTemplateKey } from "@/lib/messaging/whatsapp-templates";
import { dispatchWhatsAppOutbox, reclaimStaleOutboxLocks as reclaimStaleOutboxLocksGeneric, type WhatsAppOutboxPayload } from "@/lib/messaging/outbox-dispatch";
import { getMessagingProvider } from "@/lib/messaging";

// Provider-agnostic retailer communication event/outbox foundation (Founder-UAT closure pass,
// section 10-14; re-governed for the Founder WhatsApp integration audit). Reuses the existing
// `OutboxEvent` model (prisma/schema.prisma) — a generic, already-approved outbox pattern —
// rather than inventing a second, parallel event table.
//
// Every queued row now carries a real, governed Meta template name + ordered/sanitized
// parameters (lib/messaging/whatsapp-templates.ts), not a free-text "preview" sent as a
// single template parameter — WhatsApp template messages only ever carry pre-approved body
// copy with numbered placeholders; a template literally named after the internal eventType
// string was never something Meta would accept. Actual delivery still only ever happens from
// the separate outbox worker (lib/messaging/outbox-dispatch.ts, triggered via
// app/api/outbox/dispatch/route.ts) — queuing here is always a fast, local, non-blocking DB
// write, never a network call to Meta.

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

// Governed event -> template mapping. `null` means no approved/governed template exists yet
// for that event — queueRetailerCommunication returns NO_GOVERNED_TEMPLATE rather than
// inventing ad hoc copy, per the Founder directive ("do not hardcode business copy in the
// checkout service if template mapping can be governed/configured").
const TEMPLATE_KEY_BY_EVENT: Record<RetailerCommEventType, WhatsAppTemplateKey | null> = {
  ORDER_RECORDED: "RETAILER_ORDER_PLACED",
  ORDER_ACCEPTED: "RETAILER_ORDER_ACCEPTED",
  ORDER_PARTIAL: "RETAILER_ORDER_PARTIAL",
  OUT_FOR_DELIVERY: "RETAILER_OUT_FOR_DELIVERY",
  DELIVERED: "RETAILER_ORDER_DELIVERED",
  REFUSED_OR_UNABLE: "RETAILER_NO_ORDER",
  FOLLOW_UP: "RETAILER_FOLLOW_UP",
  PERIODIC_ENGAGEMENT: null,
};

export async function queueRetailerCommunication(
  db: PrismaClient,
  input: {
    eventType: RetailerCommEventType;
    retailerId: string;
    visitId?: string;
    /** Order this communication is about, when the caller already has it in scope (order
     *  accepted/partial/out-for-delivery/delivered) — avoids re-deriving "most recent order"
     *  heuristics that can pick the wrong order once staff other than the original salesperson
     *  can trigger these events. */
    orderId?: string;
    actorId: string;
    language?: "EN" | "HI";
  },
): Promise<{ queued: boolean; reason?: string; outboxEventId?: string }> {
  const retailer = await db.seeraRetailer.findUnique({ where: { id: input.retailerId } });
  if (!retailer) return { queued: false, reason: "RETAILER_NOT_FOUND" };

  const templateKey = TEMPLATE_KEY_BY_EVENT[input.eventType];
  if (!templateKey) return { queued: false, reason: "NO_GOVERNED_TEMPLATE" };
  const template = templateFor(templateKey);

  // Pre-queue validation (Founder directive: "before queueing a WhatsApp template, approval
  // status must allow sending"). A template this codebase doesn't yet have a live, Meta-
  // APPROVED record for (e.g. the three order-status templates the Founder hasn't created in
  // Meta yet) must never even reach PENDING — it would only ever fail identically at send
  // time. Recorded as an honest, auditable FAILED row for the same reason MOBILE_UNAVAILABLE
  // is below, never a silent drop.
  if (!isTemplateSendable(template)) {
    const event = await db.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: "SeeraRetailer",
        aggregateId: input.retailerId,
        payload: { retailerId: input.retailerId, visitId: input.visitId ?? null, reason: "TEMPLATE_NOT_APPROVED", templateName: template.metaTemplateName, approvalStatus: template.approvalStatus },
        status: "FAILED",
        lastErrorCode: "TEMPLATE_NOT_APPROVED",
        channel: "WHATSAPP",
        templateKey,
      },
    });
    return { queued: false, reason: "TEMPLATE_NOT_APPROVED", outboxEventId: event.id };
  }
  const languageCode = template.languageCode;

  // Non-spammy default for the low-signal "no order" outcome: at most one per retailer per
  // calendar day, rather than a per-policy engine this pass has no Founder-approved rules to
  // build against yet. Checked before any DB write so a duplicate never even creates a row.
  if (input.eventType === "REFUSED_OR_UNABLE") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const already = await db.outboxEvent.findFirst({
      where: { eventType: input.eventType, aggregateType: "SeeraRetailer", aggregateId: input.retailerId, createdAt: { gte: startOfDay } },
    });
    if (already) return { queued: false, reason: "ALREADY_SENT_TODAY" };
  }

  // WhatsApp-specific contact number takes priority over the general mobile field when set
  // (SeeraRetailer.whatsapp) — falls back to the general mobile. Checkout must still succeed
  // with no usable number on file; this row exists purely as an honest, auditable record of
  // *why* nothing was queued, never a silent drop.
  const mobile = normalizeIndianMobile(retailer.whatsapp || retailer.mobile);
  if (!mobile) {
    const event = await db.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: "SeeraRetailer",
        aggregateId: input.retailerId,
        payload: { retailerId: input.retailerId, visitId: input.visitId ?? null, reason: "MOBILE_UNAVAILABLE" },
        status: "FAILED",
        lastErrorCode: "MOBILE_UNAVAILABLE",
        channel: "WHATSAPP",
        templateKey,
      },
    });
    return { queued: false, reason: "MOBILE_UNAVAILABLE", outboxEventId: event.id };
  }

  const outletName = sanitizeTemplateParam(retailer.businessName, "Retailer");
  // Retailer's own registered contact/owner name — falls back to the outlet name itself
  // (never blank) when no owner name is on file, same governed-fallback posture as
  // sanitizeTemplateParam's own default.
  const contactName = sanitizeTemplateParam(retailer.ownerName, outletName);
  const visitDate = sanitizeTemplateParam(new Date().toLocaleDateString("en-IN"));
  const orderForEvent =
    input.orderId
      ? await db.seeraSalesOrder.findUnique({ where: { id: input.orderId } })
      : input.eventType === "ORDER_RECORDED"
        ? await db.seeraSalesOrder.findFirst({ where: { retailerId: input.retailerId, salespersonId: input.actorId }, orderBy: { createdAt: "desc" } })
        : null;
  // One shared visit lookup for the two events whose live Meta template needs a visit-level
  // field (no-order update text / next follow-up date) — avoids two separate round trips.
  const visitForEvent =
    input.visitId && (templateKey === "RETAILER_NO_ORDER" || templateKey === "RETAILER_FOLLOW_UP")
      ? await db.seeraVisit.findUnique({ where: { id: input.visitId }, select: { noOrderReason: true, followUpAt: true } })
      : null;
  // Representative (the Executive/Manager who ran the visit) — required by three of the live
  // Meta templates; a single lookup, only performed when actually needed.
  const repName =
    templateKey === "RETAILER_ORDER_PLACED" || templateKey === "RETAILER_NO_ORDER" || templateKey === "RETAILER_FOLLOW_UP"
      ? sanitizeTemplateParam((await db.user.findUnique({ where: { id: input.actorId }, select: { name: true } }))?.name, "Seera representative")
      : undefined;

  let templateParams: string[];
  switch (templateKey) {
    // Live Meta mapping (reconciled against the Founder's Seera WABA): contact name,
    // representative name, outlet name, visit date, order number/status — in that exact order.
    case "RETAILER_ORDER_PLACED":
      templateParams = [contactName, repName!, outletName, visitDate, sanitizeTemplateParam(orderForEvent?.orderNumber)];
      break;
    // Not live in Meta yet (isTemplateSendable already refused to queue these above) — mapping
    // left as previously documented so the Founder can create matching templates.
    case "RETAILER_ORDER_ACCEPTED":
    case "RETAILER_ORDER_PARTIAL":
    case "RETAILER_OUT_FOR_DELIVERY":
      templateParams = [outletName, sanitizeTemplateParam(orderForEvent?.orderNumber)];
      break;
    // Live Meta mapping for the recreated seera_retailer_order_delivered_hi template: contact
    // name, outlet/shop name, order number, distributor firm name, delivery date.
    case "RETAILER_ORDER_DELIVERED": {
      let distributorName: string | undefined;
      if (orderForEvent?.sellerPartnerId) {
        const seller = await db.seeraPartner.findUnique({ where: { id: orderForEvent.sellerPartnerId }, select: { tradeName: true, legalName: true } });
        distributorName = seller?.tradeName ?? seller?.legalName;
      }
      templateParams = [
        contactName,
        outletName,
        sanitizeTemplateParam(orderForEvent?.orderNumber),
        sanitizeTemplateParam(distributorName),
        sanitizeTemplateParam(new Date().toLocaleDateString("en-IN")),
      ];
      break;
    }
    // Live Meta mapping: contact name, representative name, outlet name, visit date, no-order
    // update. `noOrderReason` is the same governed field the field-portal UI already collects
    // (a short recorded reason, not free-text internal notes) — falls back to a neutral,
    // non-blank phrase rather than exposing nothing or a raw "undefined".
    case "RETAILER_NO_ORDER":
      templateParams = [contactName, repName!, outletName, visitDate, sanitizeTemplateParam(visitForEvent?.noOrderReason, "जल्द मुलाकात करेंगे")];
      break;
    // Live Meta mapping: contact name, representative name, outlet name, visit date, next
    // follow-up date.
    case "RETAILER_FOLLOW_UP": {
      const followUpAt = visitForEvent?.followUpAt ?? null;
      // Governed fallback (Founder directive): never submit a follow-up template with a blank
      // date parameter — if no follow-up date is on record, don't queue a malformed send.
      if (!followUpAt) return { queued: false, reason: "FOLLOWUP_DATE_MISSING" };
      templateParams = [contactName, repName!, outletName, visitDate, sanitizeTemplateParam(followUpAt.toLocaleDateString("en-IN"))];
      break;
    }
    default:
      templateParams = [outletName];
  }

  const payload: WhatsAppOutboxPayload = {
    mobile,
    templateName: template.metaTemplateName,
    templateParams,
    templateKey,
    languageCode,
  };
  const event = await db.outboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: "SeeraRetailer",
      aggregateId: input.retailerId,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      channel: "WHATSAPP",
      templateKey,
    },
  });
  return { queued: true, outboxEventId: event.id };
}

/**
 * Never-throws wrapper — the only call site checkout/order/delivery flows should ever use.
 * Queuing is a fast local DB write (not the Meta network call, which only happens later from
 * the separate dispatch worker), but per the Founder directive "WhatsApp failure must NEVER
 * cause [the] transaction to fail," even a DB hiccup writing the outbox row itself must not
 * surface as a failure of the already-committed business action that triggered it.
 */
export async function queueRetailerCommunicationSafe(
  db: PrismaClient,
  input: Parameters<typeof queueRetailerCommunication>[1],
): Promise<{ queued: boolean; reason?: string; outboxEventId?: string }> {
  try {
    const result = await queueRetailerCommunication(db, input);
    if (result.queued) scheduleImmediateDispatchAttempt(db);
    return result;
  } catch (error) {
    console.error("retailer_communication.queue_failed", error);
    return { queued: false, reason: "QUEUE_ERROR" };
  }
}

/**
 * Root cause of a real production incident: nothing was ever actually invoking the outbox
 * dispatch worker (Vercel Hobby-plan native Cron only fires once daily; no external scheduler
 * was ever configured to hit POST /api/outbox/dispatch), so every queued row sat PENDING
 * indefinitely — a real Executive checkout produced a fully correct, fully governed OutboxEvent
 * that Meta simply never received. `after()` (stable in Next.js 15) runs this attempt AFTER the
 * response has already been sent to the client, so it adds zero latency to the checkout/visit
 * response itself and can never turn a WhatsApp problem into a business-action failure — this is
 * a best-effort nudge, not a replacement for the dispatch worker (a genuinely down/rate-limited
 * Meta API still leaves the row correctly PENDING/FAILED for the worker to retry later).
 * Swallows a call outside an active Next.js request scope (e.g. a standalone script or a test
 * invoking these functions directly) rather than throwing — the queued row is durable either
 * way and will still be picked up whenever the dispatch worker next runs.
 */
function scheduleImmediateDispatchAttempt(db: PrismaClient) {
  try {
    after(() => dispatchRetailerCommunications(db, getMessagingProvider, { limit: 1 }).catch((error) => console.error("retailer_communication.immediate_dispatch_failed", error)));
  } catch (error) {
    console.error("retailer_communication.immediate_dispatch_schedule_failed", error);
  }
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

// Retained for the pre-existing smoke scripts (scripts/seera/smoke-pass0b-outbox-worker.ts)
// that import these two names directly from this module — both now just delegate to the
// shared generic implementation in lib/messaging/outbox-dispatch.ts.
export async function reclaimStaleOutboxLocks(db: PrismaClient, aggregateType = "SeeraRetailer") {
  return reclaimStaleOutboxLocksGeneric(db, aggregateType);
}

export async function dispatchRetailerCommunications(
  db: PrismaClient,
  getMessagingProvider: () => Pick<MessagingProvider, "sendWhatsApp">,
  input: { limit?: number } = {},
) {
  return dispatchWhatsAppOutbox(db, getMessagingProvider, { aggregateType: "SeeraRetailer", limit: input.limit });
}
