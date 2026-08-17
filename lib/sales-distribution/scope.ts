import type { Prisma, PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";

export async function notifyPartyUsers(
  db: PrismaClient | Prisma.TransactionClient,
  partnerId: string,
  input: { title: string; body: string; entityType: string; entityId: string; actionPath?: string },
) {
  const now = new Date();
  // SeeraPartyUser.userId is a plain string reference, not a DB-level FK (deliberately, so a
  // party-user link can outlive a user record) — so a stale link pointing at a deleted/deactivated
  // user is a real possibility, not just a TEST-fixture artifact. Notification.recipientId *is* a
  // hard FK, so creating one for a since-deleted user throws and previously rolled back the whole
  // enclosing order-placement transaction over what should only cost that one recipient their
  // notification. Filter to users that still exist and are ACTIVE before writing.
  //
  // PERFORMANCE: the party-user lookup and the "still exists and ACTIVE" check used to be two
  // sequential round trips (the second can only run once the first returns userIds) — measured as a
  // real, avoidable contributor to placeRetailerOrder's post-commit latency (see
  // scripts/seera/retailing-performance-baseline.ts). Merged into one query via a raw JOIN — there's
  // no Prisma-level relation to join through (userId isn't a declared @relation), but the join is
  // exactly the same filter logic, just executed server-side in one round trip instead of two.
  const recipients = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT pu."userId" AS "userId"
    FROM "seera_party_users" pu
    JOIN "users" u ON u.id = pu."userId" AND u.status = 'ACTIVE'
    WHERE pu."partnerId" = ${partnerId}
      AND pu.active = true
      AND (pu."effectiveTo" IS NULL OR pu."effectiveTo" > ${now})
  `;
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

// Mirrors manager-service.ts's own private managerTeamEmployeeIds() query exactly — kept as a
// separate, self-contained copy here rather than refactoring that widely-used (13 call sites)
// existing helper, to keep the Start Day Working Distributor feature's blast radius limited to new
// code only. Used solely to resolve an Executive's own Manager-team scope below.
async function teamEmployeeIdsForManager(prisma: PrismaClient, managerId: string) {
  const assignments = await prisma.seeraAssignment.findMany({
    where: {
      assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
      targetId: managerId,
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    select: { subjectId: true },
  });
  return [managerId, ...assignments.map((a) => a.subjectId)];
}

// Same canonical "distributors these employees' retailers are actually mapped to" relation
// manager-service.ts's mappedDistributorsFor() already uses for Manager Distributor Oversight — no
// parallel assignment system, just the existing SeeraRetailer.salespersonId -> distributorId trail.
export async function distributorsForEmployeeIds(prisma: PrismaClient, employeeIds: string[]) {
  const mapped = await prisma.seeraRetailer.findMany({
    where: { salespersonId: { in: employeeIds }, distributorId: { not: null } },
    select: { distributorId: true },
    distinct: ["distributorId"],
  });
  const distributorIds = mapped.map((r) => r.distributorId).filter((x): x is string => Boolean(x));
  if (!distributorIds.length) return [];
  return prisma.seeraPartner.findMany({
    where: { id: { in: distributorIds }, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
    select: { id: true, legalName: true, tradeName: true, code: true, addresses: true },
    orderBy: { legalName: "asc" },
  });
}

// Start Day "Choose Working Distributor" scope for a Sales Executive (spec: day-context only, never
// retailer-routing authority). Two independent, additive sources, unioned:
//   1. Retailer-derived: the Executive's own retailer-mapped distributors, widened to their
//      Manager's whole team mapping when a Manager assignment exists.
//   2. Direct governed assignment (SeeraAssignment{EXECUTIVE_DISTRIBUTOR}, see
//      operational-service.ts's assignDistributorToExecutive) — closes the cold-start gap where a
//      brand-new territory has zero retailers yet, so source 1 alone can never bootstrap the FIRST
//      distributor a new Executive should be able to pick.
export async function executiveAuthorizedDistributors(prisma: PrismaClient, executiveId: string) {
  const [managerAssignment, directAssignments] = await Promise.all([
    prisma.seeraAssignment.findFirst({
      where: {
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        subjectId: executiveId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.seeraAssignment.findMany({
      where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: executiveId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      select: { targetId: true },
    }),
  ]);
  const employeeIds = managerAssignment ? await teamEmployeeIdsForManager(prisma, managerAssignment.targetId) : [executiveId];
  const directDistributorIds = directAssignments.map((a) => a.targetId);
  const [retailerDerived, directDerived] = await Promise.all([
    distributorsForEmployeeIds(prisma, employeeIds),
    directDistributorIds.length
      ? prisma.seeraPartner.findMany({
          where: { id: { in: directDistributorIds }, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
          select: { id: true, legalName: true, tradeName: true, code: true, addresses: true },
        })
      : Promise.resolve([]),
  ]);
  const merged = new Map([...retailerDerived, ...directDerived].map((d) => [d.id, d]));
  return [...merged.values()].sort((a, b) => a.legalName.localeCompare(b.legalName));
}
