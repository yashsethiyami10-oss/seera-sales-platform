import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermission(PERMISSIONS.USERS_VIEW);
  const { q = "", page = "1" } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const where = { salesRoleId: { not: null }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [users, count] = await Promise.all([
    prisma.user.findMany({ where, include: { salesRole: true, territory: true, reportingManager: { select: { name: true } } }, orderBy: { name: "asc" }, skip: (currentPage - 1) * 20, take: 20 }),
    prisma.user.count({ where }),
  ]);
  return <section className="space-y-5 text-white"><header className="flex items-end justify-between"><div><h1 className="text-3xl font-semibold">Sales organization</h1><p className="mt-1 text-sm text-zinc-400">{count} assigned users · page {currentPage}</p></div><Link href="/sales/organization/roles" className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Roles &amp; Permissions</Link></header>
    <form><input name="q" defaultValue={q} placeholder="Search name or email" className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm" /></form>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">User</th><th>Role</th><th>Territory</th><th>Reports to</th><th>Status</th></tr></thead><tbody>{users.map((u) => <tr key={u.id} className="border-t border-white/10"><td className="p-4"><div>{u.name}</div><div className="text-xs text-zinc-500">{u.email}</div></td><td>{u.salesRole?.name}</td><td>{u.territory?.name ?? "—"}</td><td>{u.reportingManager?.name ?? "—"}</td><td>{u.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table>{!users.length && <p className="p-8 text-center text-zinc-500">No users found.</p>}</div>
    <nav aria-label="Organization pagination" className="flex items-center justify-between text-sm">
      {currentPage > 1
        ? <Link className="rounded-xl border border-white/10 px-4 py-2 hover:bg-white/5" href={`/sales/organization?q=${encodeURIComponent(q)}&page=${currentPage - 1}`}>Previous</Link>
        : <span />}
      {currentPage * 20 < count
        ? <Link className="rounded-xl border border-white/10 px-4 py-2 hover:bg-white/5" href={`/sales/organization?q=${encodeURIComponent(q)}&page=${currentPage + 1}`}>Next</Link>
        : <span />}
    </nav>
  </section>;
}
