import { prisma } from "@/lib/prisma";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";

export const dynamic = "force-dynamic";

// Stage 3 (Route Integrity): each card below surfaces counts from a
// specific Enterprise module — gate every card on that module's own view
// permission (the same keys app/enterprise/[module]/page.tsx already
// enforces) so a sales-role user with zero Enterprise permissions can no
// longer reach this aggregate overview by direct URL, and a user with only
// some module permissions doesn't see counts for modules they can't open.
const cardConfig: Array<{ label: string; permission: PermissionKey; feature: string; load: (organizationKey: string) => Promise<number> }> = [
  { label: "Vendors", permission: PERMISSIONS.ENTERPRISE_VENDOR_VIEW, feature: "ENTERPRISE_VENDOR_ENABLED", load: (organizationKey) => prisma.enterpriseVendor.count({ where: { organizationKey } }) },
  { label: "Open requisitions", permission: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, feature: "ENTERPRISE_PROCUREMENT_ENABLED", load: (organizationKey) => prisma.enterprisePurchaseRequisition.count({ where: { organizationKey, status: { notIn: ["CLOSED", "CANCELLED"] } } }) },
  { label: "Production in progress", permission: PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, feature: "ENTERPRISE_MANUFACTURING_ENABLED", load: (organizationKey) => prisma.enterpriseProductionOrder.count({ where: { organizationKey, status: "IN_PROGRESS" } }) },
  { label: "Batches", permission: PERMISSIONS.ENTERPRISE_BATCH_VIEW, feature: "ENTERPRISE_BATCH_ENABLED", load: (organizationKey) => prisma.enterpriseBatch.count({ where: { organizationKey } }) },
  { label: "QC hold", permission: PERMISSIONS.ENTERPRISE_QUALITY_VIEW, feature: "ENTERPRISE_QUALITY_ENABLED", load: (organizationKey) => prisma.enterpriseBatch.count({ where: { organizationKey, status: "QC_HOLD" } }) },
  { label: "Warehouse movements", permission: PERMISSIONS.ENTERPRISE_WAREHOUSE_VIEW, feature: "ENTERPRISE_WAREHOUSE_ENABLED", load: (organizationKey) => prisma.enterpriseWarehouseMovement.count({ where: { organizationKey } }) },
];

export default async function EnterpriseHome() {
  const principal = await getSalesPrincipal();
  const organizationKey = "MUV";
  const flagRows = await prisma.aiConfiguration.findMany({ where: { organizationKey, category: "FEATURE_FLAG", active: true }, select: { key: true, value: true } });
  const enabledFlags = new Set(flagRows.filter((row) => Boolean((row.value as { enabled?: boolean }).enabled)).map((row) => row.key));
  const visible = cardConfig.filter((c) => enabledFlags.has(c.feature) && (principal.isFounder || principal.permissions.has(c.permission)));
  if (!visible.length) throw new ForbiddenError();

  const cards = await Promise.all(visible.map(async (c) => [c.label, await c.load(organizationKey)] as const));
  return <section className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Enterprise Operations</h1><p className="mt-1 text-sm text-zinc-400">Organization-scoped operational overview for {principal.salesRole.name}.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <article key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</div>
  </section>;
}

