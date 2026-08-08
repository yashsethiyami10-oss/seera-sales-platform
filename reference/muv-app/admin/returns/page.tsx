import { prisma } from "@/lib/prisma";
import { paginationSchema, paginationMeta, toSkipTake } from "@/lib/pagination";
import { returnRequestStatusValues } from "@/lib/validations/returns";
import { ReturnsTableClient } from "@/components/admin/returns-table-client";
import type { Prisma } from "@prisma/client";

/**
 * Phase 1D — admin view for customer-submitted "Report an Issue / Request
 * Replacement" tickets (actions/returns.ts, the ReturnRequest model).
 * Follows the exact same Server Component + pagination pattern as
 * /admin/inquiries (RBAC is enforced by app/admin/layout.tsx for this
 * page's own read; the mutating action it calls, updateReturnRequestStatus,
 * independently enforces requireStaff() itself regardless).
 */
export default async function AdminReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { status, page } = await searchParams;
  const pagination = paginationSchema.parse({ page });
  const { skip, take } = toSkipTake(pagination);

  const where: Prisma.ReturnRequestWhereInput =
    status && (returnRequestStatusValues as readonly string[]).includes(status)
      ? { status: status as (typeof returnRequestStatusValues)[number] }
      : {};

  const [requests, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        order: { select: { orderNumber: true } },
        orderItem: { select: { nameAtPurchase: true, sizeAtPurchase: true } },
        customer: { select: { name: true, email: true, phone: true } },
      },
    }),
    prisma.returnRequest.count({ where }),
  ]);
  const meta = paginationMeta(pagination, total);

  const shaped = requests.map((r) => ({
    id: r.id,
    ticketNumber: r.ticketNumber,
    orderNumber: r.order.orderNumber,
    itemName: r.orderItem.nameAtPurchase,
    itemSize: r.orderItem.sizeAtPurchase,
    customerName: r.customer.name,
    customerEmail: r.customer.email,
    customerPhone: r.customer.phone,
    issueType: r.issueType,
    description: r.description,
    evidenceUrls: r.evidenceUrls,
    contactPhone: r.contactPhone,
    status: r.status,
    adminNotes: r.adminNotes,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Return &amp; Replacement Requests</h1>

      <form className="mb-5 flex gap-3" method="get">
        <select name="status" defaultValue={status ?? ""} className="muv-input" style={{ maxWidth: 220 }}>
          <option value="">All statuses</option>
          {returnRequestStatusValues.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <button type="submit" className="muv-btn-ghost">Filter</button>
      </form>

      <ReturnsTableClient requests={shaped} />

      {meta.totalPages > 1 && (
        <div className="flex items-center gap-3 mt-5">
          {meta.page > 1 && <a href={`?status=${status ?? ""}&page=${meta.page - 1}`} className="muv-btn-ghost">Previous</a>}
          <span className="muv-text-meta text-xs">Page {meta.page} of {meta.totalPages}</span>
          {meta.page < meta.totalPages && <a href={`?status=${status ?? ""}&page=${meta.page + 1}`} className="muv-btn-ghost">Next</a>}
        </div>
      )}
    </div>
  );
}
