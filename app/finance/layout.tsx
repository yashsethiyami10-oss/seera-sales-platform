import { redirect } from "next/navigation";
import { BookOpen, Receipt, FileText, Wallet } from "lucide-react";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/errors";
import { signOut } from "@/lib/auth";
import { EnterpriseShell, type ShellNavItem } from "@/components/enterprise-shell/EnterpriseShell";
import { FINANCE_FLAG } from "@/lib/enterprise-finance/context";

const modules = [
  ["journals", "Journals", PERMISSIONS.FINANCE_MASTERS_VIEW, <BookOpen size={17} key="i" />],
  ["receivables", "Receivables", PERMISSIONS.FINANCE_RECEIVABLES_VIEW, <FileText size={17} key="i" />],
  ["payables", "Payables", PERMISSIONS.FINANCE_PAYABLES_VIEW, <Receipt size={17} key="i" />],
  ["expenses", "Expense Claims", PERMISSIONS.FINANCE_EXPENSES_MANAGE, <Wallet size={17} key="i" />],
] as const;

const brand = (
  <div className="border-b border-white/10 p-6">
    <span className="font-semibold text-white">MUV Enterprise Finance</span>
  </div>
);

/**
 * Enterprise UI Integration — Enterprise Finance UI. Same shape as
 * app/enterprise/layout.tsx and app/network/layout.tsx: gate on the base
 * ENTERPRISE_FINANCE_ENABLED flag here; each module's own list function
 * additionally enforces its own specific permission (all four already do,
 * per lib/enterprise-finance/*-service.ts) — Reporting/Banking's own
 * additional flags (ENTERPRISE_FINANCIAL_REPORTING_ENABLED /
 * ENTERPRISE_BANKING_RECONCILIATION_ENABLED) are out of scope for this
 * pass (no page built for them yet), so not checked here.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const principal = await getSalesPrincipal().catch((err) => {
    if (err instanceof UnauthorizedError) redirect("/login?callbackUrl=/finance");
    redirect("/access-denied");
  });
  // Independent audit finding (same as app/network/layout.tsx): the
  // service layer always checks both ENTERPRISE_OPERATIONS_ENABLED and
  // FINANCE_FLAG — check both here too, so a base-flag-off misconfiguration
  // shows this layout's graceful disabled panel instead of an error.
  const flags = await prisma.aiConfiguration.findMany({
    where: { organizationKey: "MUV", key: { in: ["ENTERPRISE_OPERATIONS_ENABLED", FINANCE_FLAG] }, category: "FEATURE_FLAG" },
  });
  const enabledFlags = new Set(flags.filter((f) => Boolean((f.value as { enabled?: boolean }).enabled)).map((f) => f.key));
  const financeEnabled = enabledFlags.has("ENTERPRISE_OPERATIONS_ENABLED") && enabledFlags.has(FINANCE_FLAG);
  const visible = financeEnabled ? modules.filter(([, , permission]) => principal.isFounder || principal.permissions.has(permission)) : [];
  const navItems: ShellNavItem[] = visible.map(([slug, label, , icon]) => ({ href: `/finance/${slug}`, label, icon }));

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="bg-zinc-950 min-h-screen text-white">
      <EnterpriseShell
        variant="ops"
        brand={brand}
        homeHref="/finance"
        homeLabel="Finance"
        navItems={navItems}
        crossLink={{ href: "/dashboard", label: "Sales Architecture" }}
        user={{ name: principal.name, email: principal.email ?? "", roleLabel: principal.salesRole.name }}
        logoutAction={logoutAction}
      >
        {financeEnabled ? children : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-6">
            <h1 className="text-xl font-semibold">Enterprise Finance is disabled</h1>
            <p className="mt-2 text-sm text-zinc-400">Enable ENTERPRISE_FINANCE_ENABLED through governed organization configuration before rollout.</p>
          </div>
        )}
      </EnterpriseShell>
    </div>
  );
}
