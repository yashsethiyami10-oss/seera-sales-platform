import { SalesDashboard } from "@/components/sales/dashboard";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_TEAM);
  return <SalesDashboard title="Team dashboard" subtitle="Pipeline, assignments, follow-ups, and team performance." />;
}
