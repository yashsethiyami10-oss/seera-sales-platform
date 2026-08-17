import type { PrismaClient } from "@prisma/client";
import { cache } from "react";
import type { Phase1Permission } from "./rbac-catalog";
import { FoundationError } from "./errors";

// Process-memory permission cache — same single-instance tradeoff as lib/rate-limit.ts
// (correct on one server, silently stale across multiple instances; swap for Redis
// before scaling beyond one, per CLAUDE.md).
//
// Why this exists: the underlying query below is a 3-level nested include (User ->
// UserRoleAssignment -> Role -> RolePermission -> Permission). Prisma executes a
// nested include like this as several sequential round trips rather than one JOIN,
// which measured at 500-1000ms per call against the TEST Neon endpoint — vs ~100ms for
// a bare `SELECT 1` round trip to the same endpoint (diagnosed during the Executive
// performance pass; see scripts/seera/retailing-performance-baseline.ts). authorize()
// calls this from nearly every Server Action (Check In, Place/Order, Check Out,
// Start/End Day, ...), so that cost was being paid fresh on literally every field
// action. The `cache()` wrapper below only dedupes calls within one request/render —
// it does not persist across the separate requests each action makes, so it alone
// never fixed this.
//
// A user's permission set changes only on an explicit role/status mutation; every one
// of those call sites already increments `User.authorizationVersion` for exactly this
// kind of cache invalidation (see user-management-service.ts, which now also calls
// invalidateEffectivePermissionsCache at each of those sites). A TTL is kept as a
// safety net for any invalidation call site missed, bounded further by the existing,
// independent SESSION_STALE check in auth-service.ts (a session whose captured
// authorizationVersion no longer matches the user's is already rejected outright,
// regardless of this cache).
const PERMISSION_CACHE_TTL_MS = 60_000;
type PermissionCacheEntry = { permissions: Set<string>; status: string; cachedAt: number };
const permissionCache = new Map<string, PermissionCacheEntry>();

export function invalidateEffectivePermissionsCache(userId?: string) {
  if (userId) permissionCache.delete(userId);
  else permissionCache.clear();
}

async function loadEffectivePermissions(prisma: PrismaClient, userId: string): Promise<PermissionCacheEntry> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roleAssignments: { where: { status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  if (!user) throw new FoundationError("USER_ACCESS_DISABLED", "User access is disabled", 403);
  const permissions = new Set(user.roleAssignments.filter((assignment) => assignment.role.status === "ACTIVE").flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)));
  return { permissions, status: user.status, cachedAt: Date.now() };
}

export const effectivePermissions = cache(async function effectivePermissions(prisma: PrismaClient, userId: string): Promise<Set<string>> {
  const cached = permissionCache.get(userId);
  const fresh = cached && Date.now() - cached.cachedAt < PERMISSION_CACHE_TTL_MS ? cached : undefined;
  const entry = fresh ?? (await loadEffectivePermissions(prisma, userId));
  if (!fresh) permissionCache.set(userId, entry);
  if (entry.status !== "ACTIVE") throw new FoundationError("USER_ACCESS_DISABLED", "User access is disabled", 403);
  return entry.permissions;
});

export async function authorize(prisma: PrismaClient, input: { actorId: string; permission: Phase1Permission; featureFlag?: string }) {
  const permissions = await effectivePermissions(prisma, input.actorId);
  if (!permissions.has(input.permission) && !permissions.has("system:super_admin")) { await prisma.auditLog.create({data:{actorId:input.actorId,action:"authorization.denied",entityType:"Permission",entityId:input.permission,outcome:"DENIED",reason:"MISSING_PERMISSION"}}); throw new FoundationError("ACCESS_DENIED", "Required permission denied", 403); }
  if (input.featureFlag) {
    const flag = await prisma.featureFlag.findUnique({ where: { key: input.featureFlag } });
    const now = new Date();
    if (!flag?.enabled || (flag.effectiveFrom && flag.effectiveFrom > now) || (flag.effectiveTo && flag.effectiveTo <= now)) { await prisma.auditLog.create({data:{actorId:input.actorId,action:"authorization.denied",entityType:"FeatureFlag",entityId:input.featureFlag,outcome:"DENIED",reason:"PORTAL_DISABLED"}}); throw new FoundationError("PORTAL_DISABLED", "Portal is unavailable", 403); }
  }
  return { actorId: input.actorId, permissions };
}
