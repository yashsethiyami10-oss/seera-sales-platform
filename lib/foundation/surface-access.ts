import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { analyticsScope, type AnalyticsPortal } from "@/lib/phase-10/scope";
import type { SurfaceItem } from "@/lib/foundation/product-surface";
import { FoundationError } from "@/lib/foundation/errors";
import type { Phase1Permission } from "@/lib/foundation/rbac-catalog";

const GLOBAL_PORTALS = new Set([
  "founder-admin",
  "company-admin",
  "accounts",
  "auditor",
]);
const portalPermission: Record<string, string> = {
  "founder-admin": "portal:admin",
  "company-admin": "portal:admin",
  accounts: "portal:accounts",
  "sales-manager": "portal:sales_manager",
  "sales-executive": "portal:sales_executive",
  distributor: "portal:distributor",
  "super-stockist": "portal:super_stockist",
  retailer: "portal:retailer",
  auditor: "audit:view",
};

/** Repeats authorization and resolves the record scope at every detail boundary. */
export async function requireSurfaceAccess(
  db: PrismaClient,
  userId: string,
  portal: string,
  item: SurfaceItem,
) {
  const required = portalPermission[portal];
  if (!required)
    throw new FoundationError("ACCESS_DENIED", "Unknown portal", 403);
  await authorize(db, {
    actorId: userId,
    permission: required as Phase1Permission,
  });
  if (item.permission)
    await authorize(db, {
      actorId: userId,
      permission: item.permission as Phase1Permission,
    });
  const scopePortal = (
    portal === "auditor"
      ? "founder-admin"
      : portal === "company-admin"
        ? "company-admin"
        : portal
  ) as AnalyticsPortal;
  const scope = await analyticsScope(db, userId, scopePortal);
  if (
    !GLOBAL_PORTALS.has(portal) &&
    scope.partyIds === null &&
    scope.employeeIds === null &&
    scope.retailerIds === null
  )
    throw new FoundationError(
      "SCOPE_REQUIRED",
      "A scoped portal cannot access organization-wide records",
      403,
    );
  return {
    partyIds: scope.partyIds,
    employeeIds: scope.employeeIds,
    retailerIds: scope.retailerIds,
    organizationWide: GLOBAL_PORTALS.has(portal),
  };
}
