import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { paginationSchema, paginationMeta, toSkipTake } from "@/lib/pagination";
import { Badge } from "@/components/ui/primitives";
import type { Prisma } from "@prisma/client";

/**
 * Server-rendered search + pagination via a plain GET form and URL
 * searchParams — no client-side state needed for this list, per "Server
 * Components first, no unnecessary Client Components." Reuses the same
 * paginationSchema/paginationMeta/toSkipTake helpers already used by
 * app/api/products/route.ts, not a new pagination implementation.
 */
export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page } = await searchParams;
  const pagination = paginationSchema.parse({ page });
  const { skip, take } = toSkipTake(pagination);

  const where: Prisma.CustomerWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
    : {};

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { _count: { select: { orders: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  const meta = paginationMeta(pagination, total);

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Customers</h1>

      <form className="mb-5" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder="Search by name, email, or phone" className="muv-input" style={{ maxWidth: 360 }} />
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Name", "Email", "Phone", "Orders", "Newsletter", "Customer Since", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.name}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.email}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.phone ?? "—"}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c._count.orders}</td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}><Badge tone={c.marketingOptIn ? "positive" : "muted"}>{c.marketingOptIn ? "Subscribed" : "Not subscribed"}</Badge></td>
                <td className="py-3 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <Link href={`/admin/customers/${c.id}`} className="text-xs" style={{ color: "var(--lavender)" }}>View</Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={7} className="py-8 text-center muv-text-meta text-sm">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>

      {meta.totalPages > 1 && (
        <div className="flex items-center gap-3 mt-5">
          {meta.page > 1 && <Link href={`?q=${q ?? ""}&page=${meta.page - 1}`} className="muv-btn-ghost">Previous</Link>}
          <span className="muv-text-meta text-xs">Page {meta.page} of {meta.totalPages}</span>
          {meta.page < meta.totalPages && <Link href={`?q=${q ?? ""}&page=${meta.page + 1}`} className="muv-btn-ghost">Next</Link>}
        </div>
      )}
    </div>
  );
}
