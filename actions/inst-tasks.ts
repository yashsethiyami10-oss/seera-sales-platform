"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { createTaskSchema, updateTaskStatusSchema, listTasksQuerySchema } from "@/lib/validations/inst-sales";

export async function createTask(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_TASKS_MANAGE);
    const data = createTaskSchema.parse(input);
    const task = await prisma.instTask.create({
      data: { ...data, assignedToId: data.assignedToId ?? principal.id, assignedById: data.assignedToId && data.assignedToId !== principal.id ? principal.id : null },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "TASK_CREATED", recordType: "InstTask", recordId: task.id, newValue: { title: task.title, type: task.type } });
    revalidatePath("/os/sales/tasks");
    return { success: true as const, data: task };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateTaskStatus(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_TASKS_MANAGE);
    const data = updateTaskStatusSchema.parse(input);
    const existing = await prisma.instTask.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Task");

    const updated = await prisma.instTask.update({
      where: { id: data.id },
      data: { status: data.status, completedAt: data.status === "COMPLETED" ? new Date() : null },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "TASK_STATUS_CHANGED", recordType: "InstTask", recordId: data.id, previousValue: { status: existing.status }, newValue: { status: updated.status } });
    revalidatePath("/os/sales/tasks");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listTasks(input?: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_TASKS_MANAGE);
    const query = listTasksQuerySchema.parse(input ?? {});
    const where = {
      AND: [
        query.assignedToId ? { assignedToId: query.assignedToId } : principal.isFounder ? {} : { assignedToId: principal.id },
        query.status ? { status: query.status } : {},
        query.type ? { type: query.type } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.instTask.findMany({
        where, orderBy: [{ status: "asc" }, { dueDate: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { assignedTo: { select: { name: true } }, assignedBy: { select: { name: true } }, lead: { select: { organizationName: true } }, opportunity: { select: { opportunityNumber: true } } },
      }),
      prisma.instTask.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Officer Dashboard's "Today's Plan / Tasks" widget. */
export async function getTodaysTasks(userId: string) {
  try {
    await requirePermission(PERMISSIONS.INST_TASKS_MANAGE);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const tasks = await prisma.instTask.findMany({
      where: { assignedToId: userId, status: { in: ["PENDING", "IN_PROGRESS"] }, OR: [{ dueDate: { lte: endOfDay } }, { dueDate: null }] },
      orderBy: [{ dueDate: "asc" }],
      take: 20,
    });
    return { success: true as const, data: tasks };
  } catch (err) {
    return toErrorResponse(err);
  }
}
