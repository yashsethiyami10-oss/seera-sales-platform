export const PHASE_1_ROLE_CODES = [
  "FOUNDER_SUPER_ADMIN",
  "COMPANY_ADMIN",
  "ACCOUNTS_MANAGER",
  "ACCOUNTS_EXECUTIVE",
  "SALES_HEAD",
  "SALES_MANAGER",
  "SALES_EXECUTIVE",
  "SUPER_STOCKIST_OWNER",
  "SUPER_STOCKIST_OPERATOR",
  "DISTRIBUTOR_OWNER",
  "DISTRIBUTOR_OPERATOR",
  "DISTRIBUTOR_DELIVERY_USER",
  "RETAILER_USER",
  "READ_ONLY_AUDITOR",
] as const;

export const PHASE_1_PERMISSION_NAMESPACES = [
  "identity",
  "rbac",
  "audit",
  "settings",
  "feature_flags",
  "files",
  "notifications",
  "system",
] as const;

export type Phase1RoleCode = (typeof PHASE_1_ROLE_CODES)[number];
export type Phase1PermissionNamespace = (typeof PHASE_1_PERMISSION_NAMESPACES)[number];
