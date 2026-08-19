import { after } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MessagingProvider } from "@/lib/messaging/types";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { templateFor, sanitizeTemplateParam, isTemplateSendable, type WhatsAppTemplateKey } from "@/lib/messaging/whatsapp-templates";
import { dispatchWhatsAppOutbox, type WhatsAppOutboxPayload } from "@/lib/messaging/outbox-dispatch";
import { getMessagingProvider } from "@/lib/messaging";

// Distributor / Super Stockist visit-completion WhatsApp trigger (Founder WhatsApp integration
// audit, requirements 3-4). Mirrors lib/sales-distribution/retailer-communication-service.ts —
// same OutboxEvent-based, non-blocking, governed-template architecture — but keyed off
// aggregateType "SeeraPartner" so the two never collide and a partner-visit event can never be
// misread as a retailer event (or vice versa) by the shared dispatcher.
//
// Only wired from lib/sales-distribution/manager-service.ts's managerPartnerCheckOut, the one
// place in this codebase a Distributor/S.S. visit is actually completed today (see that file's
// own comments — there is currently no separate Executive-facing partner-visit flow to wire).

export const PARTNER_COMM_EVENT_TYPES = ["DISTRIBUTOR_VISIT_COMPLETED", "SUPER_STOCKIST_VISIT_COMPLETED"] as const;
export type PartnerCommEventType = (typeof PARTNER_COMM_EVENT_TYPES)[number];

export async function queuePartnerVisitCommunication(
  db: PrismaClient,
  input: { partnerId: string; partnerType: "DISTRIBUTOR" | "SUPER_STOCKIST"; visitId: string; actorId: string },
): Promise<{ queued: boolean; reason?: string; outboxEventId?: string }> {
  const partner = await db.seeraPartner.findUnique({ where: { id: input.partnerId } });
  if (!partner) return { queued: false, reason: "PARTNER_NOT_FOUND" };

  const eventType: PartnerCommEventType = input.partnerType === "DISTRIBUTOR" ? "DISTRIBUTOR_VISIT_COMPLETED" : "SUPER_STOCKIST_VISIT_COMPLETED";
  const templateKey = eventType as WhatsAppTemplateKey; // registry keys intentionally match these event type names 1:1
  const template = templateFor(templateKey);

  // Pre-queue validation — same governed gate as retailer-communication-service.ts. Both
  // partner-visit templates are currently live/APPROVED in Meta, but this must never silently
  // start queuing a doomed send again if either is ever paused/rejected in Meta later.
  if (!isTemplateSendable(template)) {
    const event = await db.outboxEvent.create({
      data: {
        eventType,
        aggregateType: "SeeraPartner",
        aggregateId: input.partnerId,
        payload: { partnerId: input.partnerId, visitId: input.visitId, reason: "TEMPLATE_NOT_APPROVED", templateName: template.metaTemplateName, approvalStatus: template.approvalStatus },
        status: "FAILED",
        lastErrorCode: "TEMPLATE_NOT_APPROVED",
        channel: "WHATSAPP",
        templateKey,
      },
    });
    return { queued: false, reason: "TEMPLATE_NOT_APPROVED", outboxEventId: event.id };
  }
  const languageCode = template.languageCode;

  // Business-contact number on the partner record (primaryContact.mobile), never the login
  // mobile of whichever individual S.S./Distributor user happens to be signed in — per the
  // Founder directive not to conflate the two unless the data model defines that as
  // authoritative, which SeeraPartner.primaryContact does (it's the governed party-level
  // contact, independent of any one user's own login credentials).
  const contact = partner.primaryContact as { mobile?: string; ownerName?: string } | null;
  const firmName = sanitizeTemplateParam(partner.tradeName ?? partner.legalName, input.partnerType === "DISTRIBUTOR" ? "Distributor" : "Super Stockist");
  // Contact person's own name on the party record — falls back to the firm name (never blank)
  // when no individual contact name is on file, same governed-fallback posture used everywhere
  // else in this file.
  const contactName = sanitizeTemplateParam(contact?.ownerName, firmName);
  const mobile = normalizeIndianMobile(contact?.mobile);

  if (!mobile) {
    const event = await db.outboxEvent.create({
      data: {
        eventType,
        aggregateType: "SeeraPartner",
        aggregateId: input.partnerId,
        payload: { partnerId: input.partnerId, visitId: input.visitId, reason: "MOBILE_UNAVAILABLE" },
        status: "FAILED",
        lastErrorCode: "MOBILE_UNAVAILABLE",
        channel: "WHATSAPP",
        templateKey,
      },
    });
    return { queued: false, reason: "MOBILE_UNAVAILABLE", outboxEventId: event.id };
  }

  const rep = await db.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
  const repName = sanitizeTemplateParam(rep?.name, "Seera representative");
  const visitDate = sanitizeTemplateParam(new Date().toLocaleDateString("en-IN"));
  // Visit outcome/update — the governed purpose value captured at check-in (see SeeraVisit's
  // partnerVisitPurpose), not free-text notes; falls back to a neutral, non-blank phrase when
  // no purpose was recorded for this visit.
  const visitOutcome = sanitizeTemplateParam((await db.seeraVisit.findUnique({ where: { id: input.visitId }, select: { partnerVisitPurpose: true } }))?.partnerVisitPurpose, "Business Visit");

  // Live Meta mapping (reconciled against the Founder's Seera WABA): contact name,
  // representative name, firm name, visit date, visit outcome/update — in that exact order.
  const payload: WhatsAppOutboxPayload = {
    mobile,
    templateName: template.metaTemplateName,
    templateParams: [contactName, repName, firmName, visitDate, visitOutcome],
    templateKey,
    languageCode,
  };
  const event = await db.outboxEvent.create({
    data: {
      eventType,
      aggregateType: "SeeraPartner",
      aggregateId: input.partnerId,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      channel: "WHATSAPP",
      templateKey,
    },
  });
  return { queued: true, outboxEventId: event.id };
}

/** Never-throws wrapper — see queueRetailerCommunicationSafe's header comment for why this
 *  exists: a queuing hiccup must never fail an already-committed visit check-out. */
export async function queuePartnerVisitCommunicationSafe(
  db: PrismaClient,
  input: Parameters<typeof queuePartnerVisitCommunication>[1],
): Promise<{ queued: boolean; reason?: string; outboxEventId?: string }> {
  try {
    const result = await queuePartnerVisitCommunication(db, input);
    if (result.queued) scheduleImmediateDispatchAttempt(db);
    return result;
  } catch (error) {
    console.error("partner_communication.queue_failed", error);
    return { queued: false, reason: "QUEUE_ERROR" };
  }
}

/** Same production root cause and fix as retailer-communication-service.ts's identical helper:
 *  nothing was ever actually invoking the outbox dispatch worker, so queued rows sat PENDING
 *  indefinitely. See that file's header comment for the full explanation. */
function scheduleImmediateDispatchAttempt(db: PrismaClient) {
  try {
    after(() => dispatchPartnerCommunications(db, getMessagingProvider, { limit: 1 }).catch((error) => console.error("partner_communication.immediate_dispatch_failed", error)));
  } catch (error) {
    console.error("partner_communication.immediate_dispatch_schedule_failed", error);
  }
}

export async function listPartnerCommunications(db: PrismaClient, input: { partnerId?: string; skip?: number; take?: number } = {}) {
  return db.outboxEvent.findMany({
    where: {
      aggregateType: "SeeraPartner",
      eventType: { in: PARTNER_COMM_EVENT_TYPES as unknown as string[] },
      ...(input.partnerId ? { aggregateId: input.partnerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 50,
  });
}

export async function dispatchPartnerCommunications(
  db: PrismaClient,
  getMessagingProvider: () => Pick<MessagingProvider, "sendWhatsApp">,
  input: { limit?: number } = {},
) {
  return dispatchWhatsAppOutbox(db, getMessagingProvider, { aggregateType: "SeeraPartner", limit: input.limit });
}
