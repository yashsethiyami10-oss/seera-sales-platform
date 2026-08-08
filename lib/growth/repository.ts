import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsScope } from "./analytics";

export type IntelligenceQuery = {
  search?: string; status?: string; segmentId?: string; membershipLevelId?: string;
  territoryId?: string; ownerId?: string; customerTypeId?: string; channelId?: string;
  minRevenue?: number; maxRevenue?: number; minCollectionRate?: number;
  sort?: "name" | "netRevenue" | "totalOrders" | "averageOrderValue" | "lastPurchaseDate" | "outstandingAmount" | "collectionRate" | "updatedAt";
  direction?: "asc" | "desc"; page?: number; take?: number;
};

export function customerScope(scope: AnalyticsScope): Prisma.CustomerWhereInput {
  return {
    ...(scope.ownerUserId ? { assignedOwnerId: scope.ownerUserId } : {}),
    ...(scope.territoryId ? { assignedTerritoryId: scope.territoryId } : {}),
    ...(scope.institutionalOnly ? { customerType: { code: "INSTITUTIONAL" } } : {}),
  };
}

export async function listCustomerIntelligence(query: IntelligenceQuery, scope: AnalyticsScope) {
  const page = Math.max(1, query.page ?? 1), take = Math.min(100, Math.max(1, query.take ?? 25));
  const profileWhere: Prisma.CustomerIntelligenceProfileWhereInput = {
    ...(query.status ? { statusCode: query.status } : {}),
    ...(query.segmentId ? { primarySegmentId: query.segmentId } : {}),
    ...(query.minRevenue !== undefined || query.maxRevenue !== undefined ? { netRevenue: { gte: query.minRevenue, lte: query.maxRevenue } } : {}),
    ...(query.minCollectionRate !== undefined ? { collectionRate: { gte: query.minCollectionRate } } : {}),
  };
  const customerWhere: Prisma.CustomerWhereInput = {
    ...customerScope(scope),
    ...(query.ownerId ? { assignedOwnerId: query.ownerId } : {}),
    ...(query.territoryId ? { assignedTerritoryId: query.territoryId } : {}),
    ...(query.customerTypeId ? { customerTypeId: query.customerTypeId } : {}),
    ...(query.channelId ? { primaryChannelId: query.channelId } : {}),
    ...(query.search ? { OR: [
      { name: { contains: query.search, mode: "insensitive" } }, { businessName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } }, { phone: { contains: query.search } },
      { gstNumber: { contains: query.search, mode: "insensitive" } },
    ] } : {}),
  };
  const orderBy = query.sort === "name"
    ? { customerId: query.direction ?? "asc" } as const
    : { [query.sort ?? "updatedAt"]: query.direction ?? "desc" } as Prisma.CustomerIntelligenceProfileOrderByWithRelationInput;
  const scopedCustomers = await prisma.customer.findMany({ where: customerWhere, select: { id: true } });
  let customerIds = scopedCustomers.map(c => c.id);
  if (query.membershipLevelId) {
    const loyalty = await prisma.loyaltyProfile.findMany({ where: { customerId: { in: customerIds }, membershipLevelId: query.membershipLevelId }, select: { customerId: true } });
    customerIds = loyalty.map(row => row.customerId);
  }
  const scopedProfileWhere = { ...profileWhere, customerId: { in: customerIds } };
  const [total, rows] = await Promise.all([
    prisma.customerIntelligenceProfile.count({ where: scopedProfileWhere }),
    prisma.customerIntelligenceProfile.findMany({ where: scopedProfileWhere, orderBy, skip: (page - 1) * take, take }),
  ]);
  const customers = await prisma.customer.findMany({ where: { id: { in: rows.map(r => r.customerId) } }, include: { assignedOwner: true, assignedTerritory: true, customerType: true, primaryChannel: true } });
  const byId = new Map(customers.map(c => [c.id, c]));
  const filtered = rows.flatMap(profile => byId.has(profile.customerId) ? [{ profile, customer: byId.get(profile.customerId)! }] : []);
  return { rows: filtered, page, take, total, pageCount: Math.ceil(total / take) };
}
