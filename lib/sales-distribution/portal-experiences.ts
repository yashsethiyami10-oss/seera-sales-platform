export const PORTAL_EXPERIENCES = {
  "founder-admin": { navigation: ["Control Center", "Masters", "Network", "Approvals", "Audit"], dashboard: "Company control and governed master data", terminology: "Company network" },
  "sales-manager": { navigation: ["Team Fieldwork", "Joint Working", "Partner Development", "Approvals", "Assisted Operations"], dashboard: "Team field operations", terminology: "Team achievement" },
  "sales-executive": { navigation: ["Today", "Beat Roadmap", "Retailers", "Orders", "DSR"], dashboard: "My delivered achievement and today's route", terminology: "My field day" },
  distributor: { navigation: ["Order Inbox", "Deliveries", "Inventory", "Replenishment", "Credit & Claims"], dashboard: "My distributor business", terminology: "Retailer fulfilment" },
  "super-stockist": { navigation: ["Distributor Orders", "Dispatch", "Inventory", "Credit", "Company Orders"], dashboard: "My super-stockist network", terminology: "Distributor supply" },
} as const;
export type OperationalPortal = keyof typeof PORTAL_EXPERIENCES;
export function experienceFor(portal: OperationalPortal) { return PORTAL_EXPERIENCES[portal]; }
