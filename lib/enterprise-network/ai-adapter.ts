import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";
import { getNetworkPerformanceReport } from "./integration-service";

export const NETWORK_AI_ASSISTANTS = [
  "PARTNER_NETWORK_ASSISTANT",
  "CHANNEL_PERFORMANCE_ASSISTANT",
  "PARTNER_COMPLIANCE_ASSISTANT",
] as const;

export async function prepareNetworkAdvisoryContext(input: unknown) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_ANALYTICS_VIEW);
  const report = await getNetworkPerformanceReport(input);
  return {
    organizationKey: principal.organizationKey,
    advisoryOnly: true,
    mutationAllowed: false,
    businessServiceRequired: true,
    report,
  };
}

