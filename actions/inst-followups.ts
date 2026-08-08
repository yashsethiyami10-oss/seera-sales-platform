"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { createFollowUpSchema, listFollowUpsQuerySchema } from "@/lib/validations/inst-sales";
import { z } from "zod";

export async function createFollowUp(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_FOLLOWUPS_MANAGE);
    const data = createFollowUpSchema.parse(input);
    const followUp = await prisma.instFollowUp.create({
      data: { ...data, assignedToId: data.assignedToId ?? principal.id },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "FOLLOWUP_CREATED", recordType: "InstFollowUp", recordId: followUp.id, newValue: { type: followUp.type, dueDate: followUp.dueDate } });
    revalidatePath("/os/sales/followups");
    return { success: true as const, data: followUp };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function completeFollowUp(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_FOLLOWUPS_MANAGE);
    const { id } = z.object({ id: z.string().cuid() }).parse(input);
    const existing = await prisma.instFollowUp.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Follow-up");

    const updated = await prisma.instFollowUp.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "FOLLOWUP_COMPLETED", recordType: "InstFollowUp", recordId: id });
    revalidatePath("/os/sales/followups");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function cancelFollowUp(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_FOLLOWUPS_MANAGE);
    const { id } = z.object({ id: z.string().cuid() }).parse(input);
    const updated = await prisma.instFollowUp.update({ where: { id }, data: { status: "CANCELLED" } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "FOLLOWUP_CANCELLED", recordType: "InstFollowUp", recordId: id });
    revalidatePath("/os/sales/followups");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * "Overdue" is computed here (dueDate < now && status === PENDING), never
 * stored — a stored status would drift stale the moment a due date passes
 * without a write happening to update it.
 */
export async function listFollowUps(input?: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_FOLLOWUPS_MANAGE);
    const query = listFollowUpsQuerySchema.parse(input ?? {});
    const now = new Date();
    const where = {
      AND: [
        query.assignedToId ? { assignedToId: query.assignedToId } : principal.isFounder ? {} : { assignedToId: principal.id },
        query.status ? { status: query.status } : {},
        query.overdueOnly ? { status: "PENDING" as const, dueDate: { lt: now } } : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instFollowUp.findMany({
        where, orderBy: { dueDate: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { customer: { select: { name: true } }, lead: { select: { organizationName: true } }, opportunity: { select: { opportunityNumber: true } }, assignedTo: { select: { name: true } } },
      }),
      prisma.instFollowUp.count({ where }),
    ]);

    const withOverdue = items.map((f) => ({ ...f, isOverdue: f.status === "PENDING" && f.dueDate < now }));
    return { success: true as const, data: { items: withOverdue, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getOverdueFollowUpCount(userId: string) {
  try {
    await requirePermission(PERMISSIONS.INST_FOLLOWUPS_MANAGE);
    const count = await prisma.instFollowUp.count({ where: { assignedToId: userId, status: "PENDING", dueDate: { lt: new Date() } } });
    return { success: true as const, data: count };
  } catch (err) {
    return toErrorResponse(err);
  }
}
