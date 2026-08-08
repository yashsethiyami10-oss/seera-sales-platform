import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function QueueDashboard() {
  await requirePermission(PERMISSIONS.INQUIRIES_ASSIGN);
  const queues = await prisma.assignmentQueue.findMany({ include: { _count: { select: { inquiries: true } }, inquiries: { where: { assignedOwnerId: null }, orderBy: { createdAt: "asc" }, take: 1 } }, orderBy: { name: "asc" } });
  return <section className="space-y-5 text-white"><h1 className="text-3xl font-semibold">Queue Dashboard</h1><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{queues.map(q=><article key={q.id} className="rounded-2xl border border-white/10 p-5"><div className="flex justify-between"><h2>{q.name}</h2><span className="text-amber-400">{q._count.inquiries}</span></div><p className="mt-3 text-sm text-zinc-500">SLA: {q.initialSlaMinutes} minutes</p><p className="mt-1 text-sm text-zinc-500">Oldest unassigned: {q.inquiries[0]?.createdAt.toLocaleString()??"None"}</p></article>)}</div></section>;
}
