import type { PrismaClient, UserStatus } from "@prisma/client";
import { z } from "zod";
import { authorize } from "./authorization-service";
import { hashPassword, revokeAllSessions } from "./auth-service";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";

const createInput = z.object({ email: z.string().trim().email(), name: z.string().trim().min(2).max(120), password: z.string().min(12).max(256) });
export async function createUser(prisma: PrismaClient, actorId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "user:create" });
  const data = createInput.parse(input); const normalizedEmail = data.email.toLowerCase();
  const user = await prisma.user.create({ data: { email: data.email, normalizedEmail, name: data.name, passwordHash: await hashPassword(data.password) } });
  await recordAudit(prisma, { actorId, action: "user.create", entityType: "User", entityId: user.id, afterState: { email: normalizedEmail, status: user.status } });
  return user;
}

export async function setUserStatus(prisma: PrismaClient, actorId: string, userId: string, status: UserStatus, reason: string) {
  const permission = status === "SUSPENDED" ? "user:suspend" : status === "ACTIVE" ? "user:reactivate" : "user:disable";
  await authorize(prisma, { actorId, permission });
  if (actorId === userId && status !== "ACTIVE") throw new FoundationError("SELF_LOCKOUT_DENIED", "Self lockout is prohibited", 409);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const user = await prisma.user.update({ where: { id: userId }, data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null, suspensionReason: status === "SUSPENDED" ? reason : null, authorizationVersion: { increment: 1 } } });
  if (status !== "ACTIVE") await revokeAllSessions(prisma, userId, actorId, `USER_${status}`);
  await recordAudit(prisma, { actorId, action: "user.status_change", entityType: "User", entityId: userId, reason, beforeState: { status: before.status }, afterState: { status } });
  return user;
}

export async function assignRole(prisma: PrismaClient, actorId: string, userId: string, roleCode: string, reason: string) {
  await authorize(prisma, { actorId, permission: "role:assign" });
  const actorPermissions = await authorize(prisma, { actorId, permission: "role:assign" });
  if (roleCode === "FOUNDER_SUPER_ADMIN" && !actorPermissions.permissions.has("system:super_admin")) throw new FoundationError("SYSTEM_ROLE_ASSIGNMENT_DENIED", "System authority cannot be assigned", 403);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const existing = await prisma.userRoleAssignment.findFirst({ where: { userId, roleId: role.id, status: "ACTIVE" } });
  if (existing) throw new FoundationError("DUPLICATE_ROLE_ASSIGNMENT", "Active role assignment already exists", 409);
  const assignment = await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id, assignedById: actorId, assignmentReason: reason } });
  await prisma.user.update({ where: { id: userId }, data: { authorizationVersion: { increment: 1 } } });
  await revokeAllSessions(prisma, userId, actorId, "ROLE_ASSIGNED");
  await recordAudit(prisma, { actorId, action: "role.assign", entityType: "UserRoleAssignment", entityId: assignment.id, reason, afterState: { userId, roleCode } });
  return assignment;
}

export async function removeRole(prisma: PrismaClient, actorId: string, userId: string, roleCode: string, reason: string) {
  await authorize(prisma, { actorId, permission: "role:remove" });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const assignment = await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId, roleId: role.id, status: "ACTIVE" } });
  if (roleCode === "FOUNDER_SUPER_ADMIN") {
    const founders = await prisma.userRoleAssignment.count({ where: { roleId: role.id, status: "ACTIVE", user: { status: "ACTIVE" } } });
    if (founders <= 1) throw new FoundationError("LAST_FOUNDER_PROTECTED", "The last active Founder cannot be removed", 409);
  }
  const updated = await prisma.userRoleAssignment.update({ where: { id: assignment.id }, data: { status: "REVOKED", revokedById: actorId, revokedAt: new Date(), revocationReason: reason } });
  await prisma.user.update({ where: { id: userId }, data: { authorizationVersion: { increment: 1 } } });
  await revokeAllSessions(prisma, userId, actorId, "ROLE_REMOVED");
  await recordAudit(prisma, { actorId, action: "role.remove", entityType: "UserRoleAssignment", entityId: assignment.id, reason, beforeState: { roleCode, status: "ACTIVE" }, afterState: { status: "REVOKED" } });
  return updated;
}
