import { SalesDashboard } from "@/components/sales/dashboard";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_INSTITUTIONAL);
  return <SalesDashboard institutionalOnly title="Institutional sales" subtitle="Institutional accounts and long-cycle opportunities only." />;
}
