import { prisma } from "@/lib/prisma";
import { opportunityScope } from "./repository";

export async function getSalesCalendar(input: {
  from: Date; to: Date; ownerId?: string; territoryId?: string; opportunityId?: string;
  customerId?: string; taskTypeCode?: string;
}) {
  const scope = await opportunityScope();
  const opportunityFilter = { AND: [scope, input.opportunityId ? { id: input.opportunityId } : {},
    input.territoryId ? { territoryId: input.territoryId } : {}, input.customerId ? { customerId: input.customerId } : {}] };
  const [activities, tasks, closes] = await Promise.all([
    prisma.opportunityActivity.findMany({ where: { scheduledAt: { gte: input.from, lte: input.to },
      ...(input.ownerId ? { assignedTo: input.ownerId } : {}), opportunity: opportunityFilter },
      include: { activityType: true, opportunity: { select: { opportunityNumber: true } }, customer: { select: { name: true } } } }),
    prisma.opportunityTask.findMany({ where: { dueDate: { gte: input.from, lte: input.to },
      ...(input.ownerId ? { ownerUserId: input.ownerId } : {}), ...(input.taskTypeCode ? { taskType: { code: input.taskTypeCode } } : {}),
      opportunity: opportunityFilter }, include: { taskType: true, status: true, opportunity: { select: { opportunityNumber: true } } } }),
    prisma.opportunity.findMany({ where: { AND: [scope, { expectedCloseDate: { gte: input.from, lte: input.to } }] },
      select: { id: true, opportunityNumber: true, expectedCloseDate: true, customer: { select: { name: true } } } }),
  ]);
  return { activities, tasks, expectedCloses: closes };
}
