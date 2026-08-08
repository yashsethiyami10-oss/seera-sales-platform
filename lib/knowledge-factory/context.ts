import type { PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, type EnterprisePrincipal } from "@/lib/enterprise/context";

/**
 * MUV Intelligence Factory V4 — Knowledge Factory module. Reuses Part 3A's
 * requireEnterprisePrincipal unchanged (base ENTERPRISE_OPERATIONS_ENABLED
 * flag + this module's own feature flag + Founder-or-permission
 * authorization) — same pattern as every other Enterprise v3 domain
 * (Finance, Support). No new authorization primitive introduced.
 */
export const KNOWLEDGE_FACTORY_FLAG = "ENTERPRISE_KNOWLEDGE_FACTORY_ENABLED";

export function requireKnowledgeFactoryPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, KNOWLEDGE_FACTORY_FLAG);
}
