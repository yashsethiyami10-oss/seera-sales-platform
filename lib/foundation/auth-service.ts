import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient, UserStatus } from "@prisma/client";
import { z } from "zod";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";

// Not `.email()`-constrained (P0 21-Aug login fix): Distributor/Super Stockist accounts are
// provisioned with a synthetic `dist.<mobile>@seera.local`-style identifier (see
// lib/sales-distribution's partner-user provisioning) that nobody types from memory — production
// evidence showed exactly this (repeated INVALID_CREDENTIALS for a real Distributor account whose
// real identifier is `dist.9956736641@seera.local`). login() below now also accepts the plain
// 10-digit mobile number already stored on User.phone for these accounts, matching what a
// Distributor/S.S. actually knows. Shape validation happens inside login() itself instead, since
// a valid identifier can now be either shape.
const credentials = z.object({ email: z.string().trim().min(3).max(320), password: z.string().min(12).max(256) });
const allowed: UserStatus[] = ["ACTIVE"];
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(prisma: PrismaClient, input: unknown) {
  const parsed = credentials.safeParse(input);
  if (!parsed.success) throw new FoundationError("INVALID_AUTH_PAYLOAD", "Invalid credentials", 401);
  // A canonical 91XXXXXXXXXX mobile always takes the phone-lookup path (User.phone is stored as
  // the raw 10-digit number, never a full email) — anything else falls back to the existing
  // normalizedEmail lookup, so no currently-working email login can regress. Gated on "does not
  // contain @" FIRST: normalizeIndianMobile only strips non-digit characters, so an unguarded call
  // would also "recognize" the 10 digits embedded inside a synthetic dist.<mobile>@seera.local
  // email as a mobile number — usually harmless (same digits, same user) but not always (a real
  // email whose local part happens to contain an unrelated 10-digit sequence must never be
  // reinterpreted as somebody else's phone number).
  const identifier = parsed.data.email.trim();
  const canonicalMobile = identifier.includes("@") ? null : normalizeIndianMobile(identifier);
  const normalizedEmail = identifier.toLowerCase();
  const user = canonicalMobile
    ? await prisma.user.findUnique({ where: { phone: canonicalMobile.slice(2) } })
    : await prisma.user.findUnique({ where: { normalizedEmail } });
  const valid = user?.passwordHash ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    await recordAudit(prisma, { actorId: user?.id, action: "auth.login_failed", entityType: "User", entityId: user?.id, outcome: "DENIED", reason: "INVALID_CREDENTIALS" });
    throw new FoundationError("INVALID_CREDENTIALS", "Invalid credentials", 401);
  }
  if (!allowed.includes(user.status)) {
    await recordAudit(prisma, { actorId: user.id, action: "auth.login_denied", entityType: "User", entityId: user.id, outcome: "DENIED", reason: `USER_${user.status}` });
    throw new FoundationError("USER_ACCESS_DISABLED", "User access is disabled", 403);
  }
  const rawToken = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { sessionToken: tokenHash(rawToken), userId: user.id, expires: new Date(Date.now() + 86_400_000), authorizationVersion: user.authorizationVersion } });
  await recordAudit(prisma, { actorId: user.id, action: "auth.login", entityType: "Session", entityId: session.id, sessionId: session.id });
  return { token: rawToken, sessionId: session.id, userId: user.id, expires: session.expires };
}

export async function resolveSession(prisma: PrismaClient, rawToken: string | undefined) {
  if (!rawToken) throw new FoundationError("AUTHENTICATION_REQUIRED", "Authentication required", 401);
  const session = await prisma.session.findUnique({ where: { sessionToken: tokenHash(rawToken) }, include: { user: true } });
  if (!session || session.revokedAt || session.expires <= new Date()) throw new FoundationError("SESSION_INVALID", "Session is invalid", 401);
  if (session.user.status !== "ACTIVE") throw new FoundationError("USER_ACCESS_DISABLED", "User access is disabled", 403);
  if (session.authorizationVersion !== session.user.authorizationVersion) throw new FoundationError("SESSION_STALE", "Session authorization is stale", 401);
  return { session, user: session.user };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string, actorId: string, reason: string) {
  const session = await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date(), revocationReason: reason } });
  await recordAudit(prisma, { actorId, action: "session.revoke", entityType: "Session", entityId: session.id, reason });
  return session;
}

export async function revokeAllSessions(prisma: PrismaClient, userId: string, actorId: string, reason: string) {
  const result = await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason } });
  await recordAudit(prisma, { actorId, action: "session.revoke_all", entityType: "User", entityId: userId, reason, afterState: { revoked: result.count } });
  return result.count;
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new FoundationError("WEAK_PASSWORD", "Password must be at least 12 characters");
  return bcrypt.hash(password, 12);
}
