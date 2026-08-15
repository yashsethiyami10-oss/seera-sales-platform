import type { PrismaClient } from "@prisma/client";

// P0 fix (Founder UAT): a user with a single SALES_MANAGER role landed in /portal/accounts after
// a second role was assigned. The defect this function had: it picked a landing portal by scanning
// the *unioned* permission set
// in a fixed, hardcoded precedence order, so ANY user holding two roles whose permission arrays
// contain different portal:* values would always land on whichever portal happened to be checked
// first here — never a reflection of which role is actually "primary" for that person. The header
// role badge (app/portal/[portal]/layout.tsx) already has a well-defined "primary role" concept:
// the OLDEST active UserRoleAssignment. This function now takes that SAME primary role's code
// (not a permission Set) so the login redirect, the root redirect and the header badge can never
// disagree.
const ROLE_TO_PORTAL: Record<string, string> = {
  FOUNDER_SUPER_ADMIN: "/portal/founder-admin",
  COMPANY_ADMIN: "/portal/company-admin",
  ACCOUNTS_MANAGER: "/portal/accounts",
  ACCOUNTS_EXECUTIVE: "/portal/accounts",
  SALES_HEAD: "/portal/sales-manager",
  SALES_MANAGER: "/portal/sales-manager",
  SALES_EXECUTIVE: "/portal/sales-executive",
  SUPER_STOCKIST_OWNER: "/portal/super-stockist",
  SUPER_STOCKIST_OPERATOR: "/portal/super-stockist",
  DISTRIBUTOR_OWNER: "/portal/distributor",
  DISTRIBUTOR_OPERATOR: "/portal/distributor",
  DISTRIBUTOR_DELIVERY_USER: "/portal/distributor",
  RETAILER_USER: "/portal/retailer",
  READ_ONLY_AUDITOR: "/portal/auditor",
  // Manufacturing OS closure pass — these 5 roles existed in the RBAC catalog
  // but were never added here, so logging in as one would redirect to "/"
  // which redirects right back to this same function ("/" -> unmapped ->
  // "/") — an infinite redirect loop, not just a missing landing page. Found
  // and fixed during this pass's browser UAT, not a pre-existing known gap.
  MANUFACTURING_MANAGER: "/portal/manufacturing",
  PRODUCTION_SUPERVISOR: "/portal/manufacturing",
  STORE_EXECUTIVE: "/portal/manufacturing",
  QC_USER: "/portal/manufacturing",
  PRODUCTION_OPERATOR: "/portal/manufacturing",
};

export function portalLandingPathForRole(primaryRoleCode: string | null | undefined): string {
  return (primaryRoleCode && ROLE_TO_PORTAL[primaryRoleCode]) || "/";
}

// Single canonical "primary role" query — the oldest active UserRoleAssignment — reused by the
// login redirect, the root page redirect, and the header role badge (app/portal/[portal]/layout.tsx)
// so all three can never disagree about which role is "primary" for a multi-role user.
export async function primaryRoleAssignment(prisma: PrismaClient, userId: string) {
  return prisma.userRoleAssignment.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { role: true },
    orderBy: { assignedAt: "asc" },
  });
}
