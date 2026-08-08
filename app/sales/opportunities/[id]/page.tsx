import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAnyPermission, hasPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { getOpportunity } from "@/lib/opportunity/repository";
import { prisma } from "@/lib/prisma";
import { OpportunityActions } from "@/components/sales/opportunity-actions";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission(PERMISSIONS.OPPORTUNITIES_VIEW_ALL, PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED);
  const [opportunity, stages, canCreateQuotation] = await Promise.all([getOpportunity((await params).id),
    prisma.opportunityStage.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" }, select: { code: true, name: true } }),
    hasPermission(PERMISSIONS.QUOTATIONS_CREATE_VERSIONS)]);
  if (!opportunity) notFound();
  return <section className="space-y-6 text-white">
    <header className="flex items-end justify-between gap-4"><div><p className="text-sm text-amber-400">{opportunity.opportunityNumber}</p><h1 className="mt-2 text-3xl font-semibold">{opportunity.customer.businessName ?? opportunity.customer.name}</h1>
      <p className="mt-1 text-zinc-400">{opportunity.currentStage.name} · {opportunity.status} · {opportunity.probability}% probability</p></div>
      {canCreateQuotation && <Link href={`/sales/quotations/new?opportunityId=${opportunity.id}`} className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-sm font-medium text-black">Create Quotation</Link>}</header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Owner", opportunity.owner.name ?? opportunity.owner.email], ["Territory", opportunity.territory?.name ?? "—"],
      ["Channel", opportunity.salesChannel?.name ?? "—"], ["Customer Type", opportunity.customerType?.name ?? "—"],
      ["Estimated Value", `${opportunity.currency} ${opportunity.estimatedValue}`], ["Expected Close", opportunity.expectedCloseDate?.toLocaleDateString() ?? "—"],
      ["Source Inquiry", opportunity.sourceInquiry?.inquiryNumber ?? "Direct"], ["Priority", opportunity.priority.name],
    ].map(([label,value])=><article key={label} className="rounded-2xl border border-white/10 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2">{value}</p></article>)}</div>
    <div className="grid gap-6 xl:grid-cols-2">
      <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Activity Timeline</h2><div className="mt-4 space-y-3">{opportunity.activities.map(a=><div key={a.id} className="border-l border-amber-400/40 pl-4"><p>{a.activityType.name}: {a.subject}</p><p className="text-xs text-zinc-500">{a.status.name} · {a.createdAt.toLocaleString()}</p></div>)}{!opportunity.activities.length&&<p className="text-sm text-zinc-500">No activities yet.</p>}</div></article>
      <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Tasks & Follow-up</h2><div className="mt-4 space-y-3">{opportunity.tasks.map(t=><div key={t.id}><p>{t.title}</p><p className="text-xs text-zinc-500">{t.status.name} · {t.owner.name} · due {t.dueDate.toLocaleString()}</p></div>)}{!opportunity.tasks.length&&<p className="text-sm text-zinc-500">No tasks yet.</p>}</div></article>
      <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Notes & Attachments</h2><div className="mt-4 space-y-3">{opportunity.notes.map(n=><div key={n.id}><p>{n.note}</p><p className="text-xs text-zinc-500">{n.author.name} · {n.visibility}</p></div>)}<p className="text-xs text-zinc-500">{opportunity.attachments.length} protected attachment references</p></div></article>
      <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Audit-safe Stage History</h2><div className="mt-4 space-y-3">{opportunity.stageHistory.map(h=><div key={h.id}><p>{h.previousStage?.name ?? "Created"} → {h.newStage.name}</p><p className="text-xs text-zinc-500">{h.actor.name} · {h.changedAt.toLocaleString()} {h.reason ? `· ${h.reason}` : ""}</p></div>)}</div></article>
    </div>
    <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Quotation Versions & Commercial Summary</h2>{opportunity.quotations.map(q=>{const v=q.versions[0];return <p key={q.id} className="mt-3">{q.quotationNumber} · v{v?.versionNumber} · {v?.status.name??"Historical"} · {v?.grandTotal.toString()??"—"} · {v?.pricingPolicy.name??"—"}</p>})}{!opportunity.quotations.length&&<p className="mt-3 text-sm text-zinc-500">No quotations.</p>}</article>
    <OpportunityActions opportunityId={opportunity.id} stages={stages} probability={opportunity.probability} estimatedValue={opportunity.estimatedValue.toString()}/>
  </section>;
}
