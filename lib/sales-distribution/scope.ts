import type { PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";

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
