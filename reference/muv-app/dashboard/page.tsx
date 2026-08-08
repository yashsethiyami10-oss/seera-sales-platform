import { redirect } from "next/navigation";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { ROLE_DASHBOARD } from "@/lib/sales/constants";

export default async function DashboardIndex() {
  const principal = await getSalesPrincipal();
  redirect(ROLE_DASHBOARD[principal.salesRole.name] ?? "/");
}
