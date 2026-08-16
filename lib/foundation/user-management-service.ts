import type { PrismaClient, UserStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authorize } from "./authorization-service";
import { hashPassword, revokeAllSessions } from "./auth-service";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";

const createInput = z.object({ email: z.string().trim().email(), name: z.string().trim().min(2).max(120), password: z.string().min(12).max(256) });
const updateIdentityInput = z.object({ email: z.string().trim().email(), name: z.string().trim().min(2).max(120) });
export async function createUser(prisma: PrismaClient, actorId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "user:create" });
  const data = createInput.parse(input); const normalizedEmail = data.email.toLowerCase();
  const user = await prisma.user.create({ data: { email: data.email, normalizedEmail, name: data.name, passwordHash: await hashPassword(data.password) } });
  await recordAudit(prisma, { actorId, action: "user.create", entityType: "User", entityId: user.id, afterState: { email: normalizedEmail, status: user.status } });
  return user;
}

export async function updateUserIdentity(prisma: PrismaClient, actorId: string, userId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "user:update" });
  const data = updateIdentityInput.parse(input), normalizedEmail = data.email.toLowerCase();
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const user = await prisma.user.update({ where: { id: userId }, data: { email: data.email, normalizedEmail, name: data.name } });
  await recordAudit(prisma, { actorId, action: "user.identity_update", entityType: "User", entityId: userId, beforeState: { email: before.email, name: before.name }, afterState: { email: normalizedEmail, name: user.name } });
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
  // Correction (regression caught by __tests__/seera-block3/rbac-foundation.integration.test.ts
  // "supports multiple roles and blocks duplicates"): an earlier pass in this same session added a
  // hard mutual-exclusivity guard here, assuming a person could only ever hold one "primary
  // operational role". That directly contradicted this existing, already-approved test — a single
  // person legitimately holding both SALES_EXECUTIVE and RETAILER_USER, for example, is intentional,
  // tested behavior, not a bug. The actual P0 (a multi-role user's login landing on the wrong
  // portal) is already fully fixed at its real source — portalLandingPathForRole() in
  // portal-landing.ts now derives the landing portal from a single deterministic "primary role" (the
  // oldest active assignment), so it can never disagree with the header badge regardless of how many
  // additional roles a user holds. No role-assignment restriction was actually needed to fix that.
  const assignment = await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id, assignedById: actorId, assignmentReason: reason } });
  await prisma.user.update({ where: { id: userId }, data: { authorizationVersion: { increment: 1 } } });
  await revokeAllSessions(prisma, userId, actorId, "ROLE_ASSIGNED");
  await recordAudit(prisma, { actorId, action: "role.assign", entityType: "UserRoleAssignment", entityId: assignment.id, reason, afterState: { userId, roleCode } });
  return assignment;
}

// Stage 3 fix: createUser/assignRole (above) already let a Founder/Admin create a login and grant a
// role, but nothing in application code could link that user to a SPECIFIC Distributor/S.S.
// Partner — SeeraPartyUser rows only ever existed via seed scripts. Without this, a Distributor
// created through createDistributorForSuperStockist (distributor-management-service.ts) had a real
// Partner record but no possible working login: every party-scoped function in the app gates on
// requirePartyMembership (scope.ts), which reads SeeraPartyUser, not role alone. This closes that —
// the actual "assign this new login to this business" step of onboarding.
export async function grantPartyMembership(
  prisma: PrismaClient,
  actorId: string,
  input: { partnerId: string; userId: string; accessRole: "OWNER" | "OPERATOR" | "DELIVERY" },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const partner = await prisma.seeraPartner.findFirst({ where: { id: input.partnerId, lifecycle: "ACTIVE" } });
  if (!partner) throw new FoundationError("PARTNER_NOT_FOUND", "Partner is unavailable", 404);
  const user = await prisma.user.findFirst({ where: { id: input.userId, status: "ACTIVE" } });
  if (!user) throw new FoundationError("USER_NOT_FOUND", "User is unavailable", 404);
  const existing = await prisma.seeraPartyUser.findFirst({ where: { partnerId: input.partnerId, userId: input.userId, active: true } });
  if (existing) return existing;
  const grant = await prisma.seeraPartyUser.create({
    data: { partnerId: input.partnerId, userId: input.userId, accessRole: input.accessRole, createdById: actorId },
  });
  await recordAudit(prisma, {
    actorId,
    action: "party_membership.granted",
    entityType: "SeeraPartyUser",
    entityId: grant.id,
    afterState: { partnerId: input.partnerId, userId: input.userId, accessRole: input.accessRole, partnerType: partner.type },
  });
  return grant;
}

export async function revokePartyMembership(prisma: PrismaClient, actorId: string, membershipId: string, reason: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!reason.trim()) throw new FoundationError("REVOKE_REASON_REQUIRED", "A reason is required to revoke party access", 400);
  const membership = await prisma.seeraPartyUser.findUniqueOrThrow({ where: { id: membershipId } });
  if (!membership.active) return membership;
  const updated = await prisma.seeraPartyUser.update({ where: { id: membershipId }, data: { active: false, effectiveTo: new Date() } });
  await recordAudit(prisma, {
    actorId,
    action: "party_membership.revoked",
    entityType: "SeeraPartyUser",
    entityId: membershipId,
    reason,
    beforeState: { active: true },
    afterState: { active: false },
  });
  return updated;
}

const PARTNER_ROLE_CODE: Record<string, Record<"OWNER" | "OPERATOR" | "DELIVERY", string>> = {
  SUPER_STOCKIST: { OWNER: "SUPER_STOCKIST_OWNER", OPERATOR: "SUPER_STOCKIST_OPERATOR", DELIVERY: "SUPER_STOCKIST_OPERATOR" },
  DISTRIBUTOR: { OWNER: "DISTRIBUTOR_OWNER", OPERATOR: "DISTRIBUTOR_OPERATOR", DELIVERY: "DISTRIBUTOR_DELIVERY_USER" },
};

function generateTemporaryPassword(): string {
  // 18 random bytes -> 24-char URL-safe string; satisfies createUser's min(12) length policy with
  // real entropy. Never persisted anywhere in plaintext — returned once to the caller only.
  return randomBytes(18).toString("base64url");
}

// Founder/Admin UAT correction (P0, section 8-9): grantPartyMembership (above) already links an
// EXISTING User to a Partner, but nothing composed "create the human's login" + "assign the
// correct portal role" + "grant them access to this specific business" into one step — a Founder
// appointing a new Super Stockist Owner had to separately create a user, know the exact system
// role code, assign it, then separately grant party membership. This is that composition, built
// entirely out of the three already-permission-checked primitives above (createUser, assignRole,
// grantPartyMembership) — no duplicated authorization or business logic.
//
// No invite-delivery or forced first-login password-change mechanism exists anywhere in this
// codebase (grepped for invite/temporaryPassword/resetPassword/forgotPassword — no hits against
// the Seera User model; lib/messaging is SMS/WhatsApp-only, no email channel; User has no
// mustChangePassword-style field). Per explicit instruction not to fake behavior the auth
// architecture cannot enforce, this returns the temporary password ONCE for the caller to display
// and hand to the appointee out-of-band — it is never stored in plaintext and never re-shown.
// Real invite delivery and forced first-login rotation remain a registered auth-hardening gap.
const provisionInput = z.object({
  partnerId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(15),
  email: z.string().trim().email().optional(),
  accessRole: z.enum(["OWNER", "OPERATOR", "DELIVERY"]),
  // Founder onboarding correction: real distributor owners are often verbally handed a temporary
  // password over a phone call, not shown a screen — the previously auto-generated 24-char
  // base64url string (generateTemporaryPassword() below) is unusable for that. Optional so every
  // existing caller that omits it keeps the prior auto-generated behavior unchanged.
  password: z.string().min(12).max(256).optional(),
});

export async function provisionPartnerLogin(prisma: PrismaClient, actorId: string, input: unknown) {
  const data = provisionInput.parse(input);
  const partner = await prisma.seeraPartner.findFirst({ where: { id: data.partnerId, lifecycle: "ACTIVE" } });
  if (!partner) throw new FoundationError("PARTNER_NOT_FOUND", "Partner is unavailable", 404);
  if (data.accessRole === "DELIVERY" && partner.type !== "DISTRIBUTOR")
    throw new FoundationError("INVALID_ACCESS_ROLE_FOR_PARTNER_TYPE", "Delivery access is only valid for a Distributor", 400);
  const roleCode = PARTNER_ROLE_CODE[partner.type]?.[data.accessRole];
  if (!roleCode) throw new FoundationError("UNSUPPORTED_PARTNER_TYPE", "Login provisioning is not supported for this partner type", 400);
  const normalizedMobile = data.mobile.replace(/\D/g, "");
  const email = data.email ?? `partner-${normalizedMobile}-${Date.now()}@seera.local`;
  const temporaryPassword = data.password ?? generateTemporaryPassword();
  const user = await createUser(prisma, actorId, { email, name: data.name, password: temporaryPassword });
  // Best-effort only: phone is @unique on User, and a shared/reused mobile number across two
  // provisioned logins should not fail the whole provisioning flow (login itself works by
  // email+password regardless) — it only loses the phone-lookup convenience for that one user.
  await prisma.user.update({ where: { id: user.id }, data: { phone: normalizedMobile } }).catch(() => undefined);
  await assignRole(prisma, actorId, user.id, roleCode, `Partner login provisioning — ${partner.type} ${partner.code}`);
  const membership = await grantPartyMembership(prisma, actorId, { partnerId: data.partnerId, userId: user.id, accessRole: data.accessRole });
  await recordAudit(prisma, {
    actorId,
    action: "partner_login.provisioned",
    entityType: "User",
    entityId: user.id,
    afterState: { partnerId: data.partnerId, partnerType: partner.type, roleCode, accessRole: data.accessRole },
  });
  return { user: { id: user.id, email: user.email, name: user.name }, membership, roleCode, temporaryPassword };
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
