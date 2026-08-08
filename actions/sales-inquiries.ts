"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { inquiryScope } from "@/lib/sales-channel/repository";

export async function assignInquiry(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.INQUIRIES_ASSIGN);
    const data = z.object({ inquiryId: z.string().cuid(), ownerId: z.string().cuid().nullable(), queueId: z.string().cuid().nullable() }).parse(input);
    const scope = await inquiryScope();
    const previous = await prisma.salesInquiry.findFirstOrThrow({ where: { id: data.inquiryId, AND: scope } });
    const updated = await prisma.$transaction(async (tx) => {
      const inquiry = await tx.salesInquiry.update({ where: { id: data.inquiryId }, data: { assignedOwnerId: data.ownerId, assignmentQueueId: data.queueId } });
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, eventType: previous.assignedOwnerId ? "REASSIGNMENT" : "ASSIGNMENT", customerId: inquiry.customerId, inquiryId: inquiry.id, relatedRecordType: "SalesInquiry", relatedRecordId: inquiry.id, description: "Inquiry assignment changed" } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "inquiries", action: previous.assignedOwnerId ? "REASSIGNMENT" : "ASSIGNMENT", recordType: "SalesInquiry", recordId: inquiry.id, previousValue: { ownerId: previous.assignedOwnerId, queueId: previous.assignmentQueueId }, newValue: { ownerId: data.ownerId, queueId: data.queueId } } });
      return inquiry;
    });
    revalidatePath("/sales/inquiries");
    return { success: true as const, data: { id: updated.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function changeInquiryStatus(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.INQUIRIES_CHANGE_STATUS);
    const data = z.object({ inquiryId: z.string().cuid(), statusCode: z.string().min(2).max(50) }).parse(input);
    const scope = await inquiryScope();
    const current = await prisma.salesInquiry.findFirstOrThrow({ where: { id: data.inquiryId, AND: scope }, include: { status: true } });
    const target = await prisma.salesInquiryStatus.findUniqueOrThrow({ where: { code: data.statusCode } });
    const transition = await prisma.salesInquiryStatusTransition.findUnique({ where: { fromStatusId_toStatusId: { fromStatusId: current.statusId, toStatusId: target.id } } });
    if (!transition && current.status.code !== "NEW") throw new Error("Invalid status transition");
    await prisma.$transaction([
      prisma.salesInquiry.update({ where: { id: current.id }, data: { statusId: target.id, closedAt: target.terminal ? new Date() : null } }),
      prisma.salesTimelineEvent.create({ data: { actorId: actor.id, eventType: "STATUS_CHANGE", customerId: current.customerId, inquiryId: current.id, relatedRecordType: "SalesInquiry", relatedRecordId: current.id, description: `${current.status.displayName} → ${target.displayName}` } }),
      prisma.salesAuditLog.create({ data: { userId: actor.id, module: "inquiries", action: "STATUS_CHANGE", recordType: "SalesInquiry", recordId: current.id, previousValue: { status: current.status.code }, newValue: { status: target.code } } }),
    ]);
    revalidatePath(`/sales/inquiries/${current.id}`);
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}

export async function addInquiryNote(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.TIMELINE_VIEW);
    const data = z.object({ inquiryId: z.string().cuid(), body: z.string().trim().min(1).max(5000) }).parse(input);
    const allowed = await prisma.salesInquiry.findFirstOrThrow({ where: { id: data.inquiryId, AND: await inquiryScope() }, select: { id: true, customerId: true } });
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.salesInquiryNote.create({ data: { inquiryId: allowed.id, authorId: actor.id, body: data.body } });
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, eventType: "NOTE_ADDED", customerId: allowed.customerId, inquiryId: allowed.id, relatedRecordType: "SalesInquiryNote", relatedRecordId: created.id, description: "Internal note added" } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "inquiries", action: "NOTE_ADDED", recordType: "SalesInquiryNote", recordId: created.id } });
      return created;
    });
    revalidatePath(`/sales/inquiries/${allowed.id}`);
    return { success: true as const, data: { id: note.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function updateFollowUp(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.FOLLOWUPS_MANAGE);
    const data = z.object({ id: z.string().cuid().optional(), inquiryId: z.string().cuid(), dueAt: z.coerce.date(), description: z.string().min(1).max(2000), status: z.enum(["PENDING", "COMPLETED", "RESCHEDULED", "CANCELLED"]).default("PENDING") }).parse(input);
    const inquiry = await prisma.salesInquiry.findFirstOrThrow({ where: { id: data.inquiryId, AND: await inquiryScope() } });
    const task = await prisma.$transaction(async (tx) => {
      const value = data.id
        ? await tx.salesFollowUpTask.update({ where: { id: data.id, ownerId: actor.id }, data: { dueAt: data.dueAt, description: data.description, status: data.status, completedAt: data.status === "COMPLETED" ? new Date() : null } })
        : await tx.salesFollowUpTask.create({ data: { taskType: "FOLLOW_UP", ownerId: actor.id, customerId: inquiry.customerId, inquiryId: inquiry.id, priority: inquiry.priority, dueAt: data.dueAt, description: data.description, status: data.status } });
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, eventType: data.id ? `FOLLOW_UP_${data.status}` : "FOLLOW_UP_CREATED", customerId: inquiry.customerId, inquiryId: inquiry.id, relatedRecordType: "SalesFollowUpTask", relatedRecordId: value.id, description: data.id ? `Follow-up ${data.status.toLowerCase()}` : "Follow-up created" } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "inquiries", action: data.id ? `FOLLOW_UP_${data.status}` : "FOLLOW_UP_CREATED", recordType: "SalesFollowUpTask", recordId: value.id } });
      return value;
    });
    revalidatePath(`/sales/inquiries/${inquiry.id}`);
    return { success: true as const, data: { id: task.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function reviewApplication(input: unknown) {
  try {
    const data = z.object({ inquiryId: z.string().cuid(), statusCode: z.enum(["UNDER_REVIEW", "INFORMATION_REQUIRED", "VERIFIED", "APPROVED", "REJECTED", "ON_HOLD", "WITHDRAWN"]), remarks: z.string().max(2000).optional() }).parse(input);
    const permission = data.statusCode === "APPROVED" ? PERMISSIONS.APPLICATIONS_APPROVE : data.statusCode === "REJECTED" ? PERMISSIONS.APPLICATIONS_REJECT : PERMISSIONS.APPLICATIONS_REVIEW;
    const actor = await requirePermission(permission);
    const status = await prisma.salesApplicationStatus.findUniqueOrThrow({ where: { code: data.statusCode } });
    const inquiry = await prisma.salesInquiry.findFirstOrThrow({ where: { id: data.inquiryId, AND: await inquiryScope() } });
    await prisma.$transaction(async (tx) => {
      const updates = { applicationStatusId: status.id, remarks: data.remarks };
      const count = (await tx.dealerApplicationDetail.updateMany({ where: { inquiryId: inquiry.id }, data: updates })).count
        + (await tx.distributorApplicationDetail.updateMany({ where: { inquiryId: inquiry.id }, data: updates })).count
        + (await tx.franchiseInquiryDetail.updateMany({ where: { inquiryId: inquiry.id }, data: updates })).count;
      if (!count) throw new Error("Inquiry is not an application");
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, eventType: `APPLICATION_${data.statusCode}`, customerId: inquiry.customerId, inquiryId: inquiry.id, relatedRecordType: "SalesInquiry", relatedRecordId: inquiry.id, description: `Application ${data.statusCode.toLowerCase().replaceAll("_", " ")}` } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "applications", action: `APPLICATION_${data.statusCode}`, recordType: "SalesInquiry", recordId: inquiry.id, newValue: { status: data.statusCode } } });
    });
    revalidatePath(`/sales/inquiries/${inquiry.id}`);
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}

export async function mergeCustomers(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    if (!actor.isFounder) throw new Error("Customer merges require Founder approval");
    const data = z.object({ sourceCustomerId: z.string().cuid(), targetCustomerId: z.string().cuid(), reason: z.string().min(5).max(1000) }).parse(input);
    if (data.sourceCustomerId === data.targetCustomerId) throw new Error("Customers must be different");
    const [source, target] = await Promise.all([prisma.customer.findUniqueOrThrow({ where: { id: data.sourceCustomerId } }), prisma.customer.findUniqueOrThrow({ where: { id: data.targetCustomerId } })]);
    await prisma.$transaction(async (tx) => {
      await tx.salesInquiry.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      await tx.salesTimelineEvent.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      await tx.salesFollowUpTask.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "customers", action: "CUSTOMER_MERGED", recordType: "Customer", recordId: target.id, previousValue: { source, target }, newValue: { targetId: target.id, reason: data.reason } } });
      await tx.customer.update({ where: { id: source.id }, data: { crmStatus: "MERGED" } });
    });
    return { success: true as const, data: { id: target.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function changeCustomerClassification(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const data = z.object({ customerId: z.string().cuid(), customerTypeId: z.string().cuid(), reason: z.string().min(3).max(1000) }).parse(input);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: data.customerId } });
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customer.id }, data: { customerTypeId: data.customerTypeId } }),
      prisma.customerClassificationHistory.create({ data: { customerId: customer.id, fromTypeId: customer.customerTypeId, toTypeId: data.customerTypeId, changedById: actor.id, reason: data.reason } }),
      prisma.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: customer.id, eventType: "CUSTOMER_CLASSIFICATION_CHANGED", relatedRecordType: "Customer", relatedRecordId: customer.id, description: "Customer classification changed" } }),
      prisma.salesAuditLog.create({ data: { userId: actor.id, module: "customers", action: "CUSTOMER_CLASSIFICATION_CHANGED", recordType: "Customer", recordId: customer.id, previousValue: { customerTypeId: customer.customerTypeId }, newValue: { customerTypeId: data.customerTypeId } } }),
    ]);
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}
