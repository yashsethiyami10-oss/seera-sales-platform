import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function ChannelPage() {
  await requirePermission(PERMISSIONS.SALES_CHANNELS_MANAGE);
  const channels = await prisma.salesChannel.findMany({ include: { defaultOwnerRole: true, defaultAssignmentQueue: true, _count: { select: { inquiries: true } } }, orderBy: { displayOrder: "asc" } });
  return <section className="space-y-5 text-white"><h1 className="text-3xl font-semibold">Channel Management</h1><div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">Channel</th><th>Code</th><th>Visibility</th><th>Default Queue</th><th>Usage</th></tr></thead><tbody>{channels.map(c=><tr key={c.id} className="border-t border-white/10"><td className="p-4">{c.name}<div className="text-xs text-zinc-500">{c.active?"Active":"Inactive"}</div></td><td><code>{c.code}</code></td><td>{c.publicVisibility?"Public":"Internal"}</td><td>{c.defaultAssignmentQueue?.name??"—"}</td><td>{c._count.inquiries}</td></tr>)}</tbody></table></div></section>;
}
