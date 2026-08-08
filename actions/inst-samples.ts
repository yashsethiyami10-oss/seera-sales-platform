"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { withRetryOnNumberConflict } from "@/lib/inst-sales/numbering";
import { issueSampleSchema, updateSampleTrialSchema, listSamplesQuerySchema } from "@/lib/validations/inst-sales";

function serializeSample<T extends { quantity: unknown }>(row: T) {
  return { ...row, quantity: Number(row.quantity) };
}

export async function issueSample(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_SAMPLES_MANAGE);
    const data = issueSampleSchema.parse(input);

    const sample = await withRetryOnNumberConflict("SAMPLE", (sampleNumber) =>
      prisma.instSample.create({ data: { ...data, sampleNumber, officerId: principal.id } })
    );

    if (data.opportunityId) {
      await prisma.instOpportunity.update({ where: { id: data.opportunityId }, data: { stage: "SAMPLE_ISSUED" } }).catch(() => null);
    }
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "SAMPLE_ISSUED", recordType: "InstSample", recordId: sample.id, newValue: { sampleNumber: sample.sampleNumber, productId: data.productId } });
    revalidatePath("/os/sales/samples");
    return { success: true as const, data: serializeSample(sample) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateSampleTrial(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_SAMPLES_MANAGE);
    const data = updateSampleTrialSchema.parse(input);
    const existing = await prisma.instSample.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Sample");

    const updated = await prisma.instSample.update({
      where: { id: data.id },
      data: {
        trialStatus: data.trialStatus,
        trialResult: data.trialResult,
        feedback: data.feedback,
        feedbackDate: data.feedback ? new Date() : existing.feedbackDate,
      },
    });

    if (existing.opportunityId && data.trialStatus === "COMPLETED") {
      await prisma.instOpportunity.update({ where: { id: existing.opportunityId }, data: { stage: "TRIAL" } }).catch(() => null);
    }
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "SAMPLE_TRIAL_UPDATED", recordType: "InstSample", recordId: data.id, previousValue: { trialStatus: existing.trialStatus }, newValue: { trialStatus: updated.trialStatus, trialResult: updated.trialResult } });
    revalidatePath("/os/sales/samples");
    return { success: true as const, data: serializeSample(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listSamples(input?: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_SAMPLES_MANAGE);
    const query = listSamplesQuerySchema.parse(input ?? {});
    const where = {
      AND: [
        query.customerId ? { customerId: query.customerId } : {},
        query.opportunityId ? { opportunityId: query.opportunityId } : {},
        query.trialStatus ? { trialStatus: query.trialStatus } : {},
        principal.isFounder ? {} : { officerId: principal.id },
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instSample.findMany({
        where, orderBy: { issuedDate: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { customer: { select: { name: true } }, product: { select: { name: true } }, officer: { select: { name: true } } },
      }),
      prisma.instSample.count({ where }),
    ]);
    return { success: true as const, data: { items: items.map(serializeSample), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
