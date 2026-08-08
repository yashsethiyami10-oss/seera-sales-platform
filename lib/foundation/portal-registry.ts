export const SEERA_PORTALS = {
  "founder-admin": {
    title: "Founder / Super Admin",
    requiredPermission: "portal.founder.access",
  },
  "company-admin": {
    title: "Company Admin",
    requiredPermission: "portal.company_admin.access",
  },
  accounts: {
    title: "Accounts",
    requiredPermission: "portal.accounts.access",
  },
  "sales-manager": {
    title: "Sales Manager",
    requiredPermission: "portal.sales_manager.access",
  },
  "sales-executive": {
    title: "Sales Executive",
    requiredPermission: "portal.sales_executive.access",
  },
  distributor: {
    title: "Distributor",
    requiredPermission: "portal.distributor.access",
  },
  "super-stockist": {
    title: "Super Stockist",
    requiredPermission: "portal.super_stockist.access",
  },
} as const;

export type SeeraPortalKey = keyof typeof SEERA_PORTALS;

export function isSeeraPortalKey(value: string): value is SeeraPortalKey {
  return Object.prototype.hasOwnProperty.call(SEERA_PORTALS, value);
}

