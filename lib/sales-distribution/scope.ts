import type { Prisma, PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";
import { effectivePermissions as effectivePermissionsFor } from "@/lib/foundation/authorization-service";

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
    where: { salespersonId: { in: employeeIds }, distributorId: { not: null }, lifecycle: "ACTIVE" },
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
// retailer-routing authority). Three independent, additive sources, unioned:
//   1. Retailer-derived: the Executive's own retailer-mapped distributors, widened to their
//      Manager's whole team mapping when a Manager assignment exists.
//   2. Direct governed assignment (SeeraAssignment{EXECUTIVE_DISTRIBUTOR}, see
//      operational-service.ts's assignDistributorToExecutive) — closes the cold-start gap where a
//      brand-new territory has zero retailers yet, so source 1 alone can never bootstrap the FIRST
//      distributor a new Executive should be able to pick.
//   3. Company Direct (Founder decision, GAP-004 addendum): a Company-Direct-eligible Executive/
//      Manager must never be blocked from starting the day merely because no S.S./Distributor
//      exists in their area — Company Direct is a legitimate no-S.S./no-Distributor working
//      party for them specifically. Only added when isCompanyDirectEligible() is true for THIS
//      actor right now (re-checked live, not cached) — an ineligible user's authorized set is
//      completely unaffected, and a revoked user immediately loses it on their very next call.
//      This is the single function both the Start Day UI (distributorOptions) and startFieldDay's
//      own server-side authorization check already share, so fixing it here closes the gap on
//      both surfaces at once — never a UI-only fix.
export async function executiveAuthorizedDistributors(prisma: PrismaClient, executiveId: string) {
  const [managerAssignment, directAssignments, companyDirectEligible] = await Promise.all([
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
    isCompanyDirectEligible(prisma, executiveId),
  ]);
  const employeeIds = managerAssignment ? await teamEmployeeIdsForManager(prisma, managerAssignment.targetId) : [executiveId];
  const directDistributorIds = directAssignments.map((a) => a.targetId);
  const [retailerDerived, directDerived, companyDirect] = await Promise.all([
    distributorsForEmployeeIds(prisma, employeeIds),
    directDistributorIds.length
      ? prisma.seeraPartner.findMany({
          where: { id: { in: directDistributorIds }, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
          select: { id: true, legalName: true, tradeName: true, code: true, addresses: true },
        })
      : Promise.resolve([]),
    companyDirectEligible
      ? prisma.seeraPartner.findMany({
          where: { type: "COMPANY_DIRECT", lifecycle: "ACTIVE" },
          select: { id: true, legalName: true, tradeName: true, code: true, addresses: true },
        })
      : Promise.resolve([]),
  ]);
  const merged = new Map([...retailerDerived, ...directDerived, ...companyDirect].map((d) => [d.id, d]));
  return [...merged.values()].sort((a, b) => a.legalName.localeCompare(b.legalName));
}

// Company Direct governance (Founder decision, GAP-004 addendum): the default supply model stays
// Company -> Super Stockist -> Distributor -> Retailer. Company Direct is a Founder-approved
// EXCEPTION per Manager/Executive, never inferred from territory/name. Reuses the same generic
// SeeraAssignment table every other scoped fact in this file relies on (assignmentType:
// "COMPANY_DIRECT_ELIGIBLE", subject=User, target=a fixed "COMPANY_DIRECT" capability sentinel —
// this is a global yes/no capability, not scoped to a specific partner/territory row) instead of a
// new table or a hardcoded name/role check.
export const COMPANY_DIRECT_ELIGIBLE_ASSIGNMENT_TYPE = "COMPANY_DIRECT_ELIGIBLE";
const COMPANY_DIRECT_CAPABILITY_TARGET_ID = "COMPANY_DIRECT";

export async function isCompanyDirectEligible(prisma: PrismaClient, userId: string): Promise<boolean> {
  const now = new Date();
  const row = await prisma.seeraAssignment.findFirst({
    where: {
      assignmentType: COMPANY_DIRECT_ELIGIBLE_ASSIGNMENT_TYPE,
      subjectId: userId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    select: { id: true },
  });
  return !!row;
}

// Resolves the singleton Company Direct SeeraPartner's id, or null if it has never been set up
// (createCompanyDirectPartner not yet called) — used by every enforcement point below to detect
// "is this retailer/order actually routed through Company Direct" without a name/type string
// comparison scattered across call sites.
export async function companyDirectPartnerId(prisma: PrismaClient): Promise<string | null> {
  const partner = await prisma.seeraPartner.findFirst({ where: { type: "COMPANY_DIRECT" }, select: { id: true } });
  return partner?.id ?? null;
}

// ============================================================================
// AUTHORITATIVE OPERATIONAL GEOGRAPHY SCOPE (Final Production Closure, 23-Aug)
// ============================================================================
//
// Root cause of the Manoj/Bhilwara <-> Neeraj/Jhansi cross-geography leakage: the assignment
// mechanism (SeeraAssignment{assignmentType:"EXECUTIVE_TERRITORY"}, see operational-service.ts's
// assignExecutiveTerritory) already existed — Founder/Admin could already assign a Sales
// Executive/Manager to a Territory — but NOTHING anywhere ever read it. geographySuggestions(),
// Beat Planner's raw distributor query, and every other Territory/Beat/Distributor selector simply
// returned every ACTIVE global row to any user holding network:manage. This is the single
// authoritative resolver every one of those call sites must now go through instead — no
// screen-specific broad fallback, and an employee with zero territory assignments gets an
// EXPLICITLY EMPTY scope (never "show everything").
async function employeeTerritoryIds(prisma: PrismaClient, employeeId: string): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.seeraAssignment.findMany({
    where: { assignmentType: "EXECUTIVE_TERRITORY", subjectId: employeeId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    select: { targetId: true },
  });
  return [...new Set(rows.map((r) => r.targetId))];
}

async function scopeFromTerritoryIds(prisma: PrismaClient, territoryIds: string[]) {
  if (!territoryIds.length) return { territoryIds: [] as string[], beatIds: [] as string[], distributorIds: [] as string[] };
  const [beats, partners] = await Promise.all([
    prisma.seeraGeographyNode.findMany({ where: { level: "BEAT", parentId: { in: territoryIds }, status: "ACTIVE" }, select: { id: true } }),
    prisma.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, lifecycle: "ACTIVE", territoryIds: { hasSome: territoryIds } }, select: { id: true } }),
  ]);
  return { territoryIds, beatIds: beats.map((b) => b.id), distributorIds: partners.map((p) => p.id) };
}

// A Founder/Admin acts across every territory by design (they ARE the scope authority) — every
// resolver below exempts system:super_admin/master:manage from geography restriction entirely,
// rather than requiring every caller to remember to skip scoping for Founder/Admin themselves.
async function isGeographyUnrestricted(prisma: PrismaClient, actorId: string): Promise<boolean> {
  const permissions = await effectivePermissionsFor(prisma, actorId);
  return permissions.has("system:super_admin") || permissions.has("master:manage");
}

export type OperationalGeographyScope = { territoryIds: string[]; beatIds: string[]; distributorIds: string[]; unrestricted: boolean };

// A Sales Executive's own authorized geography — governs Today/Beat & Route/Add Customer/
// Distributor search/Orders. Empty (unrestricted:false, territoryIds:[]) until Founder/Admin
// explicitly assigns the Executive to at least one Territory via "Territories & beats".
export async function resolveExecutiveOperationalScope(prisma: PrismaClient, executiveId: string): Promise<OperationalGeographyScope> {
  if (await isGeographyUnrestricted(prisma, executiveId)) return { territoryIds: [], beatIds: [], distributorIds: [], unrestricted: true };
  const territoryIds = await employeeTerritoryIds(prisma, executiveId);
  return { ...(await scopeFromTerritoryIds(prisma, territoryIds)), unrestricted: false };
}

// A Sales Manager's authorized geography — the UNION of their own direct Territory
// assignment (if Founder assigned the Manager one directly, e.g. "Awdhesh -> Jhansi Division")
// and every one of their team's Territory assignments. Governs Beat Planner, Manager Retailing,
// Joint Working, Distributor/S.S. search and oversight.
export async function resolveManagerOperationalScope(prisma: PrismaClient, managerId: string): Promise<OperationalGeographyScope> {
  if (await isGeographyUnrestricted(prisma, managerId)) return { territoryIds: [], beatIds: [], distributorIds: [], unrestricted: true };
  const teamAssignments = await prisma.seeraAssignment.findMany({
    where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: managerId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
    select: { subjectId: true },
  });
  const employeeIds = [managerId, ...teamAssignments.map((a) => a.subjectId)];
  const perEmployee = await Promise.all(employeeIds.map((id) => employeeTerritoryIds(prisma, id)));
  const territoryIds = [...new Set(perEmployee.flat())];
  return { ...(await scopeFromTerritoryIds(prisma, territoryIds)), unrestricted: false };
}
