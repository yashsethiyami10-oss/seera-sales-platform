import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient, UserStatus } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";

const credentials = z.object({ email: z.string().trim().email().max(320), password: z.string().min(12).max(256) });
const allowed: UserStatus[] = ["ACTIVE"];
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(prisma: PrismaClient, input: unknown) {
  const parsed = credentials.safeParse(input);
  if (!parsed.success) throw new FoundationError("INVALID_AUTH_PAYLOAD", "Invalid credentials", 401);
  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { normalizedEmail } });
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
