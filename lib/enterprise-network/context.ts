import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, requireOrganization, type EnterprisePrincipal } from "@/lib/enterprise/context";
import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const NETWORK_FLAG = "ENTERPRISE_BUSINESS_NETWORK_ENABLED";
export const PORTAL_FLAG = "ENTERPRISE_PARTNER_PORTAL_ENABLED";

export function requireNetworkOrganization(principal: EnterprisePrincipal, organizationKey: string) {
  requireOrganization(principal, organizationKey);
}

export function requireNetworkPrincipal(permission: PermissionKey) {
  return requireEnterprisePrincipal(permission, NETWORK_FLAG);
}

export function requirePortalAdminPrincipal() {
  return requireEnterprisePrincipal(PERMISSIONS.NETWORK_PARTNER_PORTAL_ADMIN, PORTAL_FLAG);
}

export async function requirePortalPrincipal(userId: string) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW, PORTAL_FLAG);
  const mapping = await prisma.networkPartnerUser.findFirst({
    where: { organizationKey: principal.organizationKey, userId, status: "ACTIVE" },
    include: { partner: true },
  });
  if (!mapping || mapping.partner.lifecycleStatus !== "ACTIVE") {
    throw new ForbiddenError("Active partner portal mapping is required");
  }
  if (!Array.isArray(mapping.permissions)) throw new ForbiddenError("Partner portal permissions are invalid");
  return { principal, mapping };
}
