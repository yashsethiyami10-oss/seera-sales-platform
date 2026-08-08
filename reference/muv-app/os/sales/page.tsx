import { getSalesPrincipal } from "@/lib/sales/authorization";
import { SALES_ROLES } from "@/lib/sales/constants";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getFounderDashboard, getSalesManagerDashboard, getSalesOfficerDashboard } from "@/actions/inst-dashboards";
import { FounderDashboardView } from "@/components/os-sales/dashboards/FounderDashboardView";
import { ManagerDashboardView } from "@/components/os-sales/dashboards/ManagerDashboardView";
import { OfficerDashboardView } from "@/components/os-sales/dashboards/OfficerDashboardView";

/**
 * Milestone 3 — Institutional Sales OS, Module 1. One route that renders
 * the role-appropriate dashboard rather than three separate routes: the
 * role itself already determines the view (see lib/sales/authorization.ts's
 * SalesRole), so a Founder and a Sales Officer visiting the same
 * `/os/sales` URL each see their own dashboard without needing to know
 * which one to navigate to.
 */
export default async function SalesDashboardPage() {
  const principal = await getSalesPrincipal();
  const isManager = !principal.isFounder && principal.salesRole.name === SALES_ROLES.SALES_MANAGER;

  if (principal.isFounder) {
    const result = await getFounderDashboard();
    return (
      <Workspace>
        <PageHeader title="Institutional Sales — Founder Dashboard" description="Pipeline, revenue, team, and territory performance across the whole desk." />
        <div className="px-6 pb-10">{result.success ? <FounderDashboardView data={result.data} /> : <p className="text-sm" style={{ color: "#ef4444" }}>{result.error.message}</p>}</div>
      </Workspace>
    );
  }

  if (isManager) {
    const result = await getSalesManagerDashboard();
    return (
      <Workspace>
        <PageHeader title="Institutional Sales — Sales Manager Dashboard" description="Team activity, today's visits, pending approvals, and targets." />
        <div className="px-6 pb-10">{result.success ? <ManagerDashboardView data={result.data} /> : <p className="text-sm" style={{ color: "#ef4444" }}>{result.error.message}</p>}</div>
      </Workspace>
    );
  }

  const result = await getSalesOfficerDashboard();
  return (
    <Workspace>
      <PageHeader title="Institutional Sales — My Dashboard" description="Today's plan, visits, follow-ups, tasks, and samples." />
      <div className="px-6 pb-10">{result.success ? <OfficerDashboardView data={result.data} /> : <p className="text-sm" style={{ color: "#ef4444" }}>{result.error.message}</p>}</div>
    </Workspace>
  );
}
