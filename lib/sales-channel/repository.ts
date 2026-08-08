import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { ForbiddenError } from "@/lib/errors";

export async function inquiryScope(): Promise<Prisma.SalesInquiryWhereInput> {
  const principal = await getSalesPrincipal();
  if (principal.isFounder || principal.permissions.has(PERMISSIONS.INQUIRIES_VIEW_ALL)) return {};
  if (principal.permissions.has(PERMISSIONS.INQUIRIES_VIEW_ASSIGNED)) {
    return { OR: [{ assignedOwnerId: principal.id }, { customer: { assignedOwnerId: principal.id } }] };
  }
  return { id: "__denied__" };
}

/**
 * Stage 3 (Permission-driven Navigation and Route Integrity) — backing
 * query for /sales/leads. A "lead" is a SalesInquiry not yet linked to a
 * confirmed Customer record (`customerId: null`) — there is no separate
 * Lead model in the schema; `leads.view_all`/`leads.view_assigned` govern
 * visibility over this same unconverted-inquiry subset, distinct from
 * `inquiries.view_all`/`inquiries.view_assigned`'s full-inquiry scope.
 */
export async function leadScope(): Promise<Prisma.SalesInquiryWhereInput> {
  const principal = await getSalesPrincipal();
  const base: Prisma.SalesInquiryWhereInput = { customerId: null };
  if (principal.isFounder || principal.permissions.has(PERMISSIONS.LEADS_VIEW_ALL)) return base;
  if (principal.permissions.has(PERMISSIONS.LEADS_VIEW_ASSIGNED)) {
    return { AND: [base, { assignedOwnerId: principal.id }] };
  }
  return { id: "__denied__" };
}

export async function listLeads(params: { q?: string; page?: number; pageSize?: number }) {
  const scope = await leadScope();
  const page = Math.max(1, params.page ?? 1);
  const take = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const filters: Prisma.SalesInquiryWhereInput = {
    AND: [
      scope,
      params.q ? { OR: [
        { inquiryNumber: { contains: params.q, mode: "insensitive" } },
        { subject: { contains: params.q, mode: "insensitive" } },
        { customer: { name: { contains: params.q, mode: "insensitive" } } },
        { customer: { email: { contains: params.q, mode: "insensitive" } } },
      ] } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.salesInquiry.findMany({
      where: filters, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take,
      select: {
        id: true, inquiryNumber: true, subject: true, priority: true, createdAt: true,
        salesChannel: { select: { name: true } }, leadSource: { select: { name: true } },
        status: { select: { displayName: true } }, assignedOwner: { select: { name: true } },
      },
    }),
    prisma.salesInquiry.count({ where: filters }),
  ]);
  return { items, total, page, pageSize: take, pages: Math.max(1, Math.ceil(total / take)) };
}

/**
 * Backing query for /sales/institutional and the Institutional role's
 * dashboard work queue (components/sales/dashboard.tsx) — `institutional.
 * manage` is a management-level permission (same naming convention as
 * `users.manage`/`roles.manage`), so unlike `inquiryScope()` it is not
 * per-owner scoped: anyone holding it manages the full institutional-
 * inquiry set. `dashboard.institutional` is the other real caller's own
 * permission (the Institutional role's personal dashboard).
 *
 * Independent audit finding (Enterprise UI Integration final audit): this
 * function had no permission check of its own, unlike its sibling
 * `inquiryScope()`/`leadScope()` — safe today only because both current
 * callers happen to gate correctly first, not a structural guarantee.
 * Fixed to self-check, matching the sibling functions' own pattern.
 */
export async function listInstitutionalInquiries(params: { q?: string; page?: number; pageSize?: number }) {
  const principal = await getSalesPrincipal();
  if (!principal.isFounder && !principal.permissions.has(PERMISSIONS.INSTITUTIONAL_MANAGE) && !principal.permissions.has(PERMISSIONS.DASHBOARD_INSTITUTIONAL)) {
    throw new ForbiddenError();
  }
  const page = Math.max(1, params.page ?? 1);
  const take = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const filters: Prisma.SalesInquiryWhereInput = {
    AND: [
      { institutionalDetail: { isNot: null } },
      params.q ? { OR: [
        { inquiryNumber: { contains: params.q, mode: "insensitive" } },
        { institutionalDetail: { organizationName: { contains: params.q, mode: "insensitive" } } },
      ] } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.salesInquiry.findMany({
      where: filters, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take,
      select: {
        id: true, inquiryNumber: true, subject: true, createdAt: true,
        status: { select: { displayName: true } }, assignedOwner: { select: { name: true } },
        institutionalDetail: { select: { organizationName: true, institutionType: true, numberOfLocations: true, siteVisitRequired: true } },
      },
    }),
    prisma.salesInquiry.count({ where: filters }),
  ]);
  return { items, total, page, pageSize: take, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function listInquiries(params: {
  q?: string; page?: number; pageSize?: number; channel?: string; source?: string;
  status?: string; priority?: string; queue?: string; territory?: string; owner?: string;
  from?: Date; to?: Date; sort?: string;
}) {
  const scope = await inquiryScope();
  const page = Math.max(1, params.page ?? 1);
  const take = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const filters: Prisma.SalesInquiryWhereInput = {
    AND: [
      scope,
      params.q ? { OR: [
        { inquiryNumber: { contains: params.q, mode: "insensitive" } },
        { subject: { contains: params.q, mode: "insensitive" } },
        { customer: { name: { contains: params.q, mode: "insensitive" } } },
        { customer: { businessName: { contains: params.q, mode: "insensitive" } } },
        { customer: { email: { contains: params.q, mode: "insensitive" } } },
        { customer: { phone: { contains: params.q } } },
        { customer: { gstNumber: { contains: params.q, mode: "insensitive" } } },
      ] } : {},
      params.channel ? { salesChannel: { code: params.channel } } : {},
      params.source ? { leadSource: { code: params.source } } : {},
      params.status ? { status: { code: params.status } } : {},
      params.priority ? { priority: params.priority as Prisma.EnumSalesInquiryPriorityFilter } : {},
      params.queue ? { assignmentQueueId: params.queue } : {},
      params.territory ? { territoryId: params.territory } : {},
      params.owner ? { assignedOwnerId: params.owner } : {},
      params.from || params.to ? { createdAt: { gte: params.from, lte: params.to } } : {},
    ],
  };
  const orderBy: Prisma.SalesInquiryOrderByWithRelationInput =
    params.sort === "oldest" ? { createdAt: "asc" } :
    params.sort === "priority" ? { priority: "desc" } :
    params.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };
  const [items, total] = await Promise.all([
    prisma.salesInquiry.findMany({
      where: filters, orderBy, skip: (page - 1) * take, take,
      select: {
        id: true, inquiryNumber: true, subject: true, priority: true, createdAt: true, updatedAt: true,
        customer: { select: { name: true, businessName: true, email: true, phone: true } },
        salesChannel: { select: { name: true, code: true } }, leadSource: { select: { name: true } },
        status: { select: { code: true, displayName: true } }, assignedOwner: { select: { name: true } },
        assignmentQueue: { select: { name: true } }, territory: { select: { name: true } },
      },
    }),
    prisma.salesInquiry.count({ where: filters }),
  ]);
  return { items, total, page, pageSize: take, pages: Math.max(1, Math.ceil(total / take)) };
}
