"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, requireAnyPermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { assignedScopeWhere } from "@/lib/inst-sales/scope";
import { withRetryOnNumberConflict } from "@/lib/inst-sales/numbering";
import {
  createLeadSchema, updateLeadSchema, changeLeadStatusSchema, assignLeadSchema,
  convertLeadSchema, listLeadsQuerySchema,
} from "@/lib/validations/inst-sales";
import { createCustomer } from "@/actions/customers";

/** Prisma `Decimal` cannot cross the Server→Client boundary as-is — see
 * CLAUDE.md's note on this exact class of bug (actions/customers.ts,
 * actions/master-data.ts, actions/suppliers.ts already fixed the same
 * issue for their own Decimal fields). */
function serializeLead<T extends { estimatedValue: unknown }>(row: T) {
  return { ...row, estimatedValue: Number(row.estimatedValue) };
}

export async function createLead(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_LEADS_MANAGE);
    const data = createLeadSchema.parse(input);
    const { note, ...leadFields } = data;

    const created = await withRetryOnNumberConflict("LEAD", (leadNumber) =>
      prisma.$transaction(async (tx) => {
        const lead = await tx.instLead.create({
          data: {
            ...leadFields,
            email: leadFields.email || null,
            leadNumber,
            createdById: principal.id,
            assignedToId: leadFields.assignedToId ?? principal.id,
          },
        });
        if (note) {
          await tx.instNote.create({ data: { entityType: "LEAD", entityId: lead.id, body: note, authorId: principal.id } });
        }
        return lead;
      })
    );

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "LEAD_CREATED", recordType: "InstLead", recordId: created.id, newValue: { leadNumber: created.leadNumber, organizationName: created.organizationName } });
    revalidatePath("/os/sales/leads");
    return { success: true as const, data: serializeLead(created) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateLead(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_LEADS_MANAGE);
    const { id, ...rest } = updateLeadSchema.parse(input);
    const existing = await prisma.instLead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Lead");

    const updated = await prisma.instLead.update({
      where: { id },
      data: { ...rest, email: rest.email !== undefined ? rest.email || null : undefined },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "LEAD_UPDATED", recordType: "InstLead", recordId: id, previousValue: existing, newValue: updated });
    revalidatePath("/os/sales/leads");
    revalidatePath(`/os/sales/leads/${id}`);
    return { success: true as const, data: serializeLead(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function changeLeadStatus(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_LEADS_MANAGE);
    const data = changeLeadStatusSchema.parse(input);
    const existing = await prisma.instLead.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Lead");

    const updated = await prisma.instLead.update({
      where: { id: data.id },
      data: {
        status: data.status,
        lostReason: data.status === "LOST" ? (data.lostReason ?? existing.lostReason) : existing.lostReason,
        qualifiedAt: data.status === "QUALIFIED" && !existing.qualifiedAt ? new Date() : existing.qualifiedAt,
      },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "LEAD_STATUS_CHANGED", recordType: "InstLead", recordId: data.id, previousValue: { status: existing.status }, newValue: { status: updated.status } });
    revalidatePath("/os/sales/leads");
    revalidatePath(`/os/sales/leads/${data.id}`);
    return { success: true as const, data: serializeLead(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function assignLead(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_LEADS_MANAGE);
    const data = assignLeadSchema.parse(input);
    const updated = await prisma.instLead.update({ where: { id: data.id }, data: { assignedToId: data.assignedToId } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "LEAD_ASSIGNED", recordType: "InstLead", recordId: data.id, newValue: { assignedToId: data.assignedToId } });
    revalidatePath("/os/sales/leads");
    return { success: true as const, data: serializeLead(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Lead → Opportunity conversion. Always ends with the Opportunity pointing
 * at a real Customer row — either one that already exists (`customerId`) or
 * one created by delegating straight to actions/customers.ts's
 * `createCustomer` (never a second, parallel customer-creation code path).
 */
export async function convertLeadToOpportunity(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_MANAGE);
    const data = convertLeadSchema.parse(input);

    const lead = await prisma.instLead.findUnique({ where: { id: data.leadId } });
    if (!lead) throw new NotFoundError("Lead");

    let customerId = data.customerId ?? null;
    if (!customerId && data.newCustomer) {
      const customerResult = await createCustomer(data.newCustomer);
      if (!customerResult.success) return customerResult;
      customerId = customerResult.data.id;
    }
    if (!customerId) throw new NotFoundError("Customer");

    const opportunity = await withRetryOnNumberConflict("OPP", (opportunityNumber) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.instOpportunity.create({
          data: {
            opportunityNumber,
            leadId: lead.id,
            customerId: customerId!,
            ownerId: lead.assignedToId ?? principal.id,
            territoryId: lead.territoryId,
            estimatedRevenue: lead.estimatedValue,
          },
        });
        await tx.instLead.update({ where: { id: lead.id }, data: { customerId, status: "QUALIFIED", qualifiedAt: lead.qualifiedAt ?? new Date() } });
        return created;
      })
    );

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "LEAD_CONVERTED", recordType: "InstLead", recordId: lead.id, newValue: { opportunityId: opportunity.id, customerId } });
    revalidatePath("/os/sales/leads");
    revalidatePath("/os/sales/opportunities");
    return { success: true as const, data: { opportunityId: opportunity.id, opportunityNumber: opportunity.opportunityNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listLeads(input?: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.INST_LEADS_VIEW_ALL, PERMISSIONS.INST_LEADS_VIEW_ASSIGNED);
    const query = listLeadsQuerySchema.parse(input ?? {});
    const scope = assignedScopeWhere(principal, PERMISSIONS.INST_LEADS_VIEW_ALL, "assignedToId");

    const where = {
      AND: [
        scope,
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
        query.assignedToId ? { assignedToId: query.assignedToId } : {},
        query.territoryId ? { territoryId: query.territoryId } : {},
        query.q
          ? { OR: [{ organizationName: { contains: query.q, mode: "insensitive" as const } }, { contactPerson: { contains: query.q, mode: "insensitive" as const } }, { phone: { contains: query.q } }, { leadNumber: { contains: query.q, mode: "insensitive" as const } }] }
          : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instLead.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { territory: { select: { name: true } }, leadSource: { select: { name: true } }, assignedTo: { select: { id: true, name: true } } },
      }),
      prisma.instLead.count({ where }),
    ]);

    return {
      success: true as const,
      data: { items: items.map(serializeLead), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getLeadDetail(id: string) {
  try {
    await requireAnyPermission(PERMISSIONS.INST_LEADS_VIEW_ALL, PERMISSIONS.INST_LEADS_VIEW_ASSIGNED);
    const lead = await prisma.instLead.findUnique({
      where: { id },
      include: {
        territory: { select: { id: true, name: true } },
        leadSource: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, businessName: true } },
        opportunity: { select: { id: true, opportunityNumber: true, stage: true } },
        visits: { orderBy: { visitDate: "desc" }, take: 10 },
        followUps: { orderBy: { dueDate: "asc" } },
      },
    });
    if (!lead) throw new NotFoundError("Lead");
    return { success: true as const, data: serializeLead(lead) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Founder/Manager dashboards + officer "My Assigned Leads" widget. */
export async function getLeadSummaryCounts() {
  try {
    const principal = await getSalesPrincipal();
    const scope = assignedScopeWhere(principal, PERMISSIONS.INST_LEADS_VIEW_ALL, "assignedToId");
    const [total, byStatus] = await Promise.all([
      prisma.instLead.count({ where: scope }),
      prisma.instLead.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    ]);
    return { success: true as const, data: { total, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
