import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { getChannelReport } from "@/lib/sales-channel/reporting";
import { getSalesDashboardMetrics } from "@/lib/sales-channel/dashboard";
import { getOpportunityDashboard } from "@/lib/opportunity/reporting";
import { getQuotationDashboard } from "@/lib/quotation/reporting";
import { centralKpis } from "@/lib/growth/analytics";
import { listOpportunities } from "@/lib/opportunity/repository";
import { listInstitutionalInquiries } from "@/lib/sales-channel/repository";

type Props = { title: string; subtitle: string; institutionalOnly?: boolean; supportOnly?: boolean };

type WorkItem = { id: string; href: string; primary: string; secondary: string };

/**
 * Role Dashboards completion (Enterprise UI Integration, stage 1). The
 * "Work queue" section previously always rendered a hardcoded "No assigned
 * work yet." with no query behind it, for every dashboard variant — a
 * decorative placeholder, not a real feature. Replaced with a real top-5
 * pull from each role's own existing, already-authorized repository
 * function (no new domain logic): Support's assigned customers, the
 * Institutional queue's open institutional inquiries, and everyone else's
 * open opportunities via the same `listOpportunities`/`opportunityScope`
 * already backing /sales/opportunities.
 */
async function getWorkQueue(principal: Awaited<ReturnType<typeof getSalesPrincipal>>, institutionalOnly?: boolean, supportOnly?: boolean): Promise<WorkItem[]> {
  if (supportOnly) {
    const customers = await prisma.customer.findMany({
      where: principal.isFounder ? {} : { assignedOwnerId: principal.id },
      orderBy: { updatedAt: "desc" }, take: 5,
      select: { id: true, name: true, businessName: true, email: true },
    });
    return customers.map((c) => ({ id: c.id, href: `/sales/customers/${c.id}`, primary: c.businessName ?? c.name, secondary: c.email }));
  }
  if (institutionalOnly) {
    const result = await listInstitutionalInquiries({ pageSize: 5 });
    return result.items.map((row) => ({
      id: row.id, href: `/sales/inquiries/${row.id}`,
      primary: row.institutionalDetail?.organizationName ?? row.subject,
      secondary: row.status.displayName,
    }));
  }
  const result = await listOpportunities({ status: "ACTIVE", sort: "updated", pageSize: 5 });
  return result.items.map((o) => ({
    id: o.id, href: `/sales/opportunities/${o.id}`,
    primary: o.customer?.businessName ?? o.customer?.name ?? o.opportunityNumber,
    secondary: `${o.currentStage.name} · ${o.owner?.name ?? "Unassigned"}`,
  }));
}

export async function SalesDashboard({ title, subtitle, institutionalOnly, supportOnly }: Props) {
  const principal = await getSalesPrincipal();
  const [teamMembers, territories, auditEvents, channelReport, metrics, opportunities, quotations, growth, workQueue] = await Promise.all([
    prisma.user.count({ where: principal.isFounder ? { salesRoleId: { not: null }, active: true } : { reportingManagerId: principal.id, active: true } }),
    prisma.territory.count({ where: { active: true } }),
    principal.isFounder ? prisma.salesAuditLog.count() : Promise.resolve(0),
    getChannelReport(),
    getSalesDashboardMetrics(),
    supportOnly ? Promise.resolve(null) : getOpportunityDashboard(),
    getQuotationDashboard(),
    centralKpis({ start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: new Date() }, principal.isFounder ? {} : { ownerUserId: principal.id, territoryId: principal.territoryId ?? undefined, institutionalOnly }),
    getWorkQueue(principal, institutionalOnly, supportOnly),
  ]);
  const metric = Object.fromEntries(metrics.cards);
  const cards = institutionalOnly
    ? [["Institutional Pipeline", String(metric["Institutional Pipeline"])], ["Sample Requests Pending", String(metric["Sample Requests Pending"])], ["Quotation Requests Pending", String(metric["Quotation Requests Pending"])], ["Bulk Orders Pending", String(metric["Bulk Orders Pending"])]]
    : supportOnly
      ? [["Assigned cases", String(channelReport.total)], ["Pending Responses", String(metric["Pending Responses"])], ["Pending Follow-ups", String(metric["Pending Follow-ups"])], ["High Priority", String(metric["High Priority Inquiries"])]]
      : [
          ...metrics.cards.map(([label, value]) => [label, String(value)]),
          ...(opportunities ? [
            ["Open Opportunities", String(opportunities.openOpportunities)],
            ["Pipeline Value", `INR ${opportunities.pipelineValue}`],
            ["Won This Month", String(opportunities.wonThisMonth)],
            ["Lost This Month", String(opportunities.lostThisMonth)],
            ["Overdue Tasks", String(opportunities.overdueTasks)],
            ["Activities Today", String(opportunities.activitiesToday)],
          ] : []),
          ["Total Quotations", String(quotations.totalQuotations)],
          ["Accepted Quotations", String(quotations.acceptedQuotations)],
          ["Quotation Value", `INR ${quotations.totalQuotationValue}`],
          ["Expiring Soon", String(quotations.expiringSoon)],
          ["Net Revenue", `INR ${growth.netRevenue}`],
          ["Collected Revenue", `INR ${growth.collectedRevenue}`],
          ["Outstanding", `INR ${growth.outstandingRevenue}`],
          ["Repeat Purchase Rate", `${(growth.repeatPurchaseRate * 100).toFixed(1)}%`],
          ["Collection Rate", `${(growth.collectionRate * 100).toFixed(1)}%`],
          ["Opportunity Conversion", `${(growth.opportunityConversion * 100).toFixed(1)}%`],
        ];

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-amber-400">{principal.salesRole.name}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="font-medium text-white">Work queue</h2>
        {workQueue.length ? (
          <div className="mt-4 divide-y divide-white/10">
            {workQueue.map((item) => (
              <Link key={item.id} href={item.href} className="flex items-center justify-between py-3 hover:text-white text-zinc-300">
                <span>{item.primary}</span>
                <span className="text-xs text-zinc-500">{item.secondary}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-zinc-500">No assigned work yet.</p>
        )}
      </div>
    </section>
  );
}
