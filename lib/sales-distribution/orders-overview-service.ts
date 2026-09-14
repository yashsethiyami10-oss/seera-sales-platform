import type { Prisma, PrismaClient, SalesOrderStatus } from "@prisma/client";
import { analyticsScope, type AnalyticsScopePortal } from "@/lib/phase-10/scope";

// UI Implementation & Visual Gap Closure mission — Founder Sales Overview / Orders. Presentation-
// layer only: every figure here reads the SAME canonical SeeraSalesOrder rows the existing generic
// rowsFor("orders") already queries (OperationalWorkspace.tsx) — this does not create a second
// order engine, it replaces the generic "Record/Details/Status/Value-Qty/Date/Action" table with a
// real business view (KPI buckets, search, status filter, business-language rows) over the exact
// same data and the exact same authorization scope (analyticsScope).

export type OrderBucket = "PENDING" | "PROCESSING" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

// Presentation-layer bucketing of the canonical SalesOrderStatus enum — a UI grouping, not a new
// business rule. The canonical `status` value is still shown verbatim on every row/detail.
export const STATUS_BUCKET: Record<SalesOrderStatus, OrderBucket> = {
  DRAFT: "PENDING", AWAITING_PAYMENT: "PENDING", PAYMENT_UNDER_REVIEW: "PENDING", CONFIRMED: "PENDING", SUBMITTED: "PENDING",
  ACKNOWLEDGED: "PROCESSING", PARTIAL_ACCEPTED: "PROCESSING", ACCEPTED: "PROCESSING", HELD: "PROCESSING", ALLOCATED: "PROCESSING", DISPATCH_READY: "PROCESSING",
  DISPATCHED: "DISPATCHED", PARTIAL_DELIVERED: "DISPATCHED",
  DELIVERED: "DELIVERED", CLOSED: "DELIVERED",
  REJECTED: "CANCELLED", CANCELLED: "CANCELLED",
};
const BUCKET_STATUSES: Record<OrderBucket, SalesOrderStatus[]> = { PENDING: [], PROCESSING: [], DISPATCHED: [], DELIVERED: [], CANCELLED: [] };
for (const [status, bucket] of Object.entries(STATUS_BUCKET) as [SalesOrderStatus, OrderBucket][]) BUCKET_STATUSES[bucket].push(status);

// Shared business-language labels — kept here as the single source so the Orders Overview list and
// the Order Detail page can never disagree on what a status/type/bucket is called.
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", AWAITING_PAYMENT: "Awaiting payment", PAYMENT_UNDER_REVIEW: "Payment under review", CONFIRMED: "Confirmed", SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged", PARTIAL_ACCEPTED: "Partially accepted", ACCEPTED: "Accepted", HELD: "On hold", ALLOCATED: "Allocated", DISPATCH_READY: "Ready to dispatch",
  DISPATCHED: "Dispatched", PARTIAL_DELIVERED: "Partially delivered", DELIVERED: "Delivered", CLOSED: "Closed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export const ORDER_TYPE_LABEL: Record<string, string> = {
  RETAILER_ORDER: "Retailer Order",
  DISTRIBUTOR_REPLENISHMENT: "Distributor Replenishment",
  COMPANY_REPLENISHMENT: "Company Replenishment",
};
export const BUCKET_TONE: Record<OrderBucket, string> = {
  PENDING: "warning", PROCESSING: "info", DISPATCHED: "analytical", DELIVERED: "success", CANCELLED: "danger",
};

export type OrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCount: number;
  amount: number;
  status: SalesOrderStatus;
  bucket: OrderBucket;
  date: Date;
  sourcePortal: string | null;
  salespersonName: string | null;
};

export async function ordersOverview(
  db: PrismaClient,
  actorId: string,
  portal: AnalyticsScopePortal,
  input: { q?: string; status?: OrderBucket; page?: number },
) {
  const scope = await analyticsScope(db, actorId, portal);
  const page = Math.max(1, input.page ?? 1);
  const take = 30;
  const q = input.q?.trim();

  const where: Prisma.SeeraSalesOrderWhereInput = {
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { retailer: { businessName: { contains: q, mode: "insensitive" as const } } },
            { buyerPartner: { legalName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(scope.partyIds ? { OR: [{ buyerPartnerId: { in: scope.partyIds } }, { sellerPartnerId: { in: scope.partyIds } }] } : {}),
    ...(scope.employeeIds ? { salespersonId: { in: scope.employeeIds } } : {}),
    ...(scope.retailerIds ? { retailerId: { in: scope.retailerIds } } : {}),
    ...(input.status ? { status: { in: BUCKET_STATUSES[input.status] } } : {}),
  };

  const [rows, statusCountsUnfiltered, todayCount, todayValue, aggregate] = await Promise.all([
    db.seeraSalesOrder.findMany({
      where,
      include: {
        retailer: { select: { businessName: true } },
        buyerPartner: { select: { legalName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    // Bucket counts always reflect search+scope but NOT the status filter itself, so the KPI
    // strip stays a stable set of tabs to switch between rather than shrinking to just the
    // selected bucket.
    db.seeraSalesOrder.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: true }),
    db.seeraSalesOrder.count({ where: { ...where, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.seeraSalesOrder.aggregate({ where: { ...where, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _sum: { total: true } }),
    db.seeraSalesOrder.aggregate({ where, _sum: { total: true }, _count: true }),
  ]);

  const bucketCounts: Record<OrderBucket, number> = { PENDING: 0, PROCESSING: 0, DISPATCHED: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const c of statusCountsUnfiltered) bucketCounts[STATUS_BUCKET[c.status]] += c._count;

  const salespersonIds = [...new Set(rows.map((x) => x.salespersonId).filter((v): v is string => Boolean(v)))];
  const salespeople = salespersonIds.length ? await db.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, email: true } }) : [];
  const salespersonNameById = new Map(salespeople.map((u) => [u.id, u.name ?? u.email]));

  const orderRows: OrderRow[] = rows.map((x) => ({
    id: x.id,
    orderNumber: x.orderNumber,
    customerName: x.retailer?.businessName ?? x.buyerPartner?.legalName ?? "—",
    itemCount: x._count.lines,
    amount: Number(x.total),
    status: x.status,
    bucket: STATUS_BUCKET[x.status],
    date: x.createdAt,
    sourcePortal: x.sourcePortal,
    salespersonName: x.salespersonId ? (salespersonNameById.get(x.salespersonId) ?? null) : null,
  }));

  return {
    rows: orderRows,
    totalOrders: aggregate._count,
    totalValue: Number(aggregate._sum.total ?? 0),
    todayCount,
    todayValue: Number(todayValue._sum.total ?? 0),
    buckets: bucketCounts,
    page,
    hasMore: rows.length === take,
  };
}
