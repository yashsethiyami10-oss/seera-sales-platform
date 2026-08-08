import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";

export const dynamic = "force-dynamic";

const configuration: Record<string, { title: string; permission: PermissionKey; feature: string }> = {
  vendors: { title: "Vendors", permission: PERMISSIONS.ENTERPRISE_VENDOR_VIEW, feature: "ENTERPRISE_VENDOR_ENABLED" },
  procurement: { title: "Procurement", permission: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, feature: "ENTERPRISE_PROCUREMENT_ENABLED" },
  manufacturing: { title: "Manufacturing", permission: PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, feature: "ENTERPRISE_MANUFACTURING_ENABLED" },
  formulas: { title: "Formula & BOM", permission: PERMISSIONS.ENTERPRISE_FORMULA_VIEW, feature: "ENTERPRISE_FORMULA_BOM_ENABLED" },
  batches: { title: "Batches", permission: PERMISSIONS.ENTERPRISE_BATCH_VIEW, feature: "ENTERPRISE_BATCH_ENABLED" },
  quality: { title: "Quality", permission: PERMISSIONS.ENTERPRISE_QUALITY_VIEW, feature: "ENTERPRISE_QUALITY_ENABLED" },
  warehouses: { title: "Warehouses", permission: PERMISSIONS.ENTERPRISE_WAREHOUSE_VIEW, feature: "ENTERPRISE_WAREHOUSE_ENABLED" },
  planning: { title: "Supply Planning", permission: PERMISSIONS.ENTERPRISE_PLANNING_VIEW, feature: "ENTERPRISE_PLANNING_ENABLED" },
  reports: { title: "Operational Reports", permission: PERMISSIONS.ENTERPRISE_REPORTING_VIEW, feature: "ENTERPRISE_REPORTING_ENABLED" },
};

export default async function EnterpriseModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { module } = await params, config = configuration[module];
  if (!config) notFound();
  const principal = await requireEnterprisePrincipal(config.permission, config.feature);
  const query = await searchParams, q = query.q?.trim() ?? "", page = Math.max(1, Number(query.page ?? 1)), pageSize = 20;
  const organizationKey = principal.organizationKey;
  let rows: Array<{ id: string; number: string; label: string; status: string; date: Date }> = [];
  if (module === "vendors") rows = (await prisma.enterpriseVendor.findMany({ where: { organizationKey, ...(q ? { OR: [{ vendorCode: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.vendorCode, label: x.displayName, status: x.status, date: x.updatedAt }));
  if (module === "procurement") rows = (await prisma.enterprisePurchaseRequisition.findMany({ where: { organizationKey, ...(q ? { requisitionNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.requisitionNumber, label: x.purpose ?? "Purchase requisition", status: x.status, date: x.updatedAt }));
  if (module === "manufacturing") rows = (await prisma.enterpriseProductionOrder.findMany({ where: { organizationKey, ...(q ? { productionOrderNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.productionOrderNumber, label: "Production order", status: x.status, date: x.updatedAt }));
  if (module === "formulas") rows = (await prisma.enterpriseFormula.findMany({ where: { organizationKey, ...(q ? { OR: [{ formulaCode: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.formulaCode, label: x.name, status: x.status, date: x.updatedAt }));
  if (module === "batches") rows = (await prisma.enterpriseBatch.findMany({ where: { organizationKey, ...(q ? { batchNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.batchNumber, label: "Production batch", status: x.status, date: x.updatedAt }));
  if (module === "quality") rows = (await prisma.enterpriseInspection.findMany({ where: { organizationKey, ...(q ? { inspectionNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.inspectionNumber, label: x.inspectionType, status: x.status, date: x.updatedAt }));
  if (module === "warehouses") rows = (await prisma.enterpriseWarehouseMovement.findMany({ where: { organizationKey, ...(q ? { movementNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.movementNumber, label: x.movementType, status: "COMPLETED", date: x.createdAt }));
  if (module === "planning") rows = (await prisma.enterprisePlanningSnapshot.findMany({ where: { organizationKey, ...(q ? { snapshotNumber: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { snapshotAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })).map(x => ({ id: x.id, number: x.snapshotNumber, label: x.snapshotType, status: "IMMUTABLE", date: x.snapshotAt }));
  if (module === "reports") rows = [];
  return <section className="space-y-5">
    <header><h1 className="text-3xl font-semibold">{config.title}</h1><p className="mt-1 text-sm text-zinc-400">Permission-aware, organization-scoped records.</p></header>
    <form className="flex gap-2"><input name="q" defaultValue={q} aria-label="Search" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2" placeholder={`Search ${config.title.toLowerCase()}`} /><button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">Search</button></form>
    {module === "reports" ? <div className="rounded-xl border border-white/10 p-5"><p>Deterministic operational datasets are available through the governed reporting API.</p><Link className="mt-3 inline-block text-sm underline" href="/api/enterprise/reports?format=csv">Authorized CSV export</Link></div> :
    <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-3">Number</th><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-white/10"><td className="p-3 font-mono text-xs">{row.number}</td><td className="p-3">{row.label}</td><td className="p-3">{row.status}</td><td className="p-3 text-zinc-400">{row.date.toLocaleString()}</td></tr>)}</tbody></table></div>}
    <div className="flex justify-between">{page > 1 ? <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link> : <span />}{rows.length === pageSize ? <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link> : null}</div>
  </section>;
}

