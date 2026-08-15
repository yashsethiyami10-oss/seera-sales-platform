export const SEERA_PORTALS = {
  "founder-admin": {
    title: "Founder / Super Admin",
    requiredPermission: "portal:admin",
    featureFlag: undefined,
  },
  "company-admin": {
    title: "Company Admin",
    requiredPermission: "portal:admin",
    featureFlag: undefined,
  },
  accounts: {
    title: "Accounts",
    requiredPermission: "portal:accounts",
    featureFlag: "portal.accounts.enabled",
  },
  "sales-manager": {
    title: "Sales Manager",
    requiredPermission: "portal:sales_manager",
    featureFlag: "portal.sales_manager.enabled",
  },
  "sales-executive": {
    title: "Sales Executive",
    requiredPermission: "portal:sales_executive",
    featureFlag: "portal.sales_executive.enabled",
  },
  distributor: {
    title: "Distributor",
    requiredPermission: "portal:distributor",
    featureFlag: "portal.distributor.enabled",
  },
  "super-stockist": {
    title: "Super Stockist",
    requiredPermission: "portal:super_stockist",
    featureFlag: "portal.super_stockist.enabled",
  },
  retailer: {
    title: "Retailer",
    requiredPermission: "portal:retailer",
    featureFlag: "portal.retailer.enabled",
  },
  manufacturing: {
    title: "Manufacturing",
    requiredPermission: "portal:manufacturing",
    featureFlag: "portal.manufacturing.enabled",
  },
} as const;

export type SeeraPortalKey = keyof typeof SEERA_PORTALS;

export function isSeeraPortalKey(value: string): value is SeeraPortalKey {
  return Object.prototype.hasOwnProperty.call(SEERA_PORTALS, value);
}
