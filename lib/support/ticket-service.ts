import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import type { EnterprisePrincipal } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";
import { TICKET_STATUS_TRANSITIONS } from "./domain";
import { computeSlaDueDates } from "./sla-service";

/**
 * Ticket Service + Lifecycle Service + Assignment Service + Department
 * Routing. The root of Milestone 9 — every other Support service (Product
 * Issue, Return, Refund, Warranty, Communication, Escalation) hangs off a
 * SupportTicket created here.
 */

function scopeWhere(principal: EnterprisePrincipal, viewAllKey: string, assignedField: string) {
  if (principal.isFounder || principal.permissions.has(viewAllKey)) return {};
  return { [assignedField]: principal.id };
}

const createTicketInput = z.object({
  channel: z.enum(["WEBSITE", "EMAIL", "PHONE", "WHATSAPP", "SOCIAL_MEDIA", "MARKETPLACE", "WALK_IN", "MANUAL_ENTRY"]),
  category: z.enum(["GENERAL_INQUIRY", "COMPLAINT", "PRODUCT_ISSUE", "RETURN_REPLACEMENT", "REFUND", "WARRANTY_CLAIM", "ORDER_STATUS", "BILLING", "FEEDBACK"]),
  subject: z.string().min(3).max(200),
  description: z.string().min(1).max(5000),
  customerId: z.string().cuid(),
  departmentId: z.string().cuid(),
  orderId: z.string().cuid().optional(),
  instOrderId: z.string().cuid().optional(),
  productId: z.string().cuid().optional(),
  variantId: z.string().cuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]).default("NORMAL"),
  severity: z.string().max(40).optional(),
  caseType: z.enum(["SIMPLE", "COMPLEX"]).default("SIMPLE"),
});

export async function createSupportTicket(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = createTicketInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundError("Customer");
    const department = await tx.supportDepartment.findFirst({ where: { id: data.departmentId, organizationKey: principal.organizationKey, active: true } });
    if (!department) throw new NotFoundError("Department");

    const ticketNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "SUPPORT_TICKET", "TKT");
    const { policyId, responseDueAt, resolutionDueAt } = await computeSlaDueDates(tx, principal.organizationKey, data.category, data.priority);

    const ticket = await tx.supportTicket.create({
      data: {
        organizationKey: principal.organizationKey, ticketNumber, channel: data.channel, category: data.category,
        caseType: data.caseType, subject: data.subject, description: data.description, customerId: data.customerId,
        departmentId: data.departmentId, orderId: data.orderId, instOrderId: data.instOrderId, productId: data.productId,
        variantId: data.variantId, priority: data.priority, severity: data.severity,
        slaPolicyId: policyId, responseDueAt, resolutionDueAt, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_CREATED", entityType: "SupportTicket", entityId: ticket.id, description: `Ticket ${ticketNumber} created (${data.category})` });
    return ticket;
  });
}

export async function getSupportTicketDetail(id: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, organizationKey: principal.organizationKey },
    include: {
      department: true, productIssueReport: true, returnRequest: true, refundRequest: true,
      messages: { orderBy: { sentAt: "asc" } }, notes: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { uploadedAt: "asc" } }, followUps: { orderBy: { dueAt: "asc" } },
      escalations: { orderBy: { escalatedAt: "asc" } }, csatResponse: true,
    },
  });
  if (!ticket) throw new NotFoundError("Ticket");
  if (!principal.isFounder && !principal.permissions.has(PERMISSIONS.SUPPORT_TICKETS_VIEW_ALL) && ticket.assignedToId !== principal.id) {
    throw new AppError("You can only view tickets assigned to you", 403, "FORBIDDEN");
  }
  const customer = await prisma.customer.findUnique({ where: { id: ticket.customerId }, select: { id: true, name: true, email: true, phone: true } });
  return { ...ticket, customer };
}

export async function listSupportTickets(input: { status?: string; priority?: string; category?: string; channel?: string; departmentId?: string; assignedToId?: string; customerId?: string; q?: string; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...scopeWhere(principal, PERMISSIONS.SUPPORT_TICKETS_VIEW_ALL, "assignedToId"),
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.priority ? { priority: input.priority as never } : {}),
    ...(input.category ? { category: input.category as never } : {}),
    ...(input.channel ? { channel: input.channel as never } : {}),
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.q ? { OR: [{ subject: { contains: input.q, mode: "insensitive" as const } }, { ticketNumber: { contains: input.q, mode: "insensitive" as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({ where, include: { department: true }, orderBy: [{ priority: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function assignTicket(id: string, expectedVersion: number, assignedToId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_ASSIGN);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportTicket.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Ticket");
    if (current.version !== expectedVersion) throw new ConflictError("Ticket changed; refresh and retry");
    const nextStatus = current.status === "NEW" ? "ASSIGNED" : current.status;
    const entity = await tx.supportTicket.update({ where: { id }, data: { assignedToId, status: nextStatus, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_ASSIGNED", entityType: "SupportTicket", entityId: id, description: `Ticket ${current.ticketNumber} assigned` });
    return entity;
  });
}

export async function transferDepartment(id: string, expectedVersion: number, departmentId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportTicket.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Ticket");
    if (current.version !== expectedVersion) throw new ConflictError("Ticket changed; refresh and retry");
    const department = await tx.supportDepartment.findFirst({ where: { id: departmentId, organizationKey: principal.organizationKey, active: true } });
    if (!department) throw new NotFoundError("Department");
    // Ticket identity (number, history) is preserved across the handoff —
    // only the owning department changes, never a new ticket.
    const entity = await tx.supportTicket.update({ where: { id }, data: { departmentId, assignedToId: null, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_DEPARTMENT_TRANSFERRED", entityType: "SupportTicket", entityId: id, description: `Ticket ${current.ticketNumber} transferred to ${department.name}` });
    return entity;
  });
}

export async function setPriority(id: string, expectedVersion: number, priority: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportTicket.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Ticket");
    if (current.version !== expectedVersion) throw new ConflictError("Ticket changed; refresh and retry");
    const entity = await tx.supportTicket.update({ where: { id }, data: { priority: priority as never, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_PRIORITY_CHANGED", entityType: "SupportTicket", entityId: id, description: `Ticket ${current.ticketNumber} priority set to ${priority}` });
    return entity;
  });
}

export async function transitionTicketStatus(id: string, expectedVersion: number, status: string, reason?: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportTicket.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Ticket");
    if (current.version !== expectedVersion) throw new ConflictError("Ticket changed; refresh and retry");
    if (status === "REOPENED") throw new AppError("Use reopenTicket to reopen a ticket", 409, "INVALID_TRANSITION");
    const allowed = TICKET_STATUS_TRANSITIONS[current.status];
    if (!allowed.includes(status as never)) throw new AppError(`Cannot move ticket from ${current.status} to ${status}`, 409, "INVALID_TRANSITION");
    if ((status === "CLOSED" && current.status === "NEW") && !reason) throw new AppError("A reason is required to close a new ticket without work", 422, "VALIDATION_ERROR");

    const now = new Date();
    const data: Record<string, unknown> = { status, version: { increment: 1 } };
    if (!current.firstRespondedAt && (status === "IN_PROGRESS" || status === "WAITING_ON_CUSTOMER")) data.firstRespondedAt = now;
    if (status === "WAITING_ON_CUSTOMER" && !current.slaPaused) { data.slaPaused = true; data.slaPausedAt = now; }
    if (current.slaPaused && status !== "WAITING_ON_CUSTOMER") {
      const pausedMinutes = current.slaPausedAt ? Math.round((now.getTime() - current.slaPausedAt.getTime()) / 60000) : 0;
      data.slaPaused = false; data.slaPausedAt = null; data.slaPausedMinutes = current.slaPausedMinutes + pausedMinutes;
    }
    if (status === "RESOLVED") { data.resolvedAt = now; data.resolvedById = principal.id; }
    if (status === "CLOSED") data.closedAt = now;

    const entity = await tx.supportTicket.update({ where: { id }, data });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_STATUS_CHANGED", entityType: "SupportTicket", entityId: id, description: `Ticket ${current.ticketNumber} ${current.status} -> ${status}${reason ? `: ${reason}` : ""}` });

    if (status === "RESOLVED") {
      // CSAT survey fires exactly once, on the RESOLVED edge — reopening and
      // re-resolving does not create a second request (unique on ticketId).
      await tx.supportCsatResponse.upsert({ where: { ticketId: id }, create: { organizationKey: principal.organizationKey, ticketId: id, score: 0, requestedAt: now }, update: {} }).catch(() => {});
    }
    return entity;
  });
}

export async function reopenTicket(id: string, expectedVersion: number, reason: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_REOPEN);
  if (!reason || reason.trim().length < 3) throw new AppError("A reason is required to reopen a ticket", 422, "VALIDATION_ERROR");
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportTicket.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Ticket");
    if (current.version !== expectedVersion) throw new ConflictError("Ticket changed; refresh and retry");
    if (!["RESOLVED", "CLOSED"].includes(current.status)) throw new AppError("Only a resolved or closed ticket can be reopened", 409, "INVALID_TRANSITION");
    const entity = await tx.supportTicket.update({
      where: { id },
      data: { status: "REOPENED", reopenedCount: { increment: 1 }, resolvedAt: null, closedAt: null, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_REOPENED", entityType: "SupportTicket", entityId: id, description: `Ticket ${current.ticketNumber} reopened: ${reason}` });
    return entity;
  });
}

// --- Department Master ---

export async function createDepartment(input: { code: string; name: string }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_DEPARTMENTS_MANAGE);
  return prisma.supportDepartment.create({ data: { organizationKey: principal.organizationKey, code: input.code, name: input.name } });
}

export async function listDepartments() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportDepartment.findMany({ where: { organizationKey: principal.organizationKey, active: true }, orderBy: { name: "asc" } });
}
