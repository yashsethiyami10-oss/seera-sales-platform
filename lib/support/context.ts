import type { PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, type EnterprisePrincipal } from "@/lib/enterprise/context";

/**
 * Milestone 9 — Customer Support. Reuses Part 3A's requireEnterprisePrincipal
 * unchanged (base ENTERPRISE_OPERATIONS_ENABLED flag + this module's own
 * feature flag + Founder-or-permission authorization) — no new authorization
 * primitive, same pattern lib/enterprise-finance/context.ts already uses.
 */
export const SUPPORT_FLAG = "ENTERPRISE_SUPPORT_ENABLED";

export function requireSupportPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, SUPPORT_FLAG);
}
