import { SalesDashboard } from "@/components/sales/dashboard";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_SUPPORT);
  return <SalesDashboard supportOnly title="Customer support" subtitle="Assigned cases, customer context, and escalations." />;
}
