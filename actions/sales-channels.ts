"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

export async function updateSalesChannel(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.SALES_CHANNELS_MANAGE);
    const data = z.object({ id: z.string().cuid(), description: z.string().max(1000).nullable(), active: z.boolean(), publicVisibility: z.boolean(), displayOrder: z.number().int(), defaultOwnerRoleId: z.string().cuid().nullable(), defaultAssignmentQueueId: z.string().cuid().nullable() }).parse(input);
    const before = await prisma.salesChannel.findUniqueOrThrow({ where: { id: data.id } });
    const updated = await prisma.$transaction(async (tx) => {
      const channel = await tx.salesChannel.update({ where: { id: data.id }, data: { description: data.description, active: data.active, publicVisibility: data.publicVisibility, displayOrder: data.displayOrder, defaultOwnerRoleId: data.defaultOwnerRoleId, defaultAssignmentQueueId: data.defaultAssignmentQueueId } });
      await tx.salesAuditLog.create({ data: { userId: actor.id, module: "channels", action: "CHANNEL_UPDATED", recordType: "SalesChannel", recordId: channel.id, previousValue: before, newValue: channel } });
      return channel;
    });
    revalidatePath("/sales/channels");
    return { success: true as const, data: { id: updated.id } };
  } catch (error) { return toErrorResponse(error); }
}

export async function upsertLeadSource(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.LEAD_SOURCES_MANAGE);
    const data = z.object({ id: z.string().cuid().optional(), name: z.string().min(2).max(100), code: z.string().regex(/^[A-Z0-9_]+$/), description: z.string().max(1000).nullable(), active: z.boolean(), salesChannelId: z.string().cuid().nullable() }).parse(input);
    const existing = data.id ? await prisma.leadSource.findUniqueOrThrow({ where: { id: data.id } }) : null;
    if (existing && existing.code !== data.code && await prisma.salesInquiry.count({ where: { leadSourceId: existing.id } })) throw new Error("A used lead source code cannot be changed");
    const source = await prisma.leadSource.upsert({ where: { code: data.code }, update: { name: data.name, description: data.description, active: data.active, salesChannelId: data.salesChannelId }, create: data });
    await prisma.salesAuditLog.create({ data: { userId: actor.id, module: "channels", action: existing ? "LEAD_SOURCE_UPDATED" : "LEAD_SOURCE_CREATED", recordType: "LeadSource", recordId: source.id, previousValue: existing ?? undefined, newValue: source } });
    revalidatePath("/sales/channels");
    return { success: true as const, data: { id: source.id } };
  } catch (error) { return toErrorResponse(error); }
}
