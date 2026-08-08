import { prisma } from "@/lib/prisma";
import { paginationSchema, paginationMeta, toSkipTake } from "@/lib/pagination";
import { InquiriesTableClient } from "@/components/admin/inquiries-table-client";
import type { Prisma } from "@prisma/client";

/**
 * Phase 1C (GAP-006) — real admin view for BusinessInquiry submissions.
 * submitBusinessInquiry (actions/inquiries.ts), the BusinessInquiry model,
 * and the InquiryStatus workflow (NEW/CONTACTED/CLOSED) were all already
 * real; this page was the missing piece — staff previously had only a
 * one-time email alert, no durable, browsable record. Follows the exact
 * same Server Component + pagination pattern as /admin/customers (RBAC is
 * enforced by app/admin/layout.tsx for this page's own read; the mutating
 * action it calls, updateInquiryStatus, independently enforces requireStaff()
 * itself regardless).
 */
export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { status, page } = await searchParams;
  const pagination = paginationSchema.parse({ page });
  const { skip, take } = toSkipTake(pagination);

  const where: Prisma.BusinessInquiryWhereInput =
    status && ["NEW", "CONTACTED", "CLOSED"].includes(status) ? { status: status as "NEW" | "CONTACTED" | "CLOSED" } : {};

  const [inquiries, total] = await Promise.all([
    prisma.businessInquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.businessInquiry.count({ where }),
  ]);
  const meta = paginationMeta(pagination, total);

  const shaped = inquiries.map((i) => ({
    id: i.id,
    companyName: i.companyName,
    contactPerson: i.contactPerson,
    email: i.email,
    phone: i.phone,
    businessType: i.businessType,
    city: i.city,
    state: i.state,
    message: i.message,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Business Inquiries</h1>

      <form className="mb-5 flex gap-3" method="get">
        <select name="status" defaultValue={status ?? ""} className="muv-input" style={{ maxWidth: 200 }}>
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button type="submit" className="muv-btn-ghost">Filter</button>
      </form>

      <InquiriesTableClient inquiries={shaped} />

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
