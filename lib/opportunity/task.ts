import { prisma } from "@/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";

type Actor = { id: string };

export async function saveTask(actor: Actor, input: {
  id?: string; opportunityId: string; ownerUserId: string; typeCode: string;
  priorityCode: string; statusCode: string; title: string; description?: string;
  dueDate: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findUnique({ where: { id: input.opportunityId } });
    if (!opportunity) throw new NotFoundError("Opportunity");
    const [owner, type, priority, status] = await Promise.all([
      tx.user.findFirst({ where: { id: input.ownerUserId, active: true } }),
      tx.opportunityTaskType.findFirst({ where: { code: input.typeCode, active: true } }),
      tx.opportunityPriority.findFirst({ where: { code: input.priorityCode, active: true } }),
      tx.opportunityTaskStatus.findFirst({ where: { code: input.statusCode, active: true } }),
    ]);
    if (!owner || !type || !priority || !status) throw new AppError("Invalid task configuration or owner");
    const before = input.id ? await tx.opportunityTask.findUnique({ where: { id: input.id } }) : null;
    const completedAt = status.code === "COMPLETED" ? new Date() : null;
    const task = input.id
      ? await tx.opportunityTask.update({ where: { id: input.id, opportunityId: opportunity.id }, data: {
          ownerUserId: owner.id, taskTypeId: type.id, priorityId: priority.id, statusId: status.id,
          title: input.title, description: input.description, dueDate: input.dueDate, completedAt,
        } })
      : await tx.opportunityTask.create({ data: { opportunityId: opportunity.id, customerId: opportunity.customerId,
          ownerUserId: owner.id, assignedBy: actor.id, taskTypeId: type.id, priorityId: priority.id,
          statusId: status.id, title: input.title, description: input.description, dueDate: input.dueDate, completedAt } });
    const action = !before ? "TASK_CREATED" : before.ownerUserId !== owner.id ? "TASK_ASSIGNED" :
      before.dueDate.getTime() !== input.dueDate.getTime() ? "TASK_RESCHEDULED" : `TASK_${status.code}`;
    await tx.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: opportunity.customerId,
      eventType: action, relatedRecordType: "OpportunityTask", relatedRecordId: task.id, description: input.title } });
    await tx.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action,
      recordType: "OpportunityTask", recordId: task.id, previousValue: before ? { owner: before.ownerUserId, dueDate: before.dueDate, statusId: before.statusId } : undefined,
      newValue: { owner: owner.id, dueDate: input.dueDate, status: status.code } } });
    await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: action, recipient: owner.email, status: "PENDING" } });
    return task;
  });
}

export async function markOverdueTasks() {
  const overdue = await prisma.opportunityTaskStatus.findUnique({ where: { code: "OVERDUE" } });
  if (!overdue) return 0;
  const terminal = await prisma.opportunityTaskStatus.findMany({ where: { code: { in: ["COMPLETED", "CANCELLED", "OVERDUE"] } }, select: { id: true } });
  return (await prisma.opportunityTask.updateMany({
    where: { dueDate: { lt: new Date() }, statusId: { notIn: terminal.map((row) => row.id) } },
    data: { statusId: overdue.id },
  })).count;
}
