"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, requireAnyPermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { assignedScopeWhere } from "@/lib/inst-sales/scope";
import { withRetryOnNumberConflict } from "@/lib/inst-sales/numbering";
import {
  createOpportunitySchema, updateOpportunitySchema, changeOpportunityStageSchema, listOpportunitiesQuerySchema,
} from "@/lib/validations/inst-sales";

function serializeOpportunity<T extends { estimatedRevenue: unknown }>(row: T) {
  return { ...row, estimatedRevenue: Number(row.estimatedRevenue) };
}

async function replaceProducts(tx: Prisma.TransactionClient, opportunityId: string, products: { productId: string; quantity?: number; notes?: string }[]) {
  await tx.instOpportunityProduct.deleteMany({ where: { opportunityId } });
  if (products.length) {
    await tx.instOpportunityProduct.createMany({
      data: products.map((p) => ({ opportunityId, productId: p.productId, quantity: p.quantity ?? null, notes: p.notes ?? null })),
    });
  }
}

export async function createOpportunity(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_MANAGE);
    const data = createOpportunitySchema.parse(input);
    const { products, ...fields } = data;

    const created = await withRetryOnNumberConflict("OPP", (opportunityNumber) =>
      prisma.$transaction(async (tx) => {
        const opportunity = await tx.instOpportunity.create({
          data: { ...fields, opportunityNumber, ownerId: fields.ownerId ?? principal.id },
        });
        await replaceProducts(tx, opportunity.id, products);
        return opportunity;
      })
    );

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "OPPORTUNITY_CREATED", recordType: "InstOpportunity", recordId: created.id, newValue: { opportunityNumber: created.opportunityNumber } });
    revalidatePath("/os/sales/opportunities");
    return { success: true as const, data: serializeOpportunity(created) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateOpportunity(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_MANAGE);
    const { id, products, ...rest } = updateOpportunitySchema.parse(input);
    const existing = await prisma.instOpportunity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Opportunity");

    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.instOpportunity.update({ where: { id }, data: rest });
      if (products) await replaceProducts(tx, id, products);
      return value;
    });

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "OPPORTUNITY_UPDATED", recordType: "InstOpportunity", recordId: id, previousValue: existing, newValue: updated });
    revalidatePath("/os/sales/opportunities");
    revalidatePath(`/os/sales/opportunities/${id}`);
    return { success: true as const, data: serializeOpportunity(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function changeOpportunityStage(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_MANAGE);
    const data = changeOpportunityStageSchema.parse(input);
    const existing = await prisma.instOpportunity.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Opportunity");

    const updated = await prisma.instOpportunity.update({
      where: { id: data.id },
      data: {
        stage: data.stage,
        lostReason: data.stage === "LOST" ? (data.lostReason ?? existing.lostReason) : existing.lostReason,
        wonAt: data.stage === "WON" && !existing.wonAt ? new Date() : existing.wonAt,
        lostAt: data.stage === "LOST" && !existing.lostAt ? new Date() : existing.lostAt,
      },
    });

    // Repeat Order / Relationship Management stages of the sales workflow
    // live on the Customer's own lifecycle, which this app already tracks
    // (Customer.lifecycleStage — Milestone 2) rather than a duplicate field
    // here — winning an opportunity is exactly the signal that moves it.
    if (data.stage === "WON") {
      await prisma.customer.update({ where: { id: existing.customerId }, data: { lifecycleStage: "CUSTOMER" } }).catch(() => null);
    }

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "OPPORTUNITY_STAGE_CHANGED", recordType: "InstOpportunity", recordId: data.id, previousValue: { stage: existing.stage }, newValue: { stage: updated.stage } });
    revalidatePath("/os/sales/opportunities");
    revalidatePath(`/os/sales/opportunities/${data.id}`);
    return { success: true as const, data: serializeOpportunity(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listOpportunities(input?: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.INST_OPPORTUNITIES_VIEW_ALL, PERMISSIONS.INST_OPPORTUNITIES_VIEW_ASSIGNED);
    const query = listOpportunitiesQuerySchema.parse(input ?? {});
    const scope = assignedScopeWhere(principal, PERMISSIONS.INST_OPPORTUNITIES_VIEW_ALL, "ownerId");

    const where = {
      AND: [
        scope,
        query.stage ? { stage: query.stage } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.territoryId ? { territoryId: query.territoryId } : {},
        query.q ? { OR: [{ opportunityNumber: { contains: query.q, mode: "insensitive" as const } }, { customer: { name: { contains: query.q, mode: "insensitive" as const } } }] } : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instOpportunity.findMany({
        where, orderBy: { updatedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: {
          customer: { select: { id: true, name: true, businessName: true } },
          owner: { select: { id: true, name: true } },
          territory: { select: { name: true } },
          products: { include: { product: { select: { id: true, name: true } } } },
        },
      }),
      prisma.instOpportunity.count({ where }),
    ]);

    return {
      success: true as const,
      data: { items: items.map(serializeOpportunity), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getOpportunityDetail(id: string) {
  try {
    await requireAnyPermission(PERMISSIONS.INST_OPPORTUNITIES_VIEW_ALL, PERMISSIONS.INST_OPPORTUNITIES_VIEW_ASSIGNED);
    const opportunity = await prisma.instOpportunity.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        territory: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNumber: true, organizationName: true } },
        products: { include: { product: { select: { id: true, name: true, images: true } } } },
        visits: { orderBy: { visitDate: "desc" }, include: { survey: { include: { consumptionEstimate: true } } } },
        samples: { orderBy: { issuedDate: "desc" }, include: { product: { select: { name: true } } } },
        followUps: { orderBy: { dueDate: "asc" } },
        quotations: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } },
        tasks: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!opportunity) throw new NotFoundError("Opportunity");
    return {
      success: true as const,
      data: {
        ...serializeOpportunity(opportunity),
        customer: { ...opportunity.customer, creditLimit: opportunity.customer.creditLimit ? Number(opportunity.customer.creditLimit) : null },
        quotations: opportunity.quotations.map((q) => ({
          ...q,
          versions: q.versions.map((v) => ({ ...v, subtotal: Number(v.subtotal), discountTotal: Number(v.discountTotal), taxTotal: Number(v.taxTotal), grandTotal: Number(v.grandTotal) })),
        })),
        samples: opportunity.samples.map((s) => ({ ...s, quantity: Number(s.quantity) })),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Founder/Manager pipeline widgets — total pipeline value, stage counts, conversion rate. */
export async function getOpportunityPipelineSummary(scopeToUserId?: string) {
  try {
    const principal = await getSalesPrincipal();
    const scope = scopeToUserId ? { ownerId: scopeToUserId } : assignedScopeWhere(principal, PERMISSIONS.INST_OPPORTUNITIES_VIEW_ALL, "ownerId");

    const [open, won, lost, byStage] = await Promise.all([
      prisma.instOpportunity.aggregate({ where: { AND: [scope, { stage: { notIn: ["WON", "LOST"] } }] }, _sum: { estimatedRevenue: true }, _count: { _all: true } }),
      prisma.instOpportunity.count({ where: { AND: [scope, { stage: "WON" }] } }),
      prisma.instOpportunity.count({ where: { AND: [scope, { stage: "LOST" }] } }),
      prisma.instOpportunity.groupBy({ by: ["stage"], where: scope, _count: { _all: true }, _sum: { estimatedRevenue: true } }),
    ]);

    const closed = won + lost;
    const conversionRate = closed > 0 ? Math.round((won / closed) * 1000) / 10 : 0;

    return {
      success: true as const,
      data: {
        totalPipelineValue: Number(open._sum.estimatedRevenue ?? 0),
        openOpportunities: open._count._all,
        won, lost, conversionRate,
        byStage: byStage.map((s) => ({ stage: s.stage, count: s._count._all, value: Number(s._sum.estimatedRevenue ?? 0) })),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
