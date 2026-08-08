import type { PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, type EnterprisePrincipal } from "@/lib/enterprise/context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3C — Enterprise Finance Platform.
 * Reuses Module 3A's `requireEnterprisePrincipal` unchanged: it already
 * enforces the base `ENTERPRISE_OPERATIONS_ENABLED` flag, the specific
 * feature flag passed here, and Founder-or-permission authorization. No
 * new authorization primitive is introduced.
 */
export const FINANCE_FLAG = "ENTERPRISE_FINANCE_ENABLED";
export const FINANCIAL_POSTING_FLAG = "ENTERPRISE_FINANCIAL_POSTING_ENABLED";
export const BANKING_RECONCILIATION_FLAG = "ENTERPRISE_BANKING_RECONCILIATION_ENABLED";
export const FINANCIAL_REPORTING_FLAG = "ENTERPRISE_FINANCIAL_REPORTING_ENABLED";
export const FINANCE_AI_ADAPTER_FLAG = "ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED";

export function requireFinancePrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, FINANCE_FLAG);
}

export function requireFinancialPostingPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, FINANCIAL_POSTING_FLAG);
}

export function requireBankingPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, BANKING_RECONCILIATION_FLAG);
}

export function requireFinancialReportingPrincipal(permission: PermissionKey): Promise<EnterprisePrincipal> {
  return requireEnterprisePrincipal(permission, FINANCIAL_REPORTING_FLAG);
}
