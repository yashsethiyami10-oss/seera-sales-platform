export const PHASE_1_ROLES = [
  ["FOUNDER_SUPER_ADMIN", "Founder / Super Admin"],
  ["COMPANY_ADMIN", "Company Admin"],
  ["ACCOUNTS_MANAGER", "Accounts Manager"],
  ["ACCOUNTS_EXECUTIVE", "Accounts Executive"],
  ["SALES_HEAD", "Sales Head"],
  ["SALES_MANAGER", "Sales Manager"],
  ["SALES_EXECUTIVE", "Sales Executive"],
  ["SUPER_STOCKIST_OWNER", "Super Stockist Owner"],
  ["SUPER_STOCKIST_OPERATOR", "Super Stockist Operator"],
  ["DISTRIBUTOR_OWNER", "Distributor Owner"],
  ["DISTRIBUTOR_OPERATOR", "Distributor Operator"],
  ["DISTRIBUTOR_DELIVERY_USER", "Distributor Delivery User"],
  ["RETAILER_USER", "Retailer User"],
  ["READ_ONLY_AUDITOR", "Read-only Auditor"],
] as const;

export const PHASE_1_ROLE_CODES = PHASE_1_ROLES.map(([code]) => code);

export const PHASE_1_PERMISSIONS = [
  "system:super_admin", "user:view", "user:create", "user:update", "user:disable", "user:suspend",
  "user:reactivate", "role:view", "role:assign", "role:remove", "permission:view", "audit:view",
  "settings:view", "settings:manage", "feature_flags:view", "feature_flags:manage",
  "notifications:view", "notifications:manage", "files:view", "files:manage", "portal:admin",
  "portal:accounts", "portal:sales_manager", "portal:sales_executive", "portal:distributor",
  "portal:super_stockist", "portal:retailer", "session:revoke_self", "session:revoke_user",
  "session:revoke_all_user",
  "master:manage", "network:manage", "credit:manage", "approval:decide",
  "field_day:manage_self", "retailer:visit", "retailer:order", "collection:create",
  "prospect:create", "joint_work:participate", "field_reports:view_self",
  "distributor_orders:view", "distributor_orders:fulfil", "distributor_inventory:view",
  "distributor_inventory:adjust", "distributor_inventory:reconcile", "distributor_replenishment:create",
  "distributor_credit:view", "distributor_claims:manage", "distributor_delivery:execute",
  "super_stockist_orders:view", "super_stockist_orders:fulfil", "super_stockist_inventory:view",
  "super_stockist_inventory:adjust", "super_stockist_inventory:reconcile", "company_replenishment:create",
  "payment_proof:create", "payment_proof:review", "partner_credit:enforce",
  "assisted_distributor:operate", "payment_promise:create", "manager_field:operate",
] as const;

export const PHASE_1_PERMISSION_NAMESPACES = [...new Set(PHASE_1_PERMISSIONS.map((code) => code.split(":")[0]))] as readonly string[];

export type Phase1RoleCode = (typeof PHASE_1_ROLES)[number][0];
export type Phase1Permission = (typeof PHASE_1_PERMISSIONS)[number];

const common = ["notifications:view", "files:view", "session:revoke_self"] as const;
export const ROLE_PERMISSION_MATRIX: Record<Phase1RoleCode, readonly Phase1Permission[]> = {
  FOUNDER_SUPER_ADMIN: PHASE_1_PERMISSIONS,
  COMPANY_ADMIN: ["portal:admin", "user:view", "user:create", "user:update", "user:disable", "user:suspend", "user:reactivate", "role:view", "role:assign", "role:remove", "permission:view", "audit:view", "settings:view", "settings:manage", "feature_flags:view", "feature_flags:manage", "notifications:view", "notifications:manage", "files:view", "files:manage", "session:revoke_self", "session:revoke_user", "session:revoke_all_user"],
  ACCOUNTS_MANAGER: ["portal:accounts", "settings:view", ...common],
  ACCOUNTS_EXECUTIVE: ["portal:accounts", ...common],
  SALES_HEAD: ["portal:sales_manager", "user:view", "master:manage", "network:manage", "credit:manage", "approval:decide", "field_reports:view_self", ...common],
  SALES_MANAGER: ["portal:sales_manager", "network:manage", "approval:decide", "joint_work:participate", "prospect:create", "manager_field:operate", "assisted_distributor:operate", "payment_promise:create", "field_reports:view_self", ...common],
  SALES_EXECUTIVE: ["portal:sales_executive", "field_day:manage_self", "retailer:visit", "retailer:order", "collection:create", "prospect:create", "joint_work:participate", "field_reports:view_self", ...common],
  SUPER_STOCKIST_OWNER: ["portal:super_stockist", "super_stockist_orders:view", "super_stockist_orders:fulfil", "super_stockist_inventory:view", "super_stockist_inventory:adjust", "super_stockist_inventory:reconcile", "company_replenishment:create", "payment_proof:create", "partner_credit:enforce", "payment_promise:create", "distributor_claims:manage", ...common],
  SUPER_STOCKIST_OPERATOR: ["portal:super_stockist", "super_stockist_orders:view", "super_stockist_orders:fulfil", "super_stockist_inventory:view", "company_replenishment:create", "payment_proof:create", "partner_credit:enforce", ...common],
  DISTRIBUTOR_OWNER: ["portal:distributor", "distributor_orders:view", "distributor_orders:fulfil", "distributor_inventory:view", "distributor_inventory:adjust", "distributor_inventory:reconcile", "distributor_replenishment:create", "distributor_credit:view", "distributor_claims:manage", ...common],
  DISTRIBUTOR_OPERATOR: ["portal:distributor", "distributor_orders:view", "distributor_orders:fulfil", "distributor_inventory:view", "distributor_replenishment:create", "distributor_credit:view", "distributor_claims:manage", ...common],
  DISTRIBUTOR_DELIVERY_USER: ["portal:distributor", "distributor_delivery:execute", "notifications:view", "session:revoke_self"],
  RETAILER_USER: ["portal:retailer", ...common],
  READ_ONLY_AUDITOR: ["audit:view", "settings:view", "feature_flags:view", "role:view", "permission:view", "user:view", "notifications:view", "files:view", "session:revoke_self"],
};

export const PHASE_1_FEATURE_FLAGS = ["portal.accounts.enabled", "portal.sales_manager.enabled", "portal.sales_executive.enabled", "portal.distributor.enabled", "portal.super_stockist.enabled", "portal.retailer.enabled"] as const;
