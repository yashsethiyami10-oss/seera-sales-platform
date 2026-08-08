import { prisma } from "@/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";

type Actor = { id: string; email: string | null };

export async function saveActivity(actor: Actor, input: {
  id?: string; opportunityId: string; typeCode: string; statusCode: string;
  subject: string; description?: string; assignedTo?: string | null;
  scheduledAt?: Date | null; duration?: number | null; createFollowUp?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findUnique({ where: { id: input.opportunityId } });
    if (!opportunity) throw new NotFoundError("Opportunity");
    const [type, status] = await Promise.all([
      tx.opportunityActivityType.findFirst({ where: { code: input.typeCode, active: true } }),
      tx.opportunityActivityStatus.findFirst({ where: { code: input.statusCode, active: true } }),
    ]);
    if (!type || !status) throw new AppError("Invalid activity configuration");
    const completedAt = status.code === "COMPLETED" ? new Date() : null;
    const activity = input.id
      ? await tx.opportunityActivity.update({ where: { id: input.id, opportunityId: input.opportunityId }, data: {
          activityTypeId: type.id, statusId: status.id, subject: input.subject, description: input.description,
          assignedTo: input.assignedTo, scheduledAt: input.scheduledAt, duration: input.duration, completedAt,
        } })
      : await tx.opportunityActivity.create({ data: {
          opportunityId: opportunity.id, customerId: opportunity.customerId, activityTypeId: type.id,
          statusId: status.id, subject: input.subject, description: input.description, performedBy: actor.id,
          assignedTo: input.assignedTo, scheduledAt: input.scheduledAt, duration: input.duration, completedAt,
        } });
    const action = input.id ? `ACTIVITY_${status.code}` : "ACTIVITY_CREATED";
    await tx.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: opportunity.customerId,
      eventType: action, relatedRecordType: "OpportunityActivity", relatedRecordId: activity.id,
      description: `${type.name}: ${input.subject}` } });
    await tx.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action,
      recordType: "OpportunityActivity", recordId: activity.id, newValue: { type: type.code, status: status.code } } });
    if (input.assignedTo) await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: "ACTIVITY_ASSIGNED",
      recipient: input.assignedTo, status: "PENDING" } });
    if (completedAt && input.createFollowUp) {
      const [taskType, taskStatus, priority] = await Promise.all([
        tx.opportunityTaskType.findUniqueOrThrow({ where: { code: "FOLLOW_UP" } }),
        tx.opportunityTaskStatus.findUniqueOrThrow({ where: { code: "OPEN" } }),
        tx.opportunityPriority.findUniqueOrThrow({ where: { code: "NORMAL" } }),
      ]);
      await tx.opportunityTask.create({ data: { opportunityId: opportunity.id, customerId: opportunity.customerId,
        ownerUserId: input.assignedTo ?? actor.id, assignedBy: actor.id, taskTypeId: taskType.id,
        title: `Follow up: ${input.subject}`, priorityId: priority.id, statusId: taskStatus.id,
        dueDate: new Date(Date.now() + 86400000) } });
    }
    return activity;
  });
}
