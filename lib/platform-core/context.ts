import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import { getSalesPrincipal } from "./authorization";
import type { PermissionKey } from "./constants";

export const ENTERPRISE_ORGANIZATION = "MUV" as const;

export type EnterprisePrincipal = {
  id: string;
  email: string | null;
  roleName: string;
  isFounder: boolean;
  permissions: Set<string>;
  organizationKey: typeof ENTERPRISE_ORGANIZATION;
};

export async function requireEnterprisePrincipal(
  permission: PermissionKey,
  feature = "ENTERPRISE_OPERATIONS_ENABLED",
): Promise<EnterprisePrincipal> {
  const principal = await getSalesPrincipal();
  if (!principal.isFounder && !principal.permissions.has(permission)) {
    throw new ForbiddenError("Enterprise Operations permission denied");
  }
  const flags = await prisma.aiConfiguration.findMany({
    where: {
      organizationKey: ENTERPRISE_ORGANIZATION,
      key: { in: ["ENTERPRISE_OPERATIONS_ENABLED", feature] },
      active: true,
    },
    select: { key: true, value: true },
  });
  const enabled = new Map(flags.map((row) => [
    row.key,
    Boolean((row.value as { enabled?: boolean }).enabled),
  ]));
  if (!enabled.get("ENTERPRISE_OPERATIONS_ENABLED") || !enabled.get(feature)) {
    throw new ForbiddenError("Enterprise Operations module is disabled");
  }
  return {
    id: principal.id,
    email: principal.email,
    roleName: principal.salesRole.name,
    isFounder: principal.isFounder,
    permissions: principal.permissions,
    organizationKey: ENTERPRISE_ORGANIZATION,
  };
}

export function requireOrganization(principal: EnterprisePrincipal, organizationKey: string) {
  if (organizationKey !== principal.organizationKey) {
    throw new ForbiddenError("Cross-organization access denied");
  }
}

export function requireVersion(actual: number, expected: number) {
  if (actual !== expected) throw new AppError("Record changed; refresh and retry", 409, "CONCURRENCY_CONFLICT");
}

export type EnterpriseTx = Prisma.TransactionClient;

