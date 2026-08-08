import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { inquiryScope } from "@/lib/sales-channel/repository";
export default async function AssignmentDashboard() {
  await requirePermission(PERMISSIONS.INQUIRIES_ASSIGN);
  const scope = await inquiryScope();
  const now = new Date();
  const [unassigned, assigned, overdue, byQueue, byTerritory, byOwner] = await Promise.all([
    prisma.salesInquiry.count({ where: { AND: [scope, { assignedOwnerId: null }] } }),
    prisma.salesInquiry.count({ where: { AND: [scope, { assignedOwnerId: { not: null } }] } }),
    prisma.salesInquiry.count({ where: { AND: [scope, { firstResponseAt: null, responseSlaAt: { lt: now } }] } }),
    prisma.salesInquiry.groupBy({ by: ["assignmentQueueId"], where: scope, _count: true }),
    prisma.salesInquiry.groupBy({ by: ["territoryId"], where: scope, _count: true }),
    prisma.salesInquiry.groupBy({ by: ["assignedOwnerId"], where: scope, _count: true }),
  ]);
  return <section className="space-y-6 text-white"><h1 className="text-3xl font-semibold">Assignment Dashboard</h1><div className="grid gap-4 md:grid-cols-3">{[["Unassigned",unassigned],["Assigned",assigned],["Overdue",overdue],["Queues",byQueue.length],["Territories",byTerritory.length],["Owners",byOwner.length]].map(([label,value])=><article key={label} className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">{label}</p><p className="mt-2 text-3xl">{value}</p></article>)}</div></section>;
}
