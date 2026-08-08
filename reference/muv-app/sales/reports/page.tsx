import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { getChannelReport } from "@/lib/sales-channel/reporting";
import { getOpportunityReports } from "@/lib/opportunity/reporting";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { getQuotationReports } from "@/lib/quotation/reporting";
export default async function ReportsPage() {
  const principal = await getSalesPrincipal();
  if (!principal.isFounder && !principal.permissions.has(PERMISSIONS.REPORTS_CHANNELS) && !principal.permissions.has(PERMISSIONS.REPORTS_OPPORTUNITIES)) {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);
  }
  const [report, opportunityReports, quotationReports] = await Promise.all([getChannelReport(), getOpportunityReports(), getQuotationReports()]);
  return <section className="space-y-6 text-white"><h1 className="text-3xl font-semibold">Unified Sales Reports</h1><div className="grid gap-4 md:grid-cols-3"><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Total inquiries</p><p className="mt-2 text-3xl">{report.total}</p></article><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Pending follow-ups</p><p className="mt-2 text-3xl">{report.pendingFollowUps}</p></article><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Opportunity status groups</p><p className="mt-2 text-3xl">{opportunityReports.summary.length}</p></article></div>
    <div className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Opportunity, Pipeline & Win/Loss Summary</h2><div className="mt-4 grid gap-3 md:grid-cols-4">{opportunityReports.summary.map(row=><div key={row.status} className="rounded-xl bg-white/5 p-4"><p>{row.status}</p><p className="mt-2 text-2xl">{row._count}</p><p className="text-xs text-zinc-500">Value {String(row._sum.estimatedValue ?? 0)} · Avg probability {Math.round(row._avg.probability ?? 0)}%</p></div>)}</div></div>
    <div className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Quotation & Approval Summary</h2><p className="mt-3 text-sm text-zinc-400">{quotationReports.quotationSummary.length} lifecycle groups · {quotationReports.approvalSummary.length} approval decision groups · {quotationReports.pricingPolicyUsage.length} pricing policies used</p></div>
    <p className="text-sm text-zinc-500">Owner, territory, channel, lead-source, customer-type, activity, task, quotation and approval aggregations reuse the authorized reporting scope.</p></section>;
}
