"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";
import { addNoteSchema, addAttachmentSchema } from "@/lib/validations/inst-sales";
import { appendAuditLog } from "@/lib/sales/audit";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { SALES_ROLES } from "@/lib/sales/constants";

/**
 * Institutional Sales OS — shared Notes/Attachments (Module 2's
 * "Notes/Attachments" requirement, reused by Lead/Opportunity/Visit/Sample/
 * Quotation via InstNote/InstAttachment's generic entityType+entityId
 * shape — see the schema note near those models). One implementation
 * instead of five near-identical ones.
 */
const ENTITY_PERMISSION: Record<string, PermissionKey> = {
  LEAD: PERMISSIONS.INST_LEADS_MANAGE,
  OPPORTUNITY: PERMISSIONS.INST_OPPORTUNITIES_MANAGE,
  VISIT: PERMISSIONS.INST_VISITS_MANAGE,
  SAMPLE: PERMISSIONS.INST_SAMPLES_MANAGE,
  QUOTATION: PERMISSIONS.INST_QUOTATIONS_MANAGE,
  // Milestone 4 — Order Management OS.
  ORDER: PERMISSIONS.BUSINESS_ORDERS_MANAGE,
};

export async function addInstNote(input: unknown) {
  try {
    const data = addNoteSchema.parse(input);
    const principal = await requirePermission(ENTITY_PERMISSION[data.entityType]!);
    const note = await prisma.instNote.create({
      data: { ...data, authorId: principal.id },
      include: { author: { select: { id: true, name: true } } },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "NOTE_ADDED", recordType: data.entityType, recordId: data.entityId, newValue: { body: data.body } });
    revalidatePath("/os/sales");
    return { success: true as const, data: note };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listInstNotes(entityType: string, entityId: string) {
  try {
    await requirePermission(ENTITY_PERMISSION[entityType]!);
    const notes = await prisma.instNote.findMany({
      where: { entityType: entityType as never, entityId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
    });
    return { success: true as const, data: notes };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addInstAttachment(input: unknown) {
  try {
    const data = addAttachmentSchema.parse(input);
    const principal = await requirePermission(ENTITY_PERMISSION[data.entityType]!);
    const attachment = await prisma.instAttachment.create({
      data: { ...data, uploadedById: principal.id },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "ATTACHMENT_ADDED", recordType: data.entityType, recordId: data.entityId, newValue: { fileName: data.fileName } });
    revalidatePath("/os/sales");
    return { success: true as const, data: attachment };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listInstAttachments(entityType: string, entityId: string) {
  try {
    await requirePermission(ENTITY_PERMISSION[entityType]!);
    const attachments = await prisma.instAttachment.findMany({
      where: { entityType: entityType as never, entityId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    return { success: true as const, data: attachments };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Lookup lists shared by every Institutional Sales OS form (Lead/Opportunity/Task assignment, etc). */
export async function listInstLeadSources() {
  try {
    await getSalesPrincipal();
    const items = await prisma.leadSource.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Product picker shared by Sample issuance and Quotation line items — the real MUV catalog, never a shadow product list. */
export async function listInstProducts() {
  try {
    await getSalesPrincipal();
    const items = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gstRate: true, variants: { select: { id: true, size: true, price: true }, orderBy: { size: "asc" } } },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listInstSalesUsers() {
  try {
    await getSalesPrincipal();
    const items = await prisma.user.findMany({
      where: { active: true, salesRole: { name: { in: [SALES_ROLES.SALES_OFFICER, SALES_ROLES.INSTITUTIONAL, SALES_ROLES.SALES_MANAGER] } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, salesRole: { select: { name: true } } },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
