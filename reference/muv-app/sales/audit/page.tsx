import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const logs = await prisma.salesAuditLog.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 });
  return <section className="space-y-5 text-white"><header><h1 className="text-3xl font-semibold">Immutable audit log</h1><p className="mt-1 text-sm text-zinc-400">Append-only security and business history.</p></header><div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">Time</th><th>Actor</th><th>Module</th><th>Action</th><th>Record</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-white/10"><td className="p-4 whitespace-nowrap">{log.createdAt.toLocaleString()}</td><td>{log.user?.name ?? log.user?.email ?? "System"}</td><td>{log.module}</td><td>{log.action}</td><td>{log.recordType ? `${log.recordType} · ${log.recordId}` : "—"}</td></tr>)}</tbody></table>{!logs.length && <p className="p-8 text-center text-zinc-500">No audit events yet.</p>}</div></section>;
}
