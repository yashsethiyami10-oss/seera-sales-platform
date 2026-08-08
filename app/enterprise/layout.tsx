import { redirect } from "next/navigation";
import {
  Truck, ClipboardList, Factory, FlaskConical, Layers3, ShieldCheck, Warehouse, CalendarRange, BarChart3,
} from "lucide-react";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/errors";
import { signOut } from "@/lib/auth";
import { EnterpriseShell, type ShellNavItem } from "@/components/enterprise-shell/EnterpriseShell";

const modules = [
  ["vendors", "Vendors", PERMISSIONS.ENTERPRISE_VENDOR_VIEW, "ENTERPRISE_VENDOR_ENABLED", <Truck size={17} key="i" />],
  ["procurement", "Procurement", PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, "ENTERPRISE_PROCUREMENT_ENABLED", <ClipboardList size={17} key="i" />],
  ["manufacturing", "Manufacturing", PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, "ENTERPRISE_MANUFACTURING_ENABLED", <Factory size={17} key="i" />],
  ["formulas", "Formula & BOM", PERMISSIONS.ENTERPRISE_FORMULA_VIEW, "ENTERPRISE_FORMULA_BOM_ENABLED", <FlaskConical size={17} key="i" />],
  ["batches", "Batches", PERMISSIONS.ENTERPRISE_BATCH_VIEW, "ENTERPRISE_BATCH_ENABLED", <Layers3 size={17} key="i" />],
  ["quality", "Quality", PERMISSIONS.ENTERPRISE_QUALITY_VIEW, "ENTERPRISE_QUALITY_ENABLED", <ShieldCheck size={17} key="i" />],
  ["warehouses", "Warehouses", PERMISSIONS.ENTERPRISE_WAREHOUSE_VIEW, "ENTERPRISE_WAREHOUSE_ENABLED", <Warehouse size={17} key="i" />],
  ["planning", "Planning", PERMISSIONS.ENTERPRISE_PLANNING_VIEW, "ENTERPRISE_PLANNING_ENABLED", <CalendarRange size={17} key="i" />],
  ["reports", "Reports", PERMISSIONS.ENTERPRISE_REPORTING_VIEW, "ENTERPRISE_REPORTING_ENABLED", <BarChart3 size={17} key="i" />],
] as const;

const brand = (
  <div className="border-b border-white/10 p-6">
    <span className="font-semibold text-white">MUV Enterprise Operations</span>
  </div>
);

export default async function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  // Stage 1 (Authentication and Role-Aware Entry): getSalesPrincipal()
  // throws (Unauthorized/Forbidden) rather than returning — previously
  // uncaught here, so an unauthenticated visit (or an authenticated user
  // whose sales access has gone inactive) surfaced as a raw uncaught
  // error/500 instead of the same graceful redirect `/dashboard` and
  // `/sales` already give. Middleware now also gates `/enterprise` for
  // unauthenticated requests (a fast-path only), but this direct,
  // server-side check is the actual boundary and must degrade
  // gracefully on its own regardless of middleware.
  const principal = await getSalesPrincipal().catch((err) => {
    if (err instanceof UnauthorizedError) redirect("/login?callbackUrl=/enterprise");
    redirect("/access-denied");
  });
  const flags = await prisma.aiConfiguration.findMany({ where: { organizationKey: "MUV", category: "FEATURE_FLAG", active: true }, select: { key: true, value: true } });
  const enabled = new Set(flags.filter((row) => Boolean((row.value as { enabled?: boolean }).enabled)).map((row) => row.key));
  const operationsEnabled = enabled.has("ENTERPRISE_OPERATIONS_ENABLED");
  const visible = operationsEnabled ? modules.filter(([, , permission, feature]) =>
    enabled.has(feature) && (principal.isFounder || principal.permissions.has(permission))) : [];
  const navItems: ShellNavItem[] = visible.map(([slug, label, , , icon]) => ({ href: `/enterprise/${slug}`, label, icon }));

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="bg-zinc-950 min-h-screen text-white">
      <EnterpriseShell
        variant="ops"
        brand={brand}
        homeHref="/enterprise"
        homeLabel="Enterprise"
        navItems={navItems}
        // Stage 3 (Route Integrity): "/sales" has never had its own
        // page.tsx (only subpaths like /sales/inquiries do) — this link
        // predates Stage 2's shell migration and was carried over as-is.
        // /dashboard is the real working route (redirects to the user's
        // own role dashboard) and is what "Dashboard" already means
        // throughout the rest of the sales navigation.
        crossLink={{ href: "/dashboard", label: "Sales Architecture" }}
        user={{ name: principal.name, email: principal.email ?? "", roleLabel: principal.salesRole.name }}
        logoutAction={logoutAction}
      >
        {operationsEnabled ? children : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-6">
            <h1 className="text-xl font-semibold">Enterprise Operations is disabled</h1>
            <p className="mt-2 text-sm text-zinc-400">Enable it through governed organization configuration before rollout.</p>
          </div>
        )}
      </EnterpriseShell>
    </div>
  );
}
