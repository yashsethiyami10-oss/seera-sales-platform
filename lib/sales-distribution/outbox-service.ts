import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership, notifyPartyUsers } from "./scope";
import { creditPositionFor } from "./credit-service";

// Shared, provider-neutral outbox foundation (Founder decision, RUN 2 shared residual) — reuses
// the existing OutboxEvent model rather than a parallel S.S.-specific table, so Executive/
// Distributor/Manager/Founder can queue the same event types later without duplicating this.
export const OUTBOX_EVENT_TYPES = [
  "PAYMENT_REMINDER",
  "OVERDUE_WARNING",
  "PROMISE_MISSED",
  "CREDIT_WARNING",
  "RETAILER_ORDER_RECORDED",
  "ORDER_ACCEPTED",
  "ORDER_PARTIAL",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FOLLOW_UP",
  "DOCUMENT_SHARE",
] as const;
export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

// Deliberately does NOT call a messaging provider — this only ever queues a real, auditable
// intent record. A provider-dispatch worker is a separate concern this pass does not build.
// Status stays PENDING ("queued, not yet sent") — never fabricated as PUBLISHED/sent.
export async function queueOutboxEvent(
  db: PrismaClient,
  input: { eventType: OutboxEventType; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
) {
  return db.outboxEvent.create({
    data: { eventType: input.eventType, aggregateType: input.aggregateType, aggregateId: input.aggregateId, payload: input.payload as Prisma.InputJsonValue, status: "PENDING" },
  });
}

// S.S. → Distributor payment reminder (Founder Phase R). Queues a real OutboxEvent (never a fake
// "sent" WhatsApp) AND creates an immediate in-app Notification for the Distributor's own portal
// users via the existing notifyPartyUsers — so the reminder is visible even before/without any
// external channel ever picking the outbox event up.
export async function sendDistributorPaymentReminder(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: { distributorId: string; template: "PAYMENT_REMINDER" | "OVERDUE_WARNING" | "PROMISE_MISSED" | "CREDIT_WARNING"; note?: string },
) {
  await authorize(prisma, { actorId, permission: "partner_credit:enforce" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const distributor = await prisma.seeraPartner.findFirst({
    where: { id: input.distributorId, type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId, lifecycle: "ACTIVE" },
  });
  if (!distributor)
    throw new FoundationError("DISTRIBUTOR_SCOPE_DENIED", "Distributor is outside this Super Stockist's network", 403);
  const position = await creditPositionFor(prisma, distributor.id, new Date());
  const mobile = (distributor.primaryContact as { mobile?: string } | null)?.mobile ?? null;
  const event = await queueOutboxEvent(prisma, {
    eventType: input.template,
    aggregateType: "DISTRIBUTOR",
    aggregateId: distributor.id,
    payload: {
      distributorName: distributor.tradeName ?? distributor.legalName,
      recipientMobile: mobile,
      language: "EN",
      actorId,
      outstanding: position.outstanding,
      overdue: position.overdue,
      oldestDueDate: position.oldestDueDate,
      promisedPaymentDate: position.promisedPaymentDate,
      note: input.note,
    },
  });
  await notifyPartyUsers(prisma, distributor.id, {
    title: input.template === "PAYMENT_REMINDER" ? "Payment reminder" : input.template.replace(/_/g, " "),
    body: `Outstanding ₹${position.outstanding.toLocaleString("en-IN")}${position.overdue > 0 ? `, overdue ₹${position.overdue.toLocaleString("en-IN")}` : ""}.${input.note ? ` ${input.note}` : ""}`,
    entityType: "SeeraPartner",
    entityId: distributor.id,
    actionPath: "/portal/distributor/credit",
  });
  await recordAudit(prisma, {
    actorId,
    action: "distributor.payment_reminder_sent",
    entityType: "OutboxEvent",
    entityId: event.id,
    afterState: { distributorId: distributor.id, template: input.template, outstanding: position.outstanding },
  });
  return { event, mobile, outstanding: position.outstanding, overdue: position.overdue };
}
