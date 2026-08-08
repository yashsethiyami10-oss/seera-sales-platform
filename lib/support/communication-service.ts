import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";

/**
 * Customer Communication Timeline + Internal Notes + Attachments + Follow-up
 * Scheduler. SupportMessage (customer-visible conversation) and
 * SupportTicketNote (internal-only reasoning) are deliberately separate
 * tables — Principle 7 of the approved architecture ("separate customer
 * evidence from assumed cause").
 */

async function assertTicketInOrg(ticketId: string, organizationKey: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, organizationKey } });
  if (!ticket) throw new NotFoundError("Ticket");
  return ticket;
}

const messageInput = z.object({
  ticketId: z.string().cuid(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  authorType: z.enum(["CUSTOMER", "AGENT", "SYSTEM"]),
  channel: z.enum(["WEBSITE", "EMAIL", "PHONE", "WHATSAPP", "SOCIAL_MEDIA", "MARKETPLACE", "WALK_IN", "MANUAL_ENTRY"]),
  body: z.string().min(1).max(10000),
});

export async function addSupportMessage(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = messageInput.parse(input);
  const ticket = await assertTicketInOrg(data.ticketId, principal.organizationKey);
  const message = await prisma.supportMessage.create({
    data: { organizationKey: principal.organizationKey, ...data, authorId: data.authorType === "AGENT" ? principal.id : null },
  });
  // SLA clock resumes on the next inbound customer reply while paused.
  if (data.direction === "INBOUND" && ticket.slaPaused) {
    const pausedMinutes = ticket.slaPausedAt ? Math.round((Date.now() - ticket.slaPausedAt.getTime()) / 60000) : 0;
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { slaPaused: false, slaPausedAt: null, slaPausedMinutes: ticket.slaPausedMinutes + pausedMinutes, version: { increment: 1 } } });
  }
  return message;
}

export async function listSupportMessages(ticketId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  await assertTicketInOrg(ticketId, principal.organizationKey);
  return prisma.supportMessage.findMany({ where: { organizationKey: principal.organizationKey, ticketId }, orderBy: { sentAt: "asc" } });
}

const noteInput = z.object({ ticketId: z.string().cuid(), body: z.string().min(1).max(5000) });

export async function addTicketNote(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = noteInput.parse(input);
  await assertTicketInOrg(data.ticketId, principal.organizationKey);
  return prisma.supportTicketNote.create({ data: { organizationKey: principal.organizationKey, ticketId: data.ticketId, authorId: principal.id, body: data.body } });
}

export async function listTicketNotes(ticketId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  await assertTicketInOrg(ticketId, principal.organizationKey);
  return prisma.supportTicketNote.findMany({ where: { organizationKey: principal.organizationKey, ticketId }, orderBy: { createdAt: "asc" } });
}

const attachmentInput = z.object({ ticketId: z.string().cuid(), url: z.string().url(), fileName: z.string().min(1).max(200), fileType: z.string().min(1).max(80) });

export async function addAttachment(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = attachmentInput.parse(input);
  await assertTicketInOrg(data.ticketId, principal.organizationKey);
  return prisma.supportAttachment.create({ data: { organizationKey: principal.organizationKey, ...data, uploadedById: principal.id } });
}

export async function listAttachments(ticketId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  await assertTicketInOrg(ticketId, principal.organizationKey);
  return prisma.supportAttachment.findMany({ where: { organizationKey: principal.organizationKey, ticketId }, orderBy: { uploadedAt: "asc" } });
}

const followUpInput = z.object({ ticketId: z.string().cuid(), dueAt: z.coerce.date(), assignedToId: z.string().cuid(), note: z.string().max(1000).optional() });

export async function scheduleFollowUp(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = followUpInput.parse(input);
  await assertTicketInOrg(data.ticketId, principal.organizationKey);
  const followUp = await prisma.supportFollowUp.create({ data: { organizationKey: principal.organizationKey, ...data, createdById: principal.id } });
  await recordEnterpriseMutation(prisma as never, principal, { module: "support", action: "FOLLOW_UP_SCHEDULED", entityType: "SupportTicket", entityId: data.ticketId, description: `Follow-up scheduled for ${data.dueAt.toISOString()}` }).catch(() => {});
  return followUp;
}

export async function completeFollowUp(id: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const followUp = await prisma.supportFollowUp.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!followUp) throw new NotFoundError("Follow-up");
  return prisma.supportFollowUp.update({ where: { id }, data: { status: "DONE", completedAt: new Date() } });
}

export async function listMyFollowUps(includeDone = false) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportFollowUp.findMany({
    where: { organizationKey: principal.organizationKey, assignedToId: principal.id, ...(includeDone ? {} : { status: "PENDING" }) },
    orderBy: { dueAt: "asc" },
  });
}
