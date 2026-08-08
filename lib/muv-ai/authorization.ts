import { getSalesPrincipal } from "@/lib/sales/authorization";
import type { AiPrincipal } from "./types";

export async function getAiPrincipal(): Promise<AiPrincipal> {
  const principal = await getSalesPrincipal();
  return { id: principal.id, email: principal.email, roleName: principal.salesRole.name, permissions: principal.permissions, isFounder: principal.isFounder, territoryId: principal.territoryId, organizationKey: "MUV" };
}
