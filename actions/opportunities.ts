"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { opportunityScope } from "@/lib/opportunity/repository";
import { createOpportunity, reopenOpportunity, transitionOpportunity, updateOpportunityFields } from "@/lib/opportunity/pipeline";
import { saveActivity } from "@/lib/opportunity/activity";
import { saveTask } from "@/lib/opportunity/task";

const cuid = z.string().cuid();
const optionalCuid = cuid.nullish();

async function assertScoped(id: string) {
  return prisma.opportunity.findFirstOrThrow({ where: { id, AND: await opportunityScope() }, select: { id: true } });
}

export async function createOpportunityAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_CREATE);
    const data = z.object({
      customerId: cuid, sourceInquiryId: optionalCuid, ownerUserId: cuid, territoryId: optionalCuid,
      salesChannelId: optionalCuid, customerTypeId: optionalCuid, leadSourceId: optionalCuid,
      estimatedValue: z.coerce.number().nonnegative().max(9999999999999),
      currency: z.string().regex(/^[A-Z]{3}$/).default("INR"), expectedCloseDate: z.coerce.date().nullish(),
      priorityCode: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    }).parse(input);
    if (!actor.isFounder && !actor.permissions.has(PERMISSIONS.OPPORTUNITIES_ASSIGN) && data.ownerUserId !== actor.id) {
      return { success: false as const, error: { code: "FORBIDDEN", message: "You cannot assign this opportunity to another owner" } };
    }
    const opportunity = await createOpportunity(actor, data);
    revalidatePath("/sales/opportunities"); revalidatePath("/dashboard");
    return { success: true as const, data: { id: opportunity.id, opportunityNumber: opportunity.opportunityNumber } };
  } catch (error) { return toErrorResponse(error); }
}

export async function transitionOpportunityAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_STAGE_CHANGE);
    const data = z.object({ opportunityId: cuid, targetStageCode: z.string().min(2).max(50),
      reason: z.string().trim().max(1000).optional(), notes: z.string().trim().max(5000).optional(),
      lostReasonCode: z.string().max(50).optional(), wonReasonCode: z.string().max(50).optional() }).parse(input);
    await assertScoped(data.opportunityId);
    if (["WON", "LOST"].includes(data.targetStageCode)) await requirePermission(PERMISSIONS.OPPORTUNITIES_CLOSE);
    const opportunity = await transitionOpportunity(actor, data);
    revalidatePath(`/sales/opportunities/${data.opportunityId}`); revalidatePath("/sales/opportunities"); revalidatePath("/dashboard");
    return { success: true as const, data: { id: opportunity.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function reopenOpportunityAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_REOPEN);
    const { opportunityId } = z.object({ opportunityId: cuid }).parse(input);
    await assertScoped(opportunityId);
    await reopenOpportunity(actor, opportunityId);
    revalidatePath(`/sales/opportunities/${opportunityId}`); revalidatePath("/sales/opportunities");
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}

export async function updateOpportunityAction(input: unknown) {
  try {
    const data = z.object({ opportunityId: cuid, probability: z.coerce.number().int().min(0).max(100).optional(),
      estimatedValue: z.coerce.number().nonnegative().optional(), expectedCloseDate: z.coerce.date().nullable().optional(),
      ownerUserId: cuid.optional() }).parse(input);
    const actor = await requirePermission(data.ownerUserId ? PERMISSIONS.OPPORTUNITIES_ASSIGN : PERMISSIONS.OPPORTUNITIES_UPDATE);
    if (data.probability !== undefined) await requirePermission(PERMISSIONS.OPPORTUNITIES_PROBABILITY_OVERRIDE);
    await assertScoped(data.opportunityId);
    const { opportunityId, ...changes } = data;
    await updateOpportunityFields(actor, opportunityId, changes);
    revalidatePath(`/sales/opportunities/${opportunityId}`); revalidatePath("/sales/opportunities"); revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}

export async function saveOpportunityActivityAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITY_ACTIVITIES_MANAGE);
    const data = z.object({ id: cuid.optional(), opportunityId: cuid, typeCode: z.string().max(50),
      statusCode: z.string().max(50), subject: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(), assignedTo: optionalCuid,
      scheduledAt: z.coerce.date().nullish(), duration: z.coerce.number().int().positive().max(1440).nullish(),
      createFollowUp: z.boolean().optional() }).parse(input);
    await assertScoped(data.opportunityId);
    const activity = await saveActivity(actor, data);
    revalidatePath(`/sales/opportunities/${data.opportunityId}`); revalidatePath("/sales/calendar");
    return { success: true as const, data: { id: activity.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function saveOpportunityTaskAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITY_TASKS_MANAGE);
    const data = z.object({ id: cuid.optional(), opportunityId: cuid, ownerUserId: cuid,
      typeCode: z.string().max(50), priorityCode: z.string().max(50), statusCode: z.string().max(50),
      title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(),
      dueDate: z.coerce.date() }).parse(input);
    await assertScoped(data.opportunityId);
    const task = await saveTask(actor, data);
    revalidatePath(`/sales/opportunities/${data.opportunityId}`); revalidatePath("/sales/calendar");
    return { success: true as const, data: { id: task.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function addOpportunityNoteAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_UPDATE);
    const data = z.object({ opportunityId: cuid, note: z.string().trim().min(1).max(5000),
      visibility: z.enum(["INTERNAL", "MANAGER", "PRIVATE"]).default("INTERNAL") }).parse(input);
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { id: data.opportunityId, AND: await opportunityScope() } });
    const note = await prisma.$transaction(async (tx) => {
      const row = await tx.opportunityNote.create({ data: { opportunityId: opportunity.id, authorId: actor.id, note: data.note, visibility: data.visibility } });
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: opportunity.customerId, eventType: "OPPORTUNITY_NOTE_ADDED",
        relatedRecordType: "OpportunityNote", relatedRecordId: row.id, description: "Opportunity note added" } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action: "NOTE_ADDED", recordType: "OpportunityNote", recordId: row.id } });
      return row;
    });
    revalidatePath(`/sales/opportunities/${opportunity.id}`);
    return { success: true as const, data: { id: note.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function registerOpportunityAttachmentAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_UPDATE);
    const data = z.object({ opportunityId: cuid, storageReference: z.string().min(3).max(1000),
      originalFilename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
      extension: z.enum(["pdf", "jpg", "jpeg", "png", "docx", "pptx"]), sizeBytes: z.coerce.number().int().positive().max(20 * 1024 * 1024) }).parse(input);
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { id: data.opportunityId, AND: await opportunityScope() } });
    const expected = data.originalFilename.split(".").pop()?.toLowerCase();
    if (expected !== data.extension) return { success: false as const, error: { code: "VALIDATION_ERROR", message: "Filename extension does not match" } };
    const attachment = await prisma.$transaction(async (tx) => {
      const row = await tx.opportunityAttachment.create({ data: { ...data, uploaderId: actor.id } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action: "ATTACHMENT_REGISTERED",
        recordType: "OpportunityAttachment", recordId: row.id, newValue: { mimeType: data.mimeType, sizeBytes: data.sizeBytes } } });
      await tx.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: opportunity.customerId,
        eventType: "OPPORTUNITY_ATTACHMENT_ADDED", relatedRecordType: "OpportunityAttachment", relatedRecordId: row.id,
        description: `Attachment added: ${data.originalFilename}` } });
      return row;
    });
    revalidatePath(`/sales/opportunities/${opportunity.id}`);
    return { success: true as const, data: { id: attachment.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function bulkUpdateOpportunitiesAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_BULK);
    const data = z.object({ opportunityIds: z.array(cuid).min(1).max(100), ownerUserId: cuid.optional(),
      targetStageCode: z.string().max(50).optional() }).refine((value) => value.ownerUserId || value.targetStageCode, "A bulk operation is required").parse(input);
    const scoped = await prisma.opportunity.findMany({ where: { id: { in: data.opportunityIds }, AND: await opportunityScope() }, select: { id: true } });
    if (scoped.length !== new Set(data.opportunityIds).size) return { success: false as const, error: { code: "FORBIDDEN", message: "One or more opportunities are outside your scope" } };
    for (const id of data.opportunityIds) {
      if (data.ownerUserId) await updateOpportunityFields(actor, id, { ownerUserId: data.ownerUserId });
      if (data.targetStageCode) await transitionOpportunity(actor, { opportunityId: id, targetStageCode: data.targetStageCode, reason: "Bulk stage update" });
    }
    await prisma.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action: "BULK_UPDATE",
      recordType: "Opportunity", newValue: { count: data.opportunityIds.length, ownerUserId: data.ownerUserId, targetStageCode: data.targetStageCode } } });
    revalidatePath("/sales/opportunities"); revalidatePath("/dashboard");
    return { success: true as const, data: { count: data.opportunityIds.length } };
  } catch (error) { return toErrorResponse(error); }
}
