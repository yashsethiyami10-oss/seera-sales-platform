import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { requireAiPermission } from "@/lib/muv-ai/security";
import { centralKpis } from "@/lib/growth/analytics";
import { prisma } from "@/lib/prisma";

export default async function ExecutiveAiPage() {
 const principal=await getAiPrincipal();requireAiPermission(principal,"ai.executive.use");
 const end=new Date(),start=new Date(end.getFullYear(),end.getMonth(),1);
 const [kpis,artifacts,reports]=await Promise.all([centralKpis({start,end}),prisma.aiArtifact.findMany({where:{organizationKey:principal.organizationKey,ownerId:principal.id},orderBy:{createdAt:"desc"},take:10}),prisma.executiveReport.findMany({orderBy:{generatedAt:"desc"},take:10})]);
 const cards=[["Net Revenue",kpis.netRevenue],["Collections",kpis.collectedRevenue],["Outstanding",kpis.outstandingRevenue],["Completed Orders",kpis.completedOrders],["Customers",kpis.customerCount],["Collection Rate",`${(kpis.collectionRate*100).toFixed(1)}%`]];
 return <section className="space-y-6 text-white"><header><p className="text-xs uppercase tracking-[.2em] text-amber-400">Founder authorized</p><h1 className="mt-2 text-3xl font-semibold">Executive AI Workspace</h1><p className="text-sm text-zinc-400">Historical, evidence-backed intelligence using centralized Phase 6 KPI definitions. No forecasting.</p></header><div className="grid gap-4 md:grid-cols-3">{cards.map(([a,b])=><article key={a} className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">{a}</p><p className="mt-2 text-3xl">{b}</p></article>)}</div><div className="grid gap-5 lg:grid-cols-2"><article className="rounded-2xl border border-white/10 p-5"><h2>Executive reports</h2>{reports.map(r=><p key={r.id} className="mt-3 text-sm">{r.reportNumber} · {r.reportType} · v{r.reportVersion}</p>)}</article><article className="rounded-2xl border border-white/10 p-5"><h2>Saved executive artifacts</h2>{artifacts.map(a=><p key={a.id} className="mt-3 text-sm">{a.title} · v{a.version}</p>)}{!artifacts.length?<p className="mt-3 text-sm text-zinc-500">No saved artifacts.</p>:null}</article></div></section>;
}
