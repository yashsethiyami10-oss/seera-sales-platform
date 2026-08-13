import type { Prisma, PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";

export async function notifyPartyUsers(
  db: PrismaClient | Prisma.TransactionClient,
  partnerId: string,
  input: { title: string; body: string; entityType: string; entityId: string; actionPath?: string },
) {
  const now = new Date();
  const links = await db.seeraPartyUser.findMany({
    where: { partnerId, active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    select: { userId: true },
  });
  if (!links.length) return;
  // SeeraPartyUser.userId is a plain string reference, not a DB-level FK (deliberately, so a
  // party-user link can outlive a user record) — so a stale link pointing at a deleted/deactivated
  // user is a real possibility, not just a TEST-fixture artifact. Notification.recipientId *is* a
  // hard FK, so creating one for a since-deleted user throws and previously rolled back the whole
  // enclosing order-placement transaction over what should only cost that one recipient their
  // notification. Filter to users that still exist and are ACTIVE before writing.
  const validUsers = await db.user.findMany({
    where: { id: { in: links.map((link) => link.userId) }, status: "ACTIVE" },
    select: { id: true },
  });
  const validUserIds = new Set(validUsers.map((user) => user.id));
  const recipients = links.filter((link) => validUserIds.has(link.userId));
  if (!recipients.length) return;
  await db.notification.createMany({
    data: recipients.map((link) => ({
      recipientId: link.userId,
      title: input.title,
      body: input.body,
      type: "FOUNDATION",
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.actionPath ? { actionPath: input.actionPath } : undefined,
    })),
  });
}

export async function requirePartyMembership(prisma: PrismaClient, userId: string, partnerId: string, expectedType: "DISTRIBUTOR" | "SUPER_STOCKIST") {
  const now = new Date();
  const membership = await prisma.seeraPartyUser.findFirst({ where: { userId, partnerId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }], partner: { type: expectedType, lifecycle: "ACTIVE" } }, include: { partner: true } });
  if (!membership) throw new FoundationError("PARTY_SCOPE_DENIED", "Partner scope denied", 403);
  return membership;
}

export async function permittedPartnerIds(prisma: PrismaClient, userId: string, expectedType: "DISTRIBUTOR" | "SUPER_STOCKIST") {
  const now = new Date();
  const memberships = await prisma.seeraPartyUser.findMany({ where: { userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }], partner: { type: expectedType, lifecycle: "ACTIVE" } }, select: { partnerId: true } });
  return memberships.map((item) => item.partnerId);
}
