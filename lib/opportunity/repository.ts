import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS, SALES_ROLES } from "@/lib/sales/constants";

export async function opportunityScope(): Promise<Prisma.OpportunityWhereInput> {
  const principal = await getSalesPrincipal();
  if (principal.isFounder) return {};
  if (principal.salesRole.name === SALES_ROLES.SALES_MANAGER) {
    return {
      OR: [
        { ownerUserId: principal.id },
        { owner: { reportingManagerId: principal.id } },
        ...(principal.territoryId ? [{ territoryId: principal.territoryId }] : []),
      ],
    };
  }
  if (principal.salesRole.name === SALES_ROLES.INSTITUTIONAL) {
    return {
      ownerUserId: principal.id,
      customerType: { code: "INSTITUTIONAL" },
    };
  }
  if (principal.permissions.has(PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED)) {
    return { OR: [{ ownerUserId: principal.id }, { customer: { assignedOwnerId: principal.id } }] };
  }
  return { id: "__access_denied__" };
}

export type OpportunityListParams = {
  q?: string; page?: number; pageSize?: number; owner?: string; stage?: string;
  status?: string; priority?: string; territory?: string; customerType?: string;
  channel?: string; from?: Date; to?: Date; expectedFrom?: Date; expectedTo?: Date;
  minValue?: number; maxValue?: number; sort?: string;
};

export async function listOpportunities(params: OpportunityListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const q = params.q?.trim();
  const where: Prisma.OpportunityWhereInput = {
    AND: [
      await opportunityScope(),
      q ? { OR: [
        { opportunityNumber: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { businessName: { contains: q, mode: "insensitive" } } },
        { customer: { phone: { contains: q } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { gstNumber: { contains: q, mode: "insensitive" } } },
        { owner: { name: { contains: q, mode: "insensitive" } } },
        { currentStage: { name: { contains: q, mode: "insensitive" } } },
        { territory: { name: { contains: q, mode: "insensitive" } } },
        { salesChannel: { name: { contains: q, mode: "insensitive" } } },
        { customerType: { name: { contains: q, mode: "insensitive" } } },
        { sourceInquiry: { inquiryNumber: { contains: q, mode: "insensitive" } } },
      ] } : {},
      params.owner ? { ownerUserId: params.owner } : {},
      params.stage ? { currentStage: { code: params.stage } } : {},
      params.status ? { status: params.status as Prisma.EnumOpportunityStatusFilter } : {},
      params.priority ? { priority: { code: params.priority } } : {},
      params.territory ? { territoryId: params.territory } : {},
      params.customerType ? { customerType: { code: params.customerType } } : {},
      params.channel ? { salesChannel: { code: params.channel } } : {},
      params.from || params.to ? { createdAt: { gte: params.from, lte: params.to } } : {},
      params.expectedFrom || params.expectedTo ? { expectedCloseDate: { gte: params.expectedFrom, lte: params.expectedTo } } : {},
      params.minValue !== undefined || params.maxValue !== undefined
        ? { estimatedValue: { gte: params.minValue, lte: params.maxValue } } : {},
    ],
  };
  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    params.sort === "oldest" ? { createdAt: "asc" } :
    params.sort === "highest_value" ? { estimatedValue: "desc" } :
    params.sort === "lowest_value" ? { estimatedValue: "asc" } :
    params.sort === "probability" ? { probability: "desc" } :
    params.sort === "expected_close" ? { expectedCloseDate: "asc" } :
    params.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };
  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      include: {
        customer: { select: { id: true, name: true, businessName: true, phone: true, email: true } },
        owner: { select: { id: true, name: true } }, currentStage: true, priority: true,
        territory: { select: { id: true, name: true } }, salesChannel: { select: { id: true, name: true } },
        customerType: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.opportunity.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page: Math.min(page, pages), pageSize, pages };
}

export async function getOpportunity(id: string) {
  return prisma.opportunity.findFirst({
    where: { id, AND: await opportunityScope() },
    include: {
      customer: true, sourceInquiry: true, owner: { select: { id: true, name: true, email: true } },
      territory: true, salesChannel: true, customerType: true, currentStage: true,
      lostReason: true, wonReason: true, priority: true,
      stageHistory: { orderBy: { changedAt: "desc" }, include: { previousStage: true, newStage: true, actor: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, include: { activityType: true, status: true, performer: { select: { name: true } }, assignee: { select: { name: true } } } },
      tasks: { orderBy: { dueDate: "asc" }, include: { taskType: true, status: true, priority: true, owner: { select: { name: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      attachments: { orderBy: { createdAt: "desc" } },
      orders: { include: { order: true } },
      quotations: { orderBy: { updatedAt: "desc" }, include: { versions: { where: { isActive: true }, include: { status: true, pricingPolicy: true } } } },
    },
  });
}
