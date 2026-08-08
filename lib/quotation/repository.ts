import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS, SALES_ROLES } from "@/lib/sales/constants";

export async function quotationScope(): Promise<Prisma.QuotationWhereInput> {
  const principal = await getSalesPrincipal();
  if (principal.isFounder) return {};
  if (principal.permissions.has(PERMISSIONS.QUOTATIONS_VIEW_SUPPORT)) {
    return { OR: [{ customer: { assignedOwnerId: principal.id } }, { opportunity: { ownerUserId: principal.id } }] };
  }
  if (principal.salesRole.name === SALES_ROLES.SALES_MANAGER) {
    return { OR: [{ ownerUserId: principal.id }, { owner: { reportingManagerId: principal.id } },
      ...(principal.territoryId ? [{ territoryId: principal.territoryId }] : [])] };
  }
  if (principal.salesRole.name === SALES_ROLES.INSTITUTIONAL) {
    return { ownerUserId: principal.id, opportunity: { customerType: { code: { in: ["INSTITUTIONAL", "CORPORATE"] } } } };
  }
  if (principal.permissions.has(PERMISSIONS.QUOTATIONS_VIEW_ASSIGNED)) return { ownerUserId: principal.id };
  return { id: "__access_denied__" };
}

export async function listQuotations(params: {
  q?: string; page?: number; pageSize?: number; status?: string; approvalState?: string;
  pricingPolicy?: string; owner?: string; territory?: string; customerType?: string;
  issueFrom?: Date; issueTo?: Date; validFrom?: Date; validTo?: Date; version?: number; sort?: string;
}) {
  const page = Math.max(1, params.page ?? 1), pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const where: Prisma.QuotationWhereInput = { AND: [await quotationScope(),
    params.q ? { OR: [
      { quotationNumber: { contains: params.q, mode: "insensitive" } },
      { customer: { name: { contains: params.q, mode: "insensitive" } } },
      { customer: { businessName: { contains: params.q, mode: "insensitive" } } },
      { customer: { phone: { contains: params.q } } }, { customer: { email: { contains: params.q, mode: "insensitive" } } },
      { customer: { gstNumber: { contains: params.q, mode: "insensitive" } } },
      { opportunity: { opportunityNumber: { contains: params.q, mode: "insensitive" } } },
      { owner: { name: { contains: params.q, mode: "insensitive" } } }, { territory: { name: { contains: params.q, mode: "insensitive" } } },
    ] } : {},
    params.owner ? { ownerUserId: params.owner } : {}, params.territory ? { territoryId: params.territory } : {},
    params.customerType ? { opportunity: { customerType: { code: params.customerType } } } : {},
    { versions: { some: { isActive: true, ...(params.status ? { status: { code: params.status } } : {}),
      ...(params.approvalState ? { approvalState: params.approvalState } : {}),
      ...(params.pricingPolicy ? { pricingPolicy: { code: params.pricingPolicy } } : {}),
      ...(params.version ? { versionNumber: params.version } : {}),
      ...(params.issueFrom || params.issueTo ? { issueDate: { gte: params.issueFrom, lte: params.issueTo } } : {}),
      ...(params.validFrom || params.validTo ? { validUntil: { gte: params.validFrom, lte: params.validTo } } : {}) } } },
  ] };
  const orderBy: Prisma.QuotationOrderByWithRelationInput = params.sort === "number" ? { quotationNumber: "asc" } :
    params.sort === "customer" ? { customer: { name: "asc" } } : params.sort === "owner" ? { owner: { name: "asc" } } :
    params.sort === "oldest" ? { createdAt: "asc" } : { updatedAt: "desc" };
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      include: { customer: { select: { id: true, name: true, businessName: true, phone: true } },
        opportunity: { select: { id: true, opportunityNumber: true } }, owner: { select: { id: true, name: true } },
        territory: { select: { id: true, name: true } }, versions: { where: { isActive: true }, take: 1,
          include: { status: true, pricingPolicy: true } } } }),
    prisma.quotation.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page: Math.min(page, pages), pageSize, pages };
}

export async function getQuotation(id: string) {
  return prisma.quotation.findFirst({ where: { id, AND: await quotationScope() }, include: {
    customer: true, opportunity: true, owner: { select: { id: true, name: true, email: true } }, territory: true,
    versions: { orderBy: { versionNumber: "desc" }, include: { status: true, pricingPolicy: true,
      lineItems: { orderBy: { displayOrder: "asc" } }, statusHistory: { orderBy: { createdAt: "desc" }, include: { previousStatus: true, newStatus: true, changedBy: { select: { name: true } } } },
      approvalRequests: { include: { rule: true, requester: { select: { name: true } }, approver: { select: { name: true } }, decisions: true } },
      documents: { orderBy: { generatedAt: "desc" } }, deliveries: true, views: true } },
  } });
}
