import { prisma } from "@/lib/prisma";
import { opportunityScope } from "./repository";

export async function getOpportunityDashboard() {
  const scope = await opportunityScope();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const [open, wonMonth, lostMonth, byStage, byOwner, byTerritory, byChannel, overdueTasks, activitiesToday] = await Promise.all([
    prisma.opportunity.aggregate({ where: { AND: [scope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] }, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.aggregate({ where: { AND: [scope, { status: "CLOSED_WON", closedAt: { gte: monthStart } }] }, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.count({ where: { AND: [scope, { status: "CLOSED_LOST", closedAt: { gte: monthStart } }] } }),
    prisma.opportunity.groupBy({ by: ["currentStageId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.groupBy({ by: ["ownerUserId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.groupBy({ by: ["territoryId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.groupBy({ by: ["salesChannelId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunityTask.count({ where: { dueDate: { lt: now }, status: { code: { notIn: ["COMPLETED", "CANCELLED"] } }, opportunity: scope } }),
    prisma.opportunityActivity.count({ where: { scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lte: dayEnd }, opportunity: scope } }),
  ]);
  return { openOpportunities: open._count, pipelineValue: open._sum.estimatedValue ?? 0, wonThisMonth: wonMonth._count,
    wonValueThisMonth: wonMonth._sum.estimatedValue ?? 0, lostThisMonth: lostMonth, overdueTasks, activitiesToday,
    pipelineByStage: byStage, pipelineByOwner: byOwner, pipelineByTerritory: byTerritory, pipelineByChannel: byChannel };
}

export async function getOpportunityReports() {
  const scope = await opportunityScope();
  const [summary, activitySummary, taskSummary, leadSource, customerType] = await Promise.all([
    prisma.opportunity.groupBy({ by: ["status"], where: scope, _count: true, _sum: { estimatedValue: true }, _avg: { probability: true } }),
    prisma.opportunityActivity.groupBy({ by: ["activityTypeId", "statusId"], where: { opportunity: scope }, _count: true }),
    prisma.opportunityTask.groupBy({ by: ["statusId", "ownerUserId"], where: { opportunity: scope }, _count: true }),
    prisma.opportunity.groupBy({ by: ["leadSourceId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
    prisma.opportunity.groupBy({ by: ["customerTypeId"], where: scope, _count: true, _sum: { estimatedValue: true } }),
  ]);
  return { summary, activitySummary, taskSummary, leadSourcePerformance: leadSource, customerTypePerformance: customerType };
}
