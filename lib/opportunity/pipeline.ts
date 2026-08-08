import { Prisma, OpportunityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";

type Actor = { id: string; email: string | null; isFounder: boolean };
type Tx = Prisma.TransactionClient;

async function createConfiguredTasks(tx: Tx, triggerEvent: string, opportunity: {
  id: string; customerId: string; ownerUserId: string;
}, actorId: string) {
  const [rules, open, normal] = await Promise.all([
    tx.opportunityTaskRule.findMany({ where: { triggerEvent, active: true } }),
    tx.opportunityTaskStatus.findUnique({ where: { code: "OPEN" } }),
    tx.opportunityPriority.findUnique({ where: { code: "NORMAL" } }),
  ]);
  if (!open || !normal) return;
  for (const rule of rules) {
    await tx.opportunityTask.create({ data: {
      opportunityId: opportunity.id, customerId: opportunity.customerId, ownerUserId: opportunity.ownerUserId,
      assignedBy: actorId, taskTypeId: rule.taskTypeId, title: rule.titleTemplate,
      priorityId: normal.id, statusId: open.id, dueDate: new Date(Date.now() + rule.dueOffsetMinutes * 60000),
    } });
  }
}

async function recordEvent(tx: Tx, input: {
  actor: Actor; opportunityId: string; customerId: string; action: string;
  description: string; previousValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue;
}) {
  await tx.salesTimelineEvent.create({ data: {
    actorId: input.actor.id, customerId: input.customerId, eventType: input.action,
    relatedRecordType: "Opportunity", relatedRecordId: input.opportunityId,
    description: input.description, metadata: input.newValue,
  } });
  await tx.salesAuditLog.create({ data: {
    userId: input.actor.id, module: "opportunities", action: input.action,
    recordType: "Opportunity", recordId: input.opportunityId,
    previousValue: input.previousValue, newValue: input.newValue,
  } });
  await tx.notificationLog.create({ data: {
    channel: "DASHBOARD", type: input.action, recipient: input.actor.email ?? input.actor.id, status: "PENDING",
  } });
}

export type CreateOpportunityInput = {
  customerId: string; sourceInquiryId?: string | null; ownerUserId: string;
  territoryId?: string | null; salesChannelId?: string | null; customerTypeId?: string | null;
  leadSourceId?: string | null; estimatedValue: number; currency?: string; expectedCloseDate?: Date | null;
  priorityCode?: string;
};

export async function createOpportunity(actor: Actor, input: CreateOpportunityInput) {
  return prisma.$transaction(async (tx) => {
    const [customer, owner, stage, priority] = await Promise.all([
      tx.customer.findUnique({ where: { id: input.customerId } }),
      tx.user.findFirst({ where: { id: input.ownerUserId, active: true, salesRoleId: { not: null } } }),
      tx.opportunityStage.findUnique({ where: { code: "NEW" } }),
      tx.opportunityPriority.findUnique({ where: { code: input.priorityCode ?? "NORMAL" } }),
    ]);
    if (!customer || !owner || !stage || !priority) throw new AppError("Invalid customer, owner, stage, or priority");
    let inquiry = null;
    if (input.sourceInquiryId) {
      inquiry = await tx.salesInquiry.findUnique({ where: { id: input.sourceInquiryId }, include: { status: true } });
      if (!inquiry || inquiry.customerId !== customer.id) throw new AppError("Inquiry must belong to the selected customer");
      if (inquiry.status.code !== "QUALIFIED" && !actor.isFounder) throw new AppError("Only qualified inquiries can be converted");
      const existing = await tx.opportunity.findFirst({ where: { sourceInquiryId: inquiry.id } });
      if (existing) throw new AppError("Inquiry already has an opportunity", 409, "CONFLICT");
    }
    const opportunity = await tx.opportunity.create({ data: {
      opportunityNumber: "", customerId: customer.id, sourceInquiryId: inquiry?.id,
      ownerUserId: owner.id, territoryId: input.territoryId ?? customer.assignedTerritoryId,
      salesChannelId: input.salesChannelId ?? customer.primaryChannelId,
      customerTypeId: input.customerTypeId ?? customer.customerTypeId,
      leadSourceId: input.leadSourceId, currentStageId: stage.id, priorityId: priority.id,
      estimatedValue: input.estimatedValue, currency: input.currency ?? "INR",
      probability: stage.probabilityDefault, expectedCloseDate: input.expectedCloseDate,
    } });
    await tx.opportunityStageHistory.create({ data: {
      opportunityId: opportunity.id, newStageId: stage.id, changedBy: actor.id, reason: "Opportunity created",
    } });
    await recordEvent(tx, {
      actor, opportunityId: opportunity.id, customerId: customer.id, action: "OPPORTUNITY_CREATED",
      description: `Opportunity ${opportunity.opportunityNumber} created`,
      newValue: { stage: stage.code, ownerUserId: owner.id, estimatedValue: input.estimatedValue },
    });
    await createConfiguredTasks(tx, "OPPORTUNITY_CREATED", opportunity, actor.id);
    return opportunity;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type TransitionInput = {
  opportunityId: string; targetStageCode: string; reason?: string; notes?: string;
  lostReasonCode?: string; wonReasonCode?: string;
};

export async function transitionOpportunity(actor: Actor, input: TransitionInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.opportunity.findUnique({
      where: { id: input.opportunityId }, include: { currentStage: true, owner: true },
    });
    if (!current) throw new NotFoundError("Opportunity");
    if (current.status !== "ACTIVE" && current.status !== "ON_HOLD") {
      throw new AppError("Closed opportunities must be reopened before stage movement", 409, "INVALID_TRANSITION");
    }
    const target = await tx.opportunityStage.findFirst({ where: { code: input.targetStageCode, active: true } });
    if (!target) throw new AppError("Invalid or inactive stage");
    const transition = await tx.opportunityStageTransition.findFirst({
      where: { fromStageId: current.currentStageId, toStageId: target.id, active: true },
    });
    if (!transition) {
      throw new AppError("Stage transition is not allowed", 409, "INVALID_TRANSITION");
    }
    let lostReasonId: string | null = null;
    let wonReasonId: string | null = null;
    if (target.code === "LOST") {
      if (!input.lostReasonCode) throw new AppError("A structured lost reason is required");
      lostReasonId = (await tx.opportunityLostReason.findFirstOrThrow({ where: { code: input.lostReasonCode, active: true } })).id;
    }
    if (target.code === "WON" && input.wonReasonCode) {
      wonReasonId = (await tx.opportunityWonReason.findFirstOrThrow({ where: { code: input.wonReasonCode, active: true } })).id;
    }
    const status: OpportunityStatus = target.code === "WON" ? "CLOSED_WON" :
      target.code === "LOST" ? "CLOSED_LOST" : target.code === "ON_HOLD" ? "ON_HOLD" : "ACTIVE";
    const updated = await tx.opportunity.update({ where: { id: current.id }, data: {
      currentStageId: target.id, status, probability: target.probabilityDefault,
      lostReasonId, wonReasonId, closedAt: target.isClosed ? new Date() : null,
      actualCloseDate: target.isClosed ? new Date() : null,
    } });
    await tx.opportunityStageHistory.create({ data: {
      opportunityId: current.id, previousStageId: current.currentStageId, newStageId: target.id,
      changedBy: actor.id, reason: input.reason, notes: input.notes,
    } });
    await recordEvent(tx, {
      actor, opportunityId: current.id, customerId: current.customerId,
      action: target.code === "WON" ? "OPPORTUNITY_WON" : target.code === "LOST" ? "OPPORTUNITY_LOST" : "OPPORTUNITY_STAGE_CHANGED",
      description: `${current.currentStage.name} → ${target.name}`,
      previousValue: { stage: current.currentStage.code, status: current.status, probability: current.probability },
      newValue: { stage: target.code, status, probability: target.probabilityDefault, reason: input.reason ?? null },
    });
    if (toIndexNotUsed(target.displayOrder, current.currentStage.displayOrder)) {
      await createConfiguredTasks(tx, "STAGE_ADVANCED", updated, actor.id);
    }
    return updated;
  });
}

export async function reopenOpportunity(actor: Actor, opportunityId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.opportunity.findUnique({ where: { id: opportunityId }, include: { currentStage: true } });
    if (!current) throw new NotFoundError("Opportunity");
    if (!current.currentStage.isClosed) throw new AppError("Opportunity is not closed");
    const stage = await tx.opportunityStage.findFirstOrThrow({ where: { code: "NEGOTIATION", active: true } });
    const updated = await tx.opportunity.update({ where: { id: current.id }, data: {
      currentStageId: stage.id, status: "ACTIVE", closedAt: null, actualCloseDate: null,
      lostReasonId: null, wonReasonId: null, probability: stage.probabilityDefault,
    } });
    await tx.opportunityStageHistory.create({ data: {
      opportunityId: current.id, previousStageId: current.currentStageId, newStageId: stage.id,
      changedBy: actor.id, reason: "Reopened",
    } });
    await recordEvent(tx, { actor, opportunityId: current.id, customerId: current.customerId,
      action: "OPPORTUNITY_REOPENED", description: "Opportunity reopened", newValue: { stage: stage.code } });
    await createConfiguredTasks(tx, "OPPORTUNITY_REOPENED", updated, actor.id);
    return updated;
  });
}

function toIndexNotUsed(targetOrder: number, currentOrder: number) {
  return targetOrder > currentOrder;
}

export async function updateOpportunityFields(actor: Actor, opportunityId: string, input: {
  probability?: number; estimatedValue?: number; expectedCloseDate?: Date | null; ownerUserId?: string;
}) {
  const current = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!current) throw new NotFoundError("Opportunity");
  if (input.probability !== undefined && (input.probability < 0 || input.probability > 100)) throw new AppError("Probability must be between 0 and 100");
  if (input.estimatedValue !== undefined && input.estimatedValue < 0) throw new AppError("Estimated value cannot be negative");
  if (input.ownerUserId) {
    const owner = await prisma.user.findFirst({ where: { id: input.ownerUserId, active: true, salesRoleId: { not: null } } });
    if (!owner) throw new ForbiddenError("Invalid opportunity owner");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({ where: { id: opportunityId }, data: input });
    const changes = Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined);
    await recordEvent(tx, { actor, opportunityId, customerId: current.customerId,
      action: changes.includes("ownerUserId") ? "OPPORTUNITY_OWNER_CHANGED" : "OPPORTUNITY_UPDATED",
      description: `Opportunity ${changes.join(", ")} updated`,
      previousValue: { probability: current.probability, estimatedValue: current.estimatedValue.toString(), expectedCloseDate: current.expectedCloseDate?.toISOString() ?? null, ownerUserId: current.ownerUserId },
      newValue: { ...input, expectedCloseDate: input.expectedCloseDate?.toISOString() ?? null },
    });
    return updated;
  });
}
