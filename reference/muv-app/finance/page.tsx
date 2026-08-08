import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";
import { FINANCE_FLAG } from "@/lib/enterprise-finance/context";

export const dynamic = "force-dynamic";

const cardConfig: Array<{ label: string; permission: PermissionKey; load: (organizationKey: string) => Promise<number> }> = [
  { label: "Draft journals", permission: PERMISSIONS.FINANCE_MASTERS_VIEW, load: (organizationKey) => prisma.financeJournal.count({ where: { organizationKey, status: "DRAFT" } }) },
  { label: "Open receivables", permission: PERMISSIONS.FINANCE_RECEIVABLES_VIEW, load: (organizationKey) => prisma.financeReceivableInvoice.count({ where: { organizationKey, status: { notIn: ["CANCELLED"] }, outstandingAmount: { gt: 0 } } }) },
  { label: "Open payables", permission: PERMISSIONS.FINANCE_PAYABLES_VIEW, load: (organizationKey) => prisma.financeVendorBill.count({ where: { organizationKey, status: { notIn: ["CANCELLED"] }, outstandingAmount: { gt: 0 } } }) },
  { label: "Pending expense claims", permission: PERMISSIONS.FINANCE_EXPENSES_MANAGE, load: (organizationKey) => prisma.financeExpenseClaim.count({ where: { organizationKey, status: "SUBMITTED" } }) },
];

// Enterprise UI Integration — Enterprise Finance UI overview, same
// permission+feature-flag-gated card pattern as /enterprise and /network.
export default async function FinanceHome() {
  const principal = await getSalesPrincipal();
  const organizationKey = "MUV";
  const flag = await prisma.aiConfiguration.findFirst({ where: { organizationKey, key: FINANCE_FLAG, category: "FEATURE_FLAG" } });
  if (!flag || !(flag.value as { enabled?: boolean }).enabled) throw new ForbiddenError();

  const visible = cardConfig.filter((c) => principal.isFounder || principal.permissions.has(c.permission));
  if (!visible.length) throw new ForbiddenError();

  const cards = await Promise.all(visible.map(async (c) => [c.label, await c.load(organizationKey)] as const));
  return <section className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Enterprise Finance</h1><p className="mt-1 text-sm text-zinc-400">Organization-scoped financial overview for {principal.salesRole.name}.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</div>
  </section>;
}
