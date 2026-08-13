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
  "company_replenishment:dispatch", "distributor_credit:manage", "partner_credit:override",
  "payment_proof:create", "payment_proof:review", "partner_credit:enforce",
  "assisted_distributor:operate", "payment_promise:create", "manager_field:operate",
  "billing_profile:manage", "document:create", "document:issue", "document:upload", "document:view_scoped", "document:share", "document:cancel",
  "manager_team:view", "manager_instruction:manage", "manager_approval:decide", "manager_location:view_working",
  "finance_dashboard:view", "payment:review", "payment:allocate", "ledger:view", "ledger:post", "ledger:reverse", "credit_extension:request", "credit_extension:approve", "reconciliation:manage", "claim_settlement:manage", "accounting_period:lock",
  "travel_policy:manage", "ta_claim:create", "ta_claim:verify", "ta_claim:approve", "ta_claim:view_self", "partner_lifecycle:manage", "partner_lifecycle:force_close",
  "coa:manage", "treasury_account:manage", "journal:post", "journal:reverse", "gl:view", "money_in:record", "money_out:record",
  "vendor:manage", "vendor_bill:manage", "vendor_payment:record", "expense:create", "expense:approve", "expense:post",
  "budget:manage", "loan:manage", "asset:manage", "bank_statement:import", "finance_approval_policy:manage", "financial_statements:view",
] as const;

export const PHASE_1_PERMISSION_NAMESPACES = [...new Set(PHASE_1_PERMISSIONS.map((code) => code.split(":")[0]))] as readonly string[];

export type Phase1RoleCode = (typeof PHASE_1_ROLES)[number][0];
export type Phase1Permission = (typeof PHASE_1_PERMISSIONS)[number];

const common = ["notifications:view", "files:view", "session:revoke_self"] as const;
export const ROLE_PERMISSION_MATRIX: Record<Phase1RoleCode, readonly Phase1Permission[]> = {
  FOUNDER_SUPER_ADMIN: PHASE_1_PERMISSIONS,
  COMPANY_ADMIN: ["portal:admin", "user:view", "user:create", "user:update", "user:disable", "user:suspend", "user:reactivate", "role:view", "role:assign", "role:remove", "permission:view", "audit:view", "settings:view", "settings:manage", "feature_flags:view", "feature_flags:manage", "notifications:view", "notifications:manage", "files:view", "files:manage", "session:revoke_self", "session:revoke_user", "session:revoke_all_user"],
  ACCOUNTS_MANAGER: ["portal:accounts", "settings:view", "billing_profile:manage", "document:create", "document:issue", "document:upload", "document:view_scoped", "document:share", "document:cancel", "finance_dashboard:view", "payment:review", "payment:allocate", "payment_proof:review", "company_replenishment:dispatch", "ledger:view", "ledger:post", "ledger:reverse", "credit_extension:approve", "reconciliation:manage", "claim_settlement:manage", "accounting_period:lock", "ta_claim:approve", "coa:manage", "treasury_account:manage", "journal:post", "journal:reverse", "gl:view", "money_in:record", "money_out:record", "vendor:manage", "vendor_bill:manage", "vendor_payment:record", "expense:create", "expense:approve", "expense:post", "budget:manage", "loan:manage", "asset:manage", "bank_statement:import", "finance_approval_policy:manage", "financial_statements:view", ...common],
  ACCOUNTS_EXECUTIVE: ["portal:accounts", "document:create", "document:upload", "document:view_scoped", "finance_dashboard:view", "payment:review", "payment:allocate", "payment_proof:review", "ledger:view", "reconciliation:manage", "treasury_account:manage", "gl:view", "money_in:record", "money_out:record", "vendor:manage", "vendor_bill:manage", "vendor_payment:record", "expense:create", "expense:post", "loan:manage", "asset:manage", "bank_statement:import", "financial_statements:view", ...common],
  SALES_HEAD: ["portal:sales_manager", "user:view", "master:manage", "network:manage", "credit:manage", "approval:decide", "field_reports:view_self", ...common],
  SALES_MANAGER: ["portal:sales_manager", "network:manage", "approval:decide", "joint_work:participate", "prospect:create", "manager_field:operate", "assisted_distributor:operate", "payment_promise:create", "field_reports:view_self", "manager_team:view", "manager_instruction:manage", "manager_approval:decide", "manager_location:view_working", "document:view_scoped", "ta_claim:create", "ta_claim:verify", "ta_claim:view_self", "retailer:order", "retailer:visit", ...common],
  SALES_EXECUTIVE: ["portal:sales_executive", "field_day:manage_self", "retailer:visit", "retailer:order", "collection:create", "prospect:create", "joint_work:participate", "field_reports:view_self", "ta_claim:create", "ta_claim:view_self", ...common],
  SUPER_STOCKIST_OWNER: ["portal:super_stockist", "super_stockist_orders:view", "super_stockist_orders:fulfil", "super_stockist_inventory:view", "super_stockist_inventory:adjust", "super_stockist_inventory:reconcile", "company_replenishment:create", "payment_proof:create", "partner_credit:enforce", "partner_credit:override", "distributor_credit:manage", "payment_promise:create", "credit_extension:request", "distributor_claims:manage", "document:create", "document:issue", "document:upload", "document:view_scoped", "document:share", "ledger:view", ...common],
  SUPER_STOCKIST_OPERATOR: ["portal:super_stockist", "super_stockist_orders:view", "super_stockist_orders:fulfil", "super_stockist_inventory:view", "company_replenishment:create", "payment_proof:create", "partner_credit:enforce", ...common],
  DISTRIBUTOR_OWNER: ["portal:distributor", "distributor_orders:view", "distributor_orders:fulfil", "distributor_inventory:view", "distributor_inventory:adjust", "distributor_inventory:reconcile", "distributor_replenishment:create", "distributor_credit:view", "distributor_claims:manage", "payment_proof:create", "document:create", "document:issue", "document:upload", "document:view_scoped", "document:share", "ledger:view", ...common],
  DISTRIBUTOR_OPERATOR: ["portal:distributor", "distributor_orders:view", "distributor_orders:fulfil", "distributor_inventory:view", "distributor_replenishment:create", "distributor_credit:view", "distributor_claims:manage", "payment_proof:create", ...common],
  DISTRIBUTOR_DELIVERY_USER: ["portal:distributor", "distributor_delivery:execute", "notifications:view", "session:revoke_self"],
  RETAILER_USER: ["portal:retailer", ...common],
  READ_ONLY_AUDITOR: ["audit:view", "settings:view", "feature_flags:view", "role:view", "permission:view", "user:view", "notifications:view", "files:view", "session:revoke_self"],
};

export const PHASE_1_FEATURE_FLAGS = ["portal.accounts.enabled", "portal.sales_manager.enabled", "portal.sales_executive.enabled", "portal.distributor.enabled", "portal.super_stockist.enabled", "portal.retailer.enabled"] as const;
