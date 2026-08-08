import type { PrismaClient } from "@prisma/client";
import type { Phase1Permission } from "./rbac-catalog";
import { FoundationError } from "./errors";

export async function effectivePermissions(prisma: PrismaClient, userId: string): Promise<Set<string>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roleAssignments: { where: { status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  if (!user || user.status !== "ACTIVE") throw new FoundationError("USER_ACCESS_DISABLED", "User access is disabled", 403);
  return new Set(user.roleAssignments.filter((assignment) => assignment.role.status === "ACTIVE").flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)));
}

export async function authorize(prisma: PrismaClient, input: { actorId: string; permission: Phase1Permission; featureFlag?: string }) {
  const permissions = await effectivePermissions(prisma, input.actorId);
  if (!permissions.has(input.permission) && !permissions.has("system:super_admin")) throw new FoundationError("ACCESS_DENIED", "Required permission denied", 403);
  if (input.featureFlag) {
    const flag = await prisma.featureFlag.findUnique({ where: { key: input.featureFlag } });
    const now = new Date();
    if (!flag?.enabled || (flag.effectiveFrom && flag.effectiveFrom > now) || (flag.effectiveTo && flag.effectiveTo <= now)) throw new FoundationError("PORTAL_DISABLED", "Portal is unavailable", 403);
  }
  return { actorId: input.actorId, permissions };
}
