import { SalesDashboard } from "@/components/sales/dashboard";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_ASSIGNED);
  return <SalesDashboard title="My sales workspace" subtitle="Assigned customers, leads, quotations, and follow-ups." />;
}
