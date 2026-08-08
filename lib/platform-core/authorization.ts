import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { SALES_ROLES, type PermissionKey } from "./constants";

export const getSalesPrincipal = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, active: true, territoryId: true, role: true,
      salesRole: {
        select: {
          id: true, name: true, active: true,
          permissions: { select: { permission: { select: { permissionKey: true } } } },
        },
      },
    },
  });
  if (!user?.active || !user.salesRole?.active) throw new ForbiddenError("Sales access is inactive");
  const salesRole = user.salesRole;
  return {
    ...user,
    salesRole,
    isFounder: salesRole.name === SALES_ROLES.FOUNDER,
    permissions: new Set(salesRole.permissions.map((item) => item.permission.permissionKey)),
  };
});

/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part B.
 *
 * The single, centralized permission predicate. Every permission check on
 * the platform — every requirePermission/requireAnyPermission/hasPermission
 * call below, AND every AI-surface check in lib/muv-ai/security.ts — goes
 * through these two functions. There is exactly one place "does this
 * principal have this permission" is decided; nothing anywhere else may
 * re-implement the isFounder-bypass-or-permission-set-membership check
 * inline. `PrincipalPermissionView` is intentionally structural (not tied
 * to the exact SalesPrincipal shape) so any already-resolved principal
 * object — including lib/muv-ai/types.ts's AiPrincipal — can be checked
 * without a second Prisma round-trip through getSalesPrincipal().
 */
export type PrincipalPermissionView = { isFounder: boolean; permissions: Set<string> };

export function principalHasPermission(principal: PrincipalPermissionView, key: PermissionKey): boolean {
  return principal.isFounder || principal.permissions.has(key);
}

export function principalHasAnyPermission(principal: PrincipalPermissionView, keys: PermissionKey[]): boolean {
  return principal.isFounder || keys.some((key) => principal.permissions.has(key));
}

export function principalHasAllPermissions(principal: PrincipalPermissionView, keys: PermissionKey[]): boolean {
  return principal.isFounder || keys.every((key) => principal.permissions.has(key));
}

export async function requirePermission(...required: PermissionKey[]) {
  const principal = await getSalesPrincipal();
  if (!principalHasAllPermissions(principal, required)) {
    throw new ForbiddenError("You do not have permission to perform this action");
  }
  return principal;
}

export async function requireAnyPermission(...required: PermissionKey[]) {
  const principal = await getSalesPrincipal();
  if (!principalHasAnyPermission(principal, required)) {
    throw new ForbiddenError("You do not have permission to perform this action");
  }
  return principal;
}

export async function hasPermission(key: PermissionKey) {
  try {
    const principal = await getSalesPrincipal();
    return principalHasPermission(principal, key);
  } catch {
    return false;
  }
}
