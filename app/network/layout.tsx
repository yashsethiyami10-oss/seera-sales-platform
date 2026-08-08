import { redirect } from "next/navigation";
import { Building2, FileText, Receipt, Headphones } from "lucide-react";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/errors";
import { signOut } from "@/lib/auth";
import { EnterpriseShell, type ShellNavItem } from "@/components/enterprise-shell/EnterpriseShell";
import { NETWORK_FLAG } from "@/lib/enterprise-network/context";

const modules = [
  ["partners", "Partners", PERMISSIONS.NETWORK_PARTNERS_VIEW, <Building2 size={17} key="i" />],
  ["agreements", "Agreements", PERMISSIONS.NETWORK_AGREEMENTS_MANAGE, <FileText size={17} key="i" />],
  ["claims", "Claims", PERMISSIONS.NETWORK_CLAIMS_MANAGE, <Receipt size={17} key="i" />],
  ["support", "Support Cases", PERMISSIONS.NETWORK_PARTNERS_MANAGE, <Headphones size={17} key="i" />],
] as const;

const brand = (
  <div className="border-b border-white/10 p-6">
    <span className="font-semibold text-white">MUV Business Network</span>
  </div>
);

/**
 * Enterprise UI Integration — Business Network UI. Same shape as
 * app/enterprise/layout.tsx: catch getSalesPrincipal() gracefully (an
 * uncaught throw here would surface as a raw error page, same class of
 * bug Stage 1 fixed for /enterprise), gate on ENTERPRISE_BUSINESS_NETWORK_
 * ENABLED (seeded off), and only list modules the principal actually has
 * a permission for.
 */
export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  const principal = await getSalesPrincipal().catch((err) => {
    if (err instanceof UnauthorizedError) redirect("/login?callbackUrl=/network");
    redirect("/access-denied");
  });
  // Independent audit finding: the underlying service layer
  // (requireNetworkPrincipal -> requireEnterprisePrincipal) always checks
  // BOTH ENTERPRISE_OPERATIONS_ENABLED and NETWORK_FLAG — checking only
  // NETWORK_FLAG here meant a base-flag-off/network-flag-on
  // misconfiguration would render children (thinking Network was "on")
  // only for every page/service call inside to then throw, instead of
  // showing this layout's own graceful disabled panel.
  const flags = await prisma.aiConfiguration.findMany({
    where: { organizationKey: "MUV", key: { in: ["ENTERPRISE_OPERATIONS_ENABLED", NETWORK_FLAG] }, category: "FEATURE_FLAG" },
  });
  const enabledFlags = new Set(flags.filter((f) => Boolean((f.value as { enabled?: boolean }).enabled)).map((f) => f.key));
  const networkEnabled = enabledFlags.has("ENTERPRISE_OPERATIONS_ENABLED") && enabledFlags.has(NETWORK_FLAG);
  const visible = networkEnabled ? modules.filter(([, , permission]) => principal.isFounder || principal.permissions.has(permission)) : [];
  const navItems: ShellNavItem[] = visible.map(([slug, label, , icon]) => ({ href: `/network/${slug}`, label, icon }));

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="bg-zinc-950 min-h-screen text-white">
      <EnterpriseShell
        variant="ops"
        brand={brand}
        homeHref="/network"
        homeLabel="Network"
        navItems={navItems}
        crossLink={{ href: "/dashboard", label: "Sales Architecture" }}
        user={{ name: principal.name, email: principal.email ?? "", roleLabel: principal.salesRole.name }}
        logoutAction={logoutAction}
      >
        {networkEnabled ? children : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-6">
            <h1 className="text-xl font-semibold">Business Network is disabled</h1>
            <p className="mt-2 text-sm text-zinc-400">Enable ENTERPRISE_BUSINESS_NETWORK_ENABLED through governed organization configuration before rollout.</p>
          </div>
        )}
      </EnterpriseShell>
    </div>
  );
}
