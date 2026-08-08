import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";
import { recordFinanceEvent } from "@/lib/enterprise-finance/event-posting-service";
import { refundOrder } from "@/actions/orders";

/**
 * Return Service + Refund Request Service + Warranty Service. Refund
 * approval NEVER writes accounting entries directly — it always routes
 * through the one sanctioned bridge: refundOrder (D2C, existing actions/orders.ts,
 * self-enforces requireStaff) or recordFinanceEvent (institutional, Milestone
 * 8's Critical Event Processing Safeguard). Support never touches
 * FinanceLedgerEntry.
 */

const returnInput = z.object({ ticketId: z.string().cuid(), orderId: z.string().cuid(), orderItemId: z.string().cuid().optional(), requestType: z.enum(["RETURN", "REPLACEMENT"]) });

export async function createReturnRequest(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_RETURNS_MANAGE);
  const data = returnInput.parse(input);
  const ticket = await prisma.supportTicket.findFirst({ where: { id: data.ticketId, organizationKey: principal.organizationKey } });
  if (!ticket) throw new NotFoundError("Ticket");
  const existing = await prisma.supportReturnRequest.findUnique({ where: { ticketId: data.ticketId } });
  if (existing) throw new ConflictError("This ticket already has a return request");
  const entity = await prisma.supportReturnRequest.create({ data: { organizationKey: principal.organizationKey, ...data } });
  await recordEnterpriseMutation(prisma as never, principal, { module: "support", action: "RETURN_REQUEST_CREATED", entityType: "SupportTicket", entityId: data.ticketId, description: `${data.requestType} requested on order ${data.orderId}` }).catch(() => {});
  return entity;
}

export async function approveReturnRequest(ticketId: string, expectedVersion: number) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_RETURNS_MANAGE);
  const current = await prisma.supportReturnRequest.findFirst({ where: { ticketId, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Return request");
  if (current.version !== expectedVersion) throw new ConflictError("Return request changed; refresh and retry");
  if (current.status !== "SUBMITTED") throw new AppError("Only a submitted return request can be approved", 409, "INVALID_TRANSITION");
  return prisma.supportReturnRequest.update({ where: { ticketId }, data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
}

export async function listReturnRequests(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.supportReturnRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportReturnRequest.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// --- Refund Requests ---

const refundInput = z.object({
  ticketId: z.string().cuid(),
  orderId: z.string().cuid().optional(),
  instOrderId: z.string().cuid().optional(),
  requestedAmount: z.coerce.number().positive(),
  reason: z.string().min(3).max(500),
});

export async function createRefundRequest(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REFUNDS_PREPARE);
  const data = refundInput.parse(input);
  if (!data.orderId && !data.instOrderId) throw new AppError("A refund request must reference an order", 422, "VALIDATION_ERROR");
  const ticket = await prisma.supportTicket.findFirst({ where: { id: data.ticketId, organizationKey: principal.organizationKey } });
  if (!ticket) throw new NotFoundError("Ticket");
  const existing = await prisma.supportRefundRequest.findUnique({ where: { ticketId: data.ticketId } });
  if (existing) throw new ConflictError("This ticket already has a refund request");
  const entity = await prisma.supportRefundRequest.create({
    data: { organizationKey: principal.organizationKey, ticketId: data.ticketId, orderId: data.orderId, instOrderId: data.instOrderId, requestedAmount: new Prisma.Decimal(data.requestedAmount), reason: data.reason, preparedById: principal.id },
  });
  await recordEnterpriseMutation(prisma as never, principal, { module: "support", action: "REFUND_REQUEST_PREPARED", entityType: "SupportTicket", entityId: data.ticketId, description: `Refund of ${data.requestedAmount} requested: ${data.reason}` }).catch(() => {});
  return entity;
}

/**
 * Maker-checker: approver must differ from the preparer. On approval, this
 * is the ONLY place a refund actually executes — routed to the D2C
 * refundOrder action or Milestone 8's recordFinanceEvent, never a direct
 * write. Duplicate-refund protection: an order already fully refunded is
 * rejected before either bridge is called.
 */
export async function approveRefundRequest(ticketId: string, expectedVersion: number) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REFUNDS_APPROVE);
  const current = await prisma.supportRefundRequest.findFirst({ where: { ticketId, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Refund request");
  if (current.version !== expectedVersion) throw new ConflictError("Refund request changed; refresh and retry");
  if (current.status !== "PENDING_APPROVAL") throw new AppError("Only a pending refund request can be approved", 409, "INVALID_TRANSITION");
  if (current.preparedById === principal.id) throw new AppError("The approver must be different from the person who prepared this refund request", 403, "SEGREGATION_OF_DUTIES");

  if (current.orderId) {
    const order = await prisma.order.findUnique({ where: { id: current.orderId } });
    if (!order) throw new NotFoundError("Order");
    if (order.paymentStatus === "REFUNDED") throw new ConflictError("This order has already been fully refunded");
    const result = await refundOrder({ orderId: current.orderId, amount: Number(current.requestedAmount), reason: current.reason });
    if (!result.success) throw new AppError(result.error.message, 422, "REFUND_FAILED");
    return prisma.supportRefundRequest.update({ where: { ticketId }, data: { status: "PROCESSED", approvedById: principal.id, approvedAt: new Date(), processedAt: new Date(), version: { increment: 1 } } });
  }

  // Institutional order — bridge through Milestone 8's Critical Event
  // Processing Safeguard. The idempotency key (support:REFUND_APPROVED:ticketId)
  // guarantees a second approval attempt (e.g. a retried request) can never
  // post the refund twice.
  const eventResult = await recordFinanceEvent({
    actingUserId: principal.id, sourceModule: "support", sourceEventAction: "REFUND_APPROVED",
    sourceRecordId: ticketId, amount: Number(current.requestedAmount), description: `Support refund approved: ${current.reason}`,
  });
  const entity = await prisma.supportRefundRequest.update({
    where: { ticketId },
    data: {
      status: eventResult.status === "POSTED" ? "PROCESSED" : eventResult.status === "FAILED" ? "PENDING_APPROVAL" : "APPROVED",
      approvedById: principal.id, approvedAt: new Date(),
      processedAt: eventResult.status === "POSTED" ? new Date() : null,
      version: { increment: 1 },
    },
  });
  if (eventResult.status === "FAILED") throw new AppError("Refund approved but the finance posting failed — visible in Finance Exceptions for retry", 422, "FINANCE_POSTING_FAILED");
  return entity;
}

export async function rejectRefundRequest(ticketId: string, expectedVersion: number, reason: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REFUNDS_APPROVE);
  const current = await prisma.supportRefundRequest.findFirst({ where: { ticketId, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Refund request");
  if (current.version !== expectedVersion) throw new ConflictError("Refund request changed; refresh and retry");
  if (current.status !== "PENDING_APPROVAL") throw new AppError("Only a pending refund request can be rejected", 409, "INVALID_TRANSITION");
  return prisma.supportRefundRequest.update({ where: { ticketId }, data: { status: "REJECTED", rejectedReason: reason, version: { increment: 1 } } });
}

export async function listRefundRequests(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.supportRefundRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportRefundRequest.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// --- Warranty ---

const warrantyInput = z.object({
  customerId: z.string().cuid(), productId: z.string().cuid(), variantId: z.string().cuid().optional(), orderId: z.string().cuid().optional(),
  serialOrBatchRef: z.string().max(120).optional(), purchaseDate: z.coerce.date(), warrantyMonths: z.coerce.number().int().positive().default(12),
});

export async function registerWarranty(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_WARRANTY_MANAGE);
  const data = warrantyInput.parse(input);
  const warrantyExpiresAt = new Date(data.purchaseDate);
  warrantyExpiresAt.setMonth(warrantyExpiresAt.getMonth() + data.warrantyMonths);
  return prisma.warrantyRegistration.create({
    data: { organizationKey: principal.organizationKey, customerId: data.customerId, productId: data.productId, variantId: data.variantId, orderId: data.orderId, serialOrBatchRef: data.serialOrBatchRef, purchaseDate: data.purchaseDate, warrantyExpiresAt, registeredById: principal.id },
  });
}

export async function getWarrantyStatus(customerId: string, productId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const registration = await prisma.warrantyRegistration.findFirst({ where: { organizationKey: principal.organizationKey, customerId, productId }, orderBy: { createdAt: "desc" } });
  if (!registration) return { registered: false as const };
  return { registered: true as const, active: registration.warrantyExpiresAt > new Date() && registration.status === "ACTIVE", registration };
}

export async function listWarrantyRegistrations(customerId?: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  return prisma.warrantyRegistration.findMany({ where: { organizationKey: principal.organizationKey, ...(customerId ? { customerId } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
}
