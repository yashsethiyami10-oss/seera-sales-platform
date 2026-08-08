import type { PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, type EnterprisePrincipal } from "@/lib/enterprise/context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Founder Operating
 * System. Reuses `requireEnterprisePrincipal` unchanged, exactly like every
 * Finance/Network Partner context helper before it — no new authorization
 * primitive is introduced. `ENTERPRISE_FOUNDER_OS_ENABLED` was already
 * registered in `PHASE2_FEATURE_FLAGS` and seeded (disabled) well before
 * this Stage existed; it was reserved for this purpose and is used as-is.
 */
export const FOUNDER_OS_FLAG = "ENTERPRISE_FOUNDER_OS_ENABLED";

export function requireFounderOsPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, FOUNDER_OS_FLAG);
}
