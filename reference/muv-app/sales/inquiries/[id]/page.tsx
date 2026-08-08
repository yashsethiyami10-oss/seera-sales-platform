import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { inquiryScope } from "@/lib/sales-channel/repository";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission(PERMISSIONS.INQUIRIES_VIEW_ALL, PERMISSIONS.INQUIRIES_VIEW_ASSIGNED);
  const { id } = await params;
  const inquiry = await prisma.salesInquiry.findFirst({
    where: { id, AND: await inquiryScope() },
    include: { customer: true, salesChannel: true, leadSource: true, customerType: true, status: true, assignedOwner: true, assignmentQueue: true, territory: true, attachments: true, followUps: { orderBy: { dueAt: "asc" } }, notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, timeline: { orderBy: { createdAt: "asc" } } },
  });
  if (!inquiry) notFound();
  return <section className="space-y-6 text-white"><header><p className="text-amber-400">{inquiry.inquiryNumber}</p><h1 className="text-3xl font-semibold">{inquiry.subject}</h1><p className="text-sm text-zinc-400">{inquiry.salesChannel.name} · {inquiry.leadSource.name} · {inquiry.status.displayName}</p></header>
    <div className="grid gap-4 md:grid-cols-3">{[["Customer",inquiry.customer?.businessName??inquiry.customer?.name??"Manual review"],["Owner",inquiry.assignedOwner?.name??"Unassigned"],["Queue",inquiry.assignmentQueue?.name??"None"],["Territory",inquiry.territory?.name??"None"],["Priority",inquiry.priority],["Customer Type",inquiry.customerType.name]].map(([k,v])=><article key={k} className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">{k}</p><p className="mt-1">{v}</p></article>)}</div>
    <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Requirement</h2><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{inquiry.requirementSummary}</p></article>
    <article className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Customer timeline</h2><ol className="mt-4 space-y-4">{inquiry.timeline.map(e=><li key={e.id} className="border-l border-amber-400/30 pl-4"><p className="text-sm">{e.description}</p><time className="text-xs text-zinc-500">{e.createdAt.toLocaleString()}</time></li>)}</ol></article>
  </section>;
}
