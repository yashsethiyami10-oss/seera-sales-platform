import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function TerritoriesPage() {
  await requirePermission(PERMISSIONS.TERRITORIES_MANAGE);
  const territories = await prisma.territory.findMany({ include: { parent: true, _count: { select: { users: true, children: true } } }, orderBy: { name: "asc" } });
  return <section className="space-y-5 text-white"><h1 className="text-3xl font-semibold">Territories</h1><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{territories.map((t) => <article key={t.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><div className="flex justify-between"><h2 className="font-medium">{t.name}</h2><code className="text-xs text-amber-400">{t.code}</code></div><p className="mt-2 text-sm text-zinc-500">Parent: {t.parent?.name ?? "National root"}</p><p className="mt-4 text-xs text-zinc-400">{t._count.users} users · {t._count.children} child territories</p></article>)}</div>{!territories.length && <p className="text-zinc-500">No territories configured.</p>}</section>;
}
