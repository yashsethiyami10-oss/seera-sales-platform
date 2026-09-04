import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership, resolveManagerOperationalScope } from "./scope";
import { assertAdvanceOnlyCompanyOrder } from "./business-rules";
import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/foundation/audit-service";
const businessNumber=(prefix:string,key:string)=>`${prefix}-${createHash("sha256").update(key).digest("hex").slice(0,16).toUpperCase()}`;

export const GEOGRAPHY_TYPES = ["VILLAGE", "TOWN", "CITY", "AREA_LOCALITY", "DISTRICT", "OTHER"] as const;

// Master data (Territory > Beat > place) is resolved by case-insensitive name+level match, and
// auto-created on first use if not found — the whole point being a Manager can type a brand-new
// Territory/Beat/place name and start planning immediately, no Founder/Admin master setup step
// required. Once created, the row is real SeeraGeographyNode data, so it shows up as a suggestion
// for every future plan (see geographySuggestions below) — this never creates a silent duplicate
// because the same case-insensitive lookup runs on the next attempt too.
async function resolveOrCreateGeography(
  tx: Prisma.TransactionClient,
  input: { name: string; level: string; parentId?: string },
) {
  const name = input.name.trim();
  if (!name) throw new FoundationError("GEOGRAPHY_NAME_REQUIRED", `${input.level} name is required`, 400);
  const existing = await tx.seeraGeographyNode.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, level: input.level, status: "ACTIVE" },
  });
  if (existing) return existing;
  const code = businessNumber(input.level.slice(0, 4).toUpperCase(), `${input.level}-${name}-${Date.now()}-${Math.random()}`);
  return tx.seeraGeographyNode.create({
    data: { code, name, level: input.level, parentId: input.parentId, status: "ACTIVE" },
  });
}

export async function geographySuggestions(prisma: PrismaClient, actorId: string, level: string) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  return prisma.seeraGeographyNode.findMany({
    where: { level, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });
}

// Founder/Admin Territory & Beat master-data management (Bhilwara/Manoj onboarding gap):
// resolveOrCreateGeography above already creates SeeraGeographyNode{TERRITORY/BEAT} rows, but only
// as a SIDE EFFECT of a Sales Manager's full Beat Plan (requires an assigned field employee, a
// day-of-week, a place name/type) — there was no direct, minimal Founder/Admin path to create a
// bare Territory/Beat master record on its own, which is why "Territories & beats" showed "No
// records" with no visible create action even though the read path and the underlying model both
// already existed. Deliberately master:manage-gated (Founder/Admin only, narrower than
// createBeatPlan's network:manage which Sales Managers also hold) — matches the Founder's own
// instruction that Sales Manager/Executive must not gain master territory-creation rights here.
// headquarters/state/description live in `metadata` (JSON) since the model has no dedicated
// columns for them — `code`/`name`/`level`/`status` are real columns.
export async function createTerritory(
  prisma: PrismaClient,
  actorId: string,
  input: { name: string; headquarters?: string; state?: string; description?: string; code?: string; status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "DISCONTINUED" },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const name = input.name.trim();
  if (!name) throw new FoundationError("TERRITORY_NAME_REQUIRED", "Territory name is required", 400);
  const existing = await prisma.seeraGeographyNode.findFirst({ where: { name: { equals: name, mode: "insensitive" }, level: "TERRITORY" } });
  if (existing) return existing;
  const code = input.code?.trim() || businessNumber("TERR", `TERRITORY-${name}-${Date.now()}-${Math.random()}`);
  const territory = await prisma.seeraGeographyNode.create({
    data: {
      code,
      name,
      level: "TERRITORY",
      status: input.status ?? "ACTIVE",
      metadata: { headquarters: input.headquarters?.trim() || undefined, state: input.state?.trim() || undefined, description: input.description?.trim() || undefined },
    },
  });
  await recordAudit(prisma, { actorId, action: "territory.created", entityType: "SeeraGeographyNode", entityId: territory.id, afterState: { name, headquarters: input.headquarters, state: input.state } });
  return territory;
}

export async function createBeat(
  prisma: PrismaClient,
  actorId: string,
  input: { name: string; territoryId: string; description?: string; code?: string; status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "DISCONTINUED" },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const name = input.name.trim();
  if (!name) throw new FoundationError("BEAT_NAME_REQUIRED", "Beat name is required", 400);
  const territory = await prisma.seeraGeographyNode.findFirst({ where: { id: input.territoryId, level: "TERRITORY" } });
  if (!territory) throw new FoundationError("TERRITORY_NOT_FOUND", "Territory is unavailable", 404);
  const existing = await prisma.seeraGeographyNode.findFirst({ where: { name: { equals: name, mode: "insensitive" }, level: "BEAT", parentId: territory.id } });
  if (existing) return existing;
  const code = input.code?.trim() || businessNumber("BEAT", `BEAT-${name}-${Date.now()}-${Math.random()}`);
  const beat = await prisma.seeraGeographyNode.create({
    data: { code, name, level: "BEAT", parentId: territory.id, status: input.status ?? "ACTIVE", metadata: input.description?.trim() ? { description: input.description.trim() } : undefined },
  });
  await recordAudit(prisma, { actorId, action: "beat.created", entityType: "SeeraGeographyNode", entityId: beat.id, afterState: { name, territoryId: territory.id } });
  return beat;
}

export async function updateGeographyNode(
  prisma: PrismaClient,
  actorId: string,
  nodeId: string,
  input: { name?: string; headquarters?: string; state?: string; description?: string; status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "DISCONTINUED" },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const node = await prisma.seeraGeographyNode.findUniqueOrThrow({ where: { id: nodeId } });
  const metadata = { ...(node.metadata as Record<string, unknown> | null), ...(input.headquarters !== undefined ? { headquarters: input.headquarters.trim() || undefined } : {}), ...(input.state !== undefined ? { state: input.state.trim() || undefined } : {}), ...(input.description !== undefined ? { description: input.description.trim() || undefined } : {}) };
  const updated = await prisma.seeraGeographyNode.update({
    where: { id: nodeId },
    data: { name: input.name?.trim() || node.name, status: input.status ?? node.status, metadata },
  });
  await recordAudit(prisma, { actorId, action: `${node.level.toLowerCase()}.updated`, entityType: "SeeraGeographyNode", entityId: nodeId, beforeState: { name: node.name, status: node.status }, afterState: { name: updated.name, status: updated.status } });
  return updated;
}

export async function territoriesAndBeats(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const nodes = await prisma.seeraGeographyNode.findMany({ where: { level: { in: ["TERRITORY", "BEAT"] } }, orderBy: { name: "asc" } });
  const territories = nodes.filter((n) => n.level === "TERRITORY");
  const beatsByTerritory = new Map<string, typeof nodes>();
  for (const beat of nodes.filter((n) => n.level === "BEAT")) {
    const list = beatsByTerritory.get(beat.parentId ?? "") ?? [];
    list.push(beat);
    beatsByTerritory.set(beat.parentId ?? "", list);
  }
  return territories.map((t) => ({ territory: t, beats: beatsByTerritory.get(t.id) ?? [] }));
}

// Executive/Manager <-> Territory assignment (Bhilwara/Manoj): mirrors assignDistributorToExecutive's
// exact pattern (many-to-many, never closes a prior row, effectiveTo-based removal) but accepts
// either SALES_EXECUTIVE or SALES_MANAGER (Manoj holds both) and is master:manage-gated per the
// Founder's explicit instruction that only Founder/Admin may assign field users to a territory.
// Purely additive record-keeping — never touches the user's role assignments, Company Direct
// eligibility, or any other existing governance.
export async function assignExecutiveTerritory(
  prisma: PrismaClient,
  actorId: string,
  input: { userId: string; territoryId: string; reason: string },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!input.reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  const user = await prisma.user.findFirst({
    where: { id: input.userId, status: "ACTIVE", roleAssignments: { some: { status: "ACTIVE", role: { code: { in: ["SALES_EXECUTIVE", "SALES_MANAGER", "SALES_HEAD"] } } } } },
  });
  if (!user) throw new FoundationError("FIELD_FORCE_USER_NOT_FOUND", "User is not an active Sales Manager/Executive", 404);
  const territory = await prisma.seeraGeographyNode.findFirst({ where: { id: input.territoryId, level: "TERRITORY" } });
  if (!territory) throw new FoundationError("TERRITORY_NOT_FOUND", "Territory is unavailable", 404);
  const existing = await prisma.seeraAssignment.findFirst({
    where: { assignmentType: "EXECUTIVE_TERRITORY", subjectId: input.userId, targetId: input.territoryId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  if (existing) return existing;
  const assignment = await prisma.seeraAssignment.create({
    data: {
      assignmentType: "EXECUTIVE_TERRITORY",
      subjectType: "USER",
      subjectId: input.userId,
      targetType: "SEERA_GEOGRAPHY_NODE",
      targetId: input.territoryId,
      effectiveFrom: new Date(),
      reason: input.reason,
      createdById: actorId,
    },
  });
  await recordAudit(prisma, { actorId, action: "assignment.executive_territory_created", entityType: "SeeraAssignment", entityId: assignment.id, afterState: { userId: input.userId, territoryId: input.territoryId } });
  return assignment;
}

export async function removeExecutiveTerritoryAssignment(prisma: PrismaClient, actorId: string, assignmentId: string, reason: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (!reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  const assignment = await prisma.seeraAssignment.findFirst({ where: { id: assignmentId, assignmentType: "EXECUTIVE_TERRITORY" } });
  if (!assignment) throw new FoundationError("ASSIGNMENT_NOT_FOUND", "Assignment is unavailable", 404);
  if (assignment.effectiveTo) return assignment;
  const updated = await prisma.seeraAssignment.update({ where: { id: assignmentId }, data: { effectiveTo: new Date() } });
  await recordAudit(prisma, { actorId, action: "assignment.executive_territory_removed", entityType: "SeeraAssignment", entityId: assignmentId, reason, afterState: { userId: assignment.subjectId, territoryId: assignment.targetId } });
  return updated;
}

export async function activeExecutiveTerritoryAssignments(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const now = new Date();
  const [assignments, fieldUsers, territories] = await Promise.all([
    prisma.seeraAssignment.findMany({ where: { assignmentType: "EXECUTIVE_TERRITORY", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { effectiveFrom: "desc" } }),
    prisma.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: { in: ["SALES_EXECUTIVE", "SALES_MANAGER", "SALES_HEAD"] } }, user: { status: "ACTIVE" } }, select: { userId: true, user: { select: { id: true, name: true, email: true } } } }),
    prisma.seeraGeographyNode.findMany({ where: { level: "TERRITORY" }, select: { id: true, name: true } }),
  ]);
  const userById = new Map(fieldUsers.map((x) => [x.user.id, x.user]));
  const territoryById = new Map(territories.map((t) => [t.id, t.name]));
  return {
    fieldUsers: fieldUsers.map((x) => ({ value: x.user.id, label: x.user.name ?? x.user.email })),
    territories: territories.map((t) => ({ value: t.id, label: t.name })),
    assignments: assignments
      .filter((a) => userById.has(a.subjectId))
      .map((a) => ({ id: a.id, userId: a.subjectId, userName: userById.get(a.subjectId)?.name ?? a.subjectId, territoryId: a.targetId, territoryName: territoryById.get(a.targetId) ?? a.targetId, effectiveFrom: a.effectiveFrom, reason: a.reason })),
  };
}

// Distributor (optional) on a Beat Plan is free text, NOT another auto-create-on-first-use master
// like Territory/Beat/place: a Distributor is a full commercial Partner (billing profile, credit
// terms, GSTIN) and fabricating one from a planning screen would be a real business-rule risk (see
// managerPartnerCheckIn's own comment on the same tension for field-added parties). So this only
// ever *links* to an existing active Distributor by a case-insensitive trade/legal-name match — a
// typed name with no match is kept as a plain snapshot string, never used to create a Partner row,
// and the plan still saves either way (many territories genuinely have no Distributor master yet).
async function resolveDistributorByName(prisma: PrismaClient | Prisma.TransactionClient, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { distributorId: undefined, distributorNameSnapshot: undefined };
  const match = await prisma.seeraPartner.findFirst({
    where: {
      type: "DISTRIBUTOR",
      lifecycle: "ACTIVE",
      OR: [{ tradeName: { equals: trimmed, mode: "insensitive" } }, { legalName: { equals: trimmed, mode: "insensitive" } }],
    },
    select: { id: true, tradeName: true, legalName: true },
  });
  return match
    ? { distributorId: match.id, distributorNameSnapshot: match.tradeName ?? match.legalName }
    : { distributorId: undefined, distributorNameSnapshot: trimmed };
}

async function assertTeamMember(prisma: PrismaClient, managerId: string, employeeId: string) {
  const teamAssignment = await prisma.seeraAssignment.findFirst({
    where: {
      assignmentType: "MANAGER_TEAM",
      subjectId: employeeId,
      targetId: managerId,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  if (!teamAssignment)
    throw new FoundationError("EXECUTIVE_SCOPE_DENIED", "The selected Sales Executive is not in your active team", 403);
}

// Founder UAT fix (P0 cluster): Beat Planner's Executive selector, Manager Distributor Oversight's
// dropdown, and Manager Retailing's retailer selector all read team scope through assertTeamMember
// above via a SeeraAssignment{assignmentType:"MANAGER_TEAM"} row — but until now NOTHING in
// application code ever created one; it only ever existed via scripts/seera/seed-integrated-review.ts
// (a seed/test fixture). A real Manager with a real SALES_EXECUTIVE-role teammate saw every
// team-scoped screen as empty because the role assignment alone was never enough — this is the
// missing "who reports to whom" capability, reachable from Founder/Admin → Field force → Executive
// 360 → Assign Manager. An Executive reports to exactly one Manager at a time, so assigning a new
// one closes out any prior open assignment rather than stacking a second one.
export async function createManagerTeamAssignment(
  prisma: PrismaClient,
  actorId: string,
  input: { executiveId: string; managerId: string; effectiveFrom: Date; reason: string },
) {
  // Defense-in-depth fix: reassigning who-reports-to-whom org-wide is Founder/Admin governance, not
  // something a Sales Manager should be able to trigger for ANY executive/manager pair via a direct
  // API call — network:manage (which SALES_MANAGER also holds, for their own Beat Planner) was too
  // broad a gate for a write with this blast radius. Same "user:create" condition as
  // activeManagerTeamAssignments above, for the same reason.
  await authorize(prisma, { actorId, permission: "user:create" });
  if (!input.reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  if (input.executiveId === input.managerId) throw new FoundationError("INVALID_ASSIGNMENT", "An Executive cannot report to themselves", 400);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.seeraAssignment.findFirst({
      where: { assignmentType: "MANAGER_TEAM", subjectId: input.executiveId, effectiveTo: null },
    });
    if (existing) {
      if (existing.targetId === input.managerId) return existing;
      await tx.seeraAssignment.update({ where: { id: existing.id }, data: { effectiveTo: input.effectiveFrom } });
    }
    const assignment = await tx.seeraAssignment.create({
      data: {
        assignmentType: "MANAGER_TEAM",
        subjectType: "USER",
        subjectId: input.executiveId,
        targetType: "USER",
        targetId: input.managerId,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: existing ? "assignment.manager_team_reassigned" : "assignment.manager_team_created",
      entityType: "SeeraAssignment",
      entityId: assignment.id,
      beforeState: existing ? { previousManagerId: existing.targetId } : undefined,
      afterState: { executiveId: input.executiveId, managerId: input.managerId },
    });
    return assignment;
  });
}

export async function activeManagerTeamAssignments(prisma: PrismaClient, actorId: string) {
  // Defense-in-depth fix (cross-portal re-audit): this returns EVERY manager's team org-wide, by
  // design — it backs Founder/Admin's "Field force" page, not a Manager's own-team view (Manager
  // team scope elsewhere in this file is deliberately per-manager, via assertTeamMember). The
  // permission this originally checked, network:manage, is also held by SALES_MANAGER — not a live
  // leak today only because the one UI caller happens to add its own extra
  // portal==="founder-admin" && (user:create||system:super_admin) gate; a future caller that skipped
  // that UI-level check would have exposed org-wide assignment data to any Manager. "user:create" is
  // held by FOUNDER_SUPER_ADMIN/COMPANY_ADMIN only (authorize() always also allows
  // system:super_admin) — the same condition the UI already enforces, now the server's own rule
  // rather than something only the UI happens to reflect.
  await authorize(prisma, { actorId, permission: "user:create" });
  const now = new Date();
  const [assignments, executiveUsers, managerUsers] = await Promise.all([
    prisma.seeraAssignment.findMany({
      where: { assignmentType: "MANAGER_TEAM", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    }),
    // Selector-integrity fix: a userRoleAssignment can stay ACTIVE while the underlying User
    // account has been disabled (e.g. a duplicate/bootstrap account superseded by a later real
    // one) — without also requiring user.status:"ACTIVE" here, a disabled duplicate account still
    // shows up in the Founder/Admin "Choose by Name" picker and assignment list, indistinguishable
    // by name from the real active account. Matches the post-filter pattern already used by
    // bulkAssignRatanDistributorsToSoleExecutive/completeSoleExecutiveFieldForceSetup below.
    prisma.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" }, user: { status: "ACTIVE" } }, select: { userId: true, user: { select: { id: true, name: true, email: true } } } }),
    prisma.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: { in: ["SALES_MANAGER", "SALES_HEAD"] } }, user: { status: "ACTIVE" } }, select: { userId: true, user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const executiveById = new Map(executiveUsers.map((x) => [x.user.id, x.user]));
  const managerById = new Map(managerUsers.map((x) => [x.user.id, x.user]));
  return {
    assignments: assignments
      .filter((a) => executiveById.has(a.subjectId))
      .map((a) => ({
        id: a.id,
        executiveId: a.subjectId,
        executiveName: executiveById.get(a.subjectId)?.name ?? executiveById.get(a.subjectId)?.email ?? a.subjectId,
        managerId: a.targetId,
        managerName: managerById.get(a.targetId)?.name ?? managerById.get(a.targetId)?.email ?? a.targetId,
        effectiveFrom: a.effectiveFrom,
        reason: a.reason,
      })),
    executives: executiveUsers.map((x) => ({ value: x.user.id, label: x.user.name ?? x.user.email })),
    managers: managerUsers.map((x) => ({ value: x.user.id, label: x.user.name ?? x.user.email })),
  };
}

// Start Day "Choose Working Distributor" scope gap (Founder-reported production issue): a brand
// new Executive/territory has zero retailers yet, so executiveAuthorizedDistributors()'s
// retailer-derived relation (scope.ts) can never bootstrap the FIRST distributor — there was no
// application-code path to explicitly say "this Executive's working network includes these
// Distributors" before any retailer exists. Reuses the same generic SeeraAssignment table
// MANAGER_TEAM already relies on (assignmentType:"EXECUTIVE_DISTRIBUTOR", subject=User,
// target=SeeraPartner) rather than a new table, and the same "Founder/Admin governance"
// user:create gate as createManagerTeamAssignment above — deliberately many-to-many (an Executive
// can legitimately work multiple Distributors' markets), so unlike Manager assignment this never
// closes out a prior row, it only adds/removes individual links.
export async function assignDistributorToExecutive(
  prisma: PrismaClient,
  actorId: string,
  input: { executiveId: string; distributorId: string; reason: string },
) {
  await authorize(prisma, { actorId, permission: "user:create" });
  if (!input.reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  const executive = await prisma.user.findFirst({
    where: { id: input.executiveId, status: "ACTIVE", roleAssignments: { some: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } } } },
  });
  if (!executive) throw new FoundationError("EXECUTIVE_NOT_FOUND", "Sales Executive is unavailable", 404);
  const distributor = await prisma.seeraPartner.findFirst({ where: { id: input.distributorId, type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });
  if (!distributor) throw new FoundationError("DISTRIBUTOR_NOT_FOUND", "Distributor is unavailable or inactive", 404);
  const existing = await prisma.seeraAssignment.findFirst({
    where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: input.executiveId, targetId: input.distributorId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  if (existing) return existing;
  const assignment = await prisma.seeraAssignment.create({
    data: {
      assignmentType: "EXECUTIVE_DISTRIBUTOR",
      subjectType: "USER",
      subjectId: input.executiveId,
      targetType: "SEERA_PARTNER",
      targetId: input.distributorId,
      effectiveFrom: new Date(),
      reason: input.reason,
      createdById: actorId,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "assignment.executive_distributor_created",
    entityType: "SeeraAssignment",
    entityId: assignment.id,
    afterState: { executiveId: input.executiveId, distributorId: input.distributorId },
  });
  return assignment;
}

export async function removeExecutiveDistributorAssignment(prisma: PrismaClient, actorId: string, assignmentId: string, reason: string) {
  await authorize(prisma, { actorId, permission: "user:create" });
  if (!reason.trim()) throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required", 400);
  const assignment = await prisma.seeraAssignment.findFirst({ where: { id: assignmentId, assignmentType: "EXECUTIVE_DISTRIBUTOR" } });
  if (!assignment) throw new FoundationError("ASSIGNMENT_NOT_FOUND", "Assignment is unavailable", 404);
  if (assignment.effectiveTo) return assignment;
  const updated = await prisma.seeraAssignment.update({ where: { id: assignmentId }, data: { effectiveTo: new Date() } });
  await recordAudit(prisma, {
    actorId,
    action: "assignment.executive_distributor_removed",
    entityType: "SeeraAssignment",
    entityId: assignmentId,
    reason,
    afterState: { executiveId: assignment.subjectId, distributorId: assignment.targetId },
  });
  return updated;
}

export async function activeExecutiveDistributorAssignments(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "user:create" });
  const now = new Date();
  const [assignments, executiveUsers, distributors] = await Promise.all([
    prisma.seeraAssignment.findMany({
      where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    }),
    // Same selector-integrity fix as activeManagerTeamAssignments above — exclude disabled
    // duplicate accounts from the Executive picker/assignment list.
    prisma.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" }, user: { status: "ACTIVE" } }, select: { userId: true, user: { select: { id: true, name: true, email: true } } } }),
    prisma.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true, tradeName: true, addresses: true } }),
  ]);
  const executiveById = new Map(executiveUsers.map((x) => [x.user.id, x.user]));
  const distributorLabel = (d: { legalName: string; tradeName: string | null; addresses: unknown }) => {
    const city = (d.addresses as { city?: string } | null)?.city;
    const firm = d.tradeName ?? d.legalName;
    return city ? `${firm} — ${city}` : firm;
  };
  const distributorById = new Map(distributors.map((d) => [d.id, d]));
  return {
    assignments: assignments
      .filter((a) => executiveById.has(a.subjectId) && distributorById.has(a.targetId))
      .map((a) => ({
        id: a.id,
        executiveId: a.subjectId,
        executiveName: executiveById.get(a.subjectId)?.name ?? executiveById.get(a.subjectId)?.email ?? a.subjectId,
        distributorId: a.targetId,
        distributorLabel: distributorLabel(distributorById.get(a.targetId)!),
        effectiveFrom: a.effectiveFrom,
        reason: a.reason,
      })),
    executives: executiveUsers.map((x) => ({ value: x.user.id, label: x.user.name ?? x.user.email })),
    distributors: distributors.map((d) => ({ value: d.id, label: distributorLabel(d) })),
  };
}

const RATAN_SUPER_STOCKIST_LEGAL_NAME = "M/s Ratan Products & Traders";

// Founder-authorized, ONE-TIME bulk convenience over assignDistributorToExecutive (above) — reuses
// that exact governed service per row rather than any new write path, purely to spare the Founder
// 10 repetitive manual "+ ASSIGN DISTRIBUTOR" submissions for a known, bounded target: whichever
// Distributors currently belong to M/s Ratan Products & Traders, assigned to whichever single
// SALES_EXECUTIVE is currently active. Distributors are resolved by their real Partner
// records (assignedSuperStockistId + type + lifecycle), never by matching "Sahu Kirana" as a bare
// string — the two Mahroni/Madawra rows are distinguished by being genuinely separate Partner ids.
export async function bulkAssignRatanDistributorsToSoleExecutive(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });

  const superStockists = await prisma.seeraPartner.findMany({ where: { type: "SUPER_STOCKIST", legalName: RATAN_SUPER_STOCKIST_LEGAL_NAME, lifecycle: "ACTIVE" } });
  if (superStockists.length === 0) throw new FoundationError("SUPER_STOCKIST_NOT_FOUND", `No active Super Stockist named "${RATAN_SUPER_STOCKIST_LEGAL_NAME}" was found`, 404);
  if (superStockists.length > 1) throw new FoundationError("SUPER_STOCKIST_AMBIGUOUS", `${superStockists.length} active Super Stockist records match "${RATAN_SUPER_STOCKIST_LEGAL_NAME}"`, 409);
  const superStockistId = superStockists[0]!.id;

  const distributors = await prisma.seeraPartner.findMany({
    where: { type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId, lifecycle: "ACTIVE" },
    select: { id: true, legalName: true, tradeName: true, addresses: true },
    orderBy: { legalName: "asc" },
  });
  if (distributors.length !== 10)
    throw new FoundationError("RATAN_DISTRIBUTOR_COUNT_MISMATCH", `Expected exactly 10 active Distributors under ${RATAN_SUPER_STOCKIST_LEGAL_NAME}, found ${distributors.length} — stopping before any write`, 409);

  const executiveUsers = await prisma.userRoleAssignment.findMany({
    where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } },
    select: { userId: true, user: { select: { id: true, name: true, email: true, status: true } } },
  });
  const activeExecutives = executiveUsers.filter((x) => x.user.status === "ACTIVE");
  if (activeExecutives.length === 0) throw new FoundationError("EXECUTIVE_NOT_FOUND", "No active Sales Executive was found", 404);
  if (activeExecutives.length > 1) throw new FoundationError("EXECUTIVE_AMBIGUOUS", `${activeExecutives.length} active Sales Executives exist — cannot resolve a single target safely`, 409);
  const executive = activeExecutives[0]!.user;

  const distributorLabel = (d: { legalName: string; tradeName: string | null; addresses: unknown }) => {
    const city = (d.addresses as { city?: string } | null)?.city;
    const firm = d.tradeName ?? d.legalName;
    return city ? `${firm} — ${city}` : firm;
  };

  const results = [];
  for (const distributor of distributors) {
    const before = await prisma.seeraAssignment.findFirst({
      where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: executive.id, targetId: distributor.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
    });
    const assignment = await assignDistributorToExecutive(prisma, actorId, { executiveId: executive.id, distributorId: distributor.id, reason: "Ratan network assignment" });
    results.push({ distributorId: distributor.id, distributorLabel: distributorLabel(distributor), status: before ? ("ALREADY_EXISTED" as const) : ("CREATED" as const), assignmentId: assignment.id });
  }

  return {
    executiveId: executive.id,
    executiveName: executive.name ?? executive.email,
    results,
    created: results.filter((r) => r.status === "CREATED").length,
    alreadyExisted: results.filter((r) => r.status === "ALREADY_EXISTED").length,
  };
}

// Founder-authorized, ONE-TIME composed action: the sole active Sales Executive currently has
// neither a Manager assignment nor any Working Distributor scope, and both are unambiguous given
// exactly one active Manager and one active Executive exist. Reuses the two ALREADY-GOVERNED
// primitives directly (createManagerTeamAssignment, bulkAssignRatanDistributorsToSoleExecutive) —
// no new write path, no duplicated resolution/authorization logic. A single click completes both;
// each underlying primitive is independently idempotent, so a retry after a partial failure is safe.
export async function completeSoleExecutiveFieldForceSetup(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "master:manage" });

  const managerUsers = await prisma.userRoleAssignment.findMany({
    where: { status: "ACTIVE", role: { code: { in: ["SALES_MANAGER", "SALES_HEAD"] } } },
    select: { user: { select: { id: true, name: true, email: true, status: true } } },
  });
  const activeManagers = managerUsers.filter((x) => x.user.status === "ACTIVE");
  if (activeManagers.length === 0) throw new FoundationError("MANAGER_NOT_FOUND", "No active Sales Manager was found", 404);
  if (activeManagers.length > 1) throw new FoundationError("MANAGER_AMBIGUOUS", `${activeManagers.length} active Sales Managers exist — cannot resolve a single target safely`, 409);
  const manager = activeManagers[0]!.user;

  const executiveUsers = await prisma.userRoleAssignment.findMany({
    where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } },
    select: { user: { select: { id: true, name: true, email: true, status: true } } },
  });
  const activeExecutives = executiveUsers.filter((x) => x.user.status === "ACTIVE");
  if (activeExecutives.length === 0) throw new FoundationError("EXECUTIVE_NOT_FOUND", "No active Sales Executive was found", 404);
  if (activeExecutives.length > 1) throw new FoundationError("EXECUTIVE_AMBIGUOUS", `${activeExecutives.length} active Sales Executives exist — cannot resolve a single target safely`, 409);
  const executive = activeExecutives[0]!.user;

  const managerTeam = await createManagerTeamAssignment(prisma, actorId, {
    executiveId: executive.id,
    managerId: manager.id,
    effectiveFrom: new Date(),
    reason: "Founder-authorized field force completion",
  });

  const distributorAssignment = await bulkAssignRatanDistributorsToSoleExecutive(prisma, actorId);

  return {
    managerName: manager.name ?? manager.email,
    executiveName: executive.name ?? executive.email,
    managerTeamAssignmentId: managerTeam.id,
    distributorsCreated: distributorAssignment.created,
    distributorsAlreadyExisted: distributorAssignment.alreadyExisted,
    distributorResults: distributorAssignment.results,
  };
}

export async function createBeatPlan(
  prisma: PrismaClient,
  actorId: string,
  input: {
    employeeId: string;
    territoryName: string;
    beatName: string;
    geographyType: (typeof GEOGRAPHY_TYPES)[number];
    geographyName: string;
    distributorName?: string;
    dayOfWeek: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
    notes?: string;
    publish: boolean;
  },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new FoundationError("INVALID_DAY_OF_WEEK", "Invalid journey-plan day", 400);
  await assertTeamMember(prisma, actorId, input.employeeId);
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
    throw new FoundationError("INVALID_EFFECTIVE_PERIOD", "End date cannot be before start date", 400);
  // Final Production Closure (23-Aug): SERVER-SIDE authoritative geography scope — a Manager whose
  // authorized Territory is Jhansi must never be able to plan into Bhilwara (or vice versa) merely
  // by typing a different Territory name; the dropdown suggestion list alone is not a security
  // boundary. Computed once, before the transaction, so a Founder/Admin (unrestricted) still plans
  // freely and a scoped Manager gets rejected before any write happens.
  const managerScope = await resolveManagerOperationalScope(prisma, actorId);
  try {
    // Money Desk + Founder Approvals Integration mission — real, reproduced bare-5000ms-timeout
    // bug (found via master E2E suite failure: "Transaction already closed... 6162ms passed"),
    // same class as postExpense/postJournal/reverseJournal/recordVendorPayment/issueBillingDraft/
    // createVendorBill fixed earlier this session. This transaction resolves up to 3 geography
    // nodes, a distributor lookup, a retailer count, the plan create, AND (when publishing) the
    // full immutable stop snapshot — real work that can legitimately exceed 5s under normal Neon
    // latency, directly blocking Beat/Route creation.
    return await prisma.$transaction(async (tx) => {
      const territory = await resolveOrCreateGeography(tx, { name: input.territoryName, level: "TERRITORY" });
      if (!managerScope.unrestricted && !managerScope.territoryIds.includes(territory.id))
        throw new FoundationError("TERRITORY_OUT_OF_SCOPE", `"${territory.name}" is outside your authorized Territory scope`, 403);
      const beat = await resolveOrCreateGeography(tx, { name: input.beatName, level: "BEAT", parentId: territory.id });
      const geography = await resolveOrCreateGeography(tx, { name: input.geographyName, level: input.geographyType, parentId: beat.id });
      const { distributorId, distributorNameSnapshot } = input.distributorName
        ? await resolveDistributorByName(tx, input.distributorName)
        : { distributorId: undefined, distributorNameSnapshot: undefined };
      // Founder-final rule REVERSED (production closure pass): a Beat Plan must be publishable even
      // with zero retailers currently mapped — plan creation must not require the retailer master
      // to already exist. retailerCount is still computed and recorded (audit, return value, and
      // the "Retailers mapped: N" informational UI state) — it's just no longer a publish blocker.
      const retailerCount = await tx.seeraRetailer.count({
        where: { salespersonId: input.employeeId, lifecycle: "ACTIVE", OR: [{ beatId: beat.id }, { marketId: geography.id }, { territoryId: territory.id }] },
      });
      const plan = await tx.seeraJourneyPlan.create({
        data: {
          employeeId: input.employeeId,
          dayOfWeek: input.dayOfWeek,
          geographyType: input.geographyType,
          geographyId: geography.id,
          territoryId: territory.id,
          beatId: beat.id,
          distributorId,
          distributorNameSnapshot,
          notes: input.notes,
          status: input.publish ? "PUBLISHED" : "DRAFT",
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          ownerId: actorId,
        },
      });
      if (input.publish) {
        // Atomic with the PUBLISHED status set above (same transaction) — a plan can never end up
        // PUBLISHED without its immutable stop snapshot, or vice versa.
        await createPlanStops(tx, plan.id, input.employeeId, { OR: [{ beatId: beat.id }, { marketId: geography.id }, { territoryId: territory.id }] });
        await tx.notification.create({
          data: {
            recipientId: input.employeeId,
            title: "Beat plan published",
            body: `${beat.name} (${geography.name}) has been assigned to your route plan.`,
            type: "FOUNDATION",
            entityType: "SeeraJourneyPlan",
            entityId: plan.id,
            payload: { actionPath: "/portal/sales-executive/beat" },
          },
        });
      }
      await recordAudit(tx, {
        actorId,
        action: input.publish ? "journey_plan.published" : "journey_plan.drafted",
        entityType: "SeeraJourneyPlan",
        entityId: plan.id,
        afterState: { employeeId: input.employeeId, territory: territory.name, beat: beat.name, geography: geography.name, dayOfWeek: input.dayOfWeek, retailerCount },
      });
      return { ...plan, retailerCount };
    }, { timeout: 15_000 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      throw new FoundationError("BEAT_PLAN_ALREADY_EXISTS", "A plan for this Executive, day and place already exists from this start date", 409);
    throw error;
  }
}

// Final closure (23-Aug), Part 1: the one place a plan's immutable retailer-stop membership gets
// created — called atomically with the SAME status change to PUBLISHED (same transaction) from
// both createBeatPlan's publish:true path and publishBeatPlan, so a plan can never end up
// PUBLISHED without its stops, or vice versa. Snapshots exactly the fields the Executive's read
// model (executiveBeat) needs to render a stop without re-deriving anything from the CURRENT
// (mutable) retailer record — sequence is businessName order, matching what the Manager already
// saw as the resolved retailer list at publish time.
async function createPlanStops(tx: Prisma.TransactionClient, planId: string, employeeId: string, matchWhere: Prisma.SeeraRetailerWhereInput) {
  const retailers = await tx.seeraRetailer.findMany({
    where: { salespersonId: employeeId, lifecycle: "ACTIVE", ...matchWhere },
    orderBy: { businessName: "asc" },
  });
  if (!retailers.length) return 0;
  const result = await tx.seeraJourneyPlanStop.createMany({
    data: retailers.map((r, index) => ({
      planId,
      retailerId: r.id,
      sequence: index + 1,
      retailerNameSnapshot: r.businessName,
      mobileSnapshot: r.mobile ?? r.normalizedMobile ?? undefined,
      addressSnapshot: r.address as Prisma.InputJsonValue,
      beatIdSnapshot: r.beatId,
      territoryIdSnapshot: r.territoryId,
      distributorIdSnapshot: r.distributorId,
    })),
  });
  return result.count;
}

async function ownedFuturePlan(prisma: PrismaClient, actorId: string, planId: string) {
  const plan = await prisma.seeraJourneyPlan.findFirst({ where: { id: planId, ownerId: actorId, status: { not: "CANCELLED" } } });
  if (!plan) throw new FoundationError("PLAN_SCOPE_DENIED", "Plan outside Manager scope", 403);
  if (plan.effectiveFrom <= new Date())
    throw new FoundationError("PLAN_NOT_FUTURE", "Only a future plan can be changed — its history is preserved as-is", 409);
  return plan;
}

export async function publishBeatPlan(prisma: PrismaClient, actorId: string, planId: string) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const plan = await prisma.seeraJourneyPlan.findFirst({ where: { id: planId, ownerId: actorId, status: "DRAFT" } });
  if (!plan) throw new FoundationError("PLAN_SCOPE_DENIED", "Draft plan not found in Manager scope", 403);
  const [geography, beat] = await Promise.all([
    prisma.seeraGeographyNode.findUnique({ where: { id: plan.geographyId } }),
    plan.beatId ? prisma.seeraGeographyNode.findUnique({ where: { id: plan.beatId } }) : null,
  ]);
  const matchWhere: Prisma.SeeraRetailerWhereInput = {
    OR: [
      ...(plan.beatId ? [{ beatId: plan.beatId }] : []),
      { marketId: plan.geographyId },
      ...(plan.territoryId ? [{ territoryId: plan.territoryId }] : []),
    ],
  };
  // Rule REVERSED (production closure pass): publishing with zero active retailers mapped is no
  // longer blocked — see createBeatPlan's own comment for the full rationale. Publish (status
  // change) + immutable stop snapshot creation still happen in ONE transaction — a plan can never
  // end up PUBLISHED without its stops (possibly zero of them) being created atomically with it.
  return prisma.$transaction(async (tx) => {
    const retailerCount = await tx.seeraRetailer.count({ where: { salespersonId: plan.employeeId, lifecycle: "ACTIVE", ...matchWhere } });
    const updated = await tx.seeraJourneyPlan.update({ where: { id: plan.id }, data: { status: "PUBLISHED" } });
    await createPlanStops(tx, plan.id, plan.employeeId, matchWhere);
    await tx.notification.create({
      data: {
        recipientId: plan.employeeId,
        title: "Beat plan published",
        body:
          retailerCount === 0
            ? `${beat?.name ?? geography?.name ?? "Your route"} has been published to your route plan — no retailers mapped yet.`
            : `${beat?.name ?? geography?.name ?? "Your route"} has been assigned to your route plan.`,
        type: "FOUNDATION",
        entityType: "SeeraJourneyPlan",
        entityId: plan.id,
        payload: { actionPath: "/portal/sales-executive/beat" },
      },
    });
    await recordAudit(tx, { actorId, action: "journey_plan.published", entityType: "SeeraJourneyPlan", entityId: plan.id, afterState: { retailerCount } });
    return { ...updated, retailerCount };
  }, { timeout: 15_000 });
}

export async function duplicateBeatPlan(
  prisma: PrismaClient,
  actorId: string,
  planId: string,
  input: { effectiveFrom: Date; effectiveTo?: Date },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const source = await prisma.seeraJourneyPlan.findFirst({ where: { id: planId, ownerId: actorId } });
  if (!source) throw new FoundationError("PLAN_SCOPE_DENIED", "Plan outside Manager scope", 403);
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
    throw new FoundationError("INVALID_EFFECTIVE_PERIOD", "End date cannot be before start date", 400);
  try {
    const plan = await prisma.seeraJourneyPlan.create({
      data: {
        employeeId: source.employeeId,
        dayOfWeek: source.dayOfWeek,
        geographyType: source.geographyType,
        geographyId: source.geographyId,
        territoryId: source.territoryId,
        beatId: source.beatId,
        distributorId: source.distributorId,
        distributorNameSnapshot: source.distributorNameSnapshot,
        notes: source.notes,
        status: "DRAFT",
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        ownerId: actorId,
      },
    });
    await recordAudit(prisma, { actorId, action: "journey_plan.duplicated", entityType: "SeeraJourneyPlan", entityId: plan.id, beforeState: { sourcePlanId: source.id } });
    return plan;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      throw new FoundationError("BEAT_PLAN_ALREADY_EXISTS", "A plan for this Executive, day and place already exists from this start date", 409);
    throw error;
  }
}

export async function editBeatPlan(
  prisma: PrismaClient,
  actorId: string,
  planId: string,
  input: { notes?: string; distributorName?: string; effectiveTo?: Date },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const plan = await ownedFuturePlan(prisma, actorId, planId);
  const { distributorId, distributorNameSnapshot } =
    input.distributorName === undefined
      ? { distributorId: plan.distributorId, distributorNameSnapshot: plan.distributorNameSnapshot }
      : await resolveDistributorByName(prisma, input.distributorName);
  const updated = await prisma.seeraJourneyPlan.update({
    where: { id: plan.id },
    data: { notes: input.notes, distributorId, distributorNameSnapshot, effectiveTo: input.effectiveTo },
  });
  await recordAudit(prisma, { actorId, action: "journey_plan.edited", entityType: "SeeraJourneyPlan", entityId: plan.id, beforeState: { notes: plan.notes, distributorId: plan.distributorId }, afterState: { notes: updated.notes, distributorId: updated.distributorId } });
  return updated;
}

export async function reassignBeatPlan(
  prisma: PrismaClient,
  actorId: string,
  planId: string,
  input: { employeeId: string; reason: string },
) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const plan = await ownedFuturePlan(prisma, actorId, planId);
  await assertTeamMember(prisma, actorId, input.employeeId);
  try {
    const updated = await prisma.seeraJourneyPlan.update({ where: { id: plan.id }, data: { employeeId: input.employeeId } });
    await recordAudit(prisma, { actorId, action: "journey_plan.reassigned", entityType: "SeeraJourneyPlan", entityId: plan.id, beforeState: { employeeId: plan.employeeId }, afterState: { employeeId: input.employeeId, reason: input.reason } });
    return updated;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      throw new FoundationError("BEAT_PLAN_ALREADY_EXISTS", "The new Executive already has a plan for this day and place", 409);
    throw error;
  }
}

export async function cancelBeatPlan(prisma: PrismaClient, actorId: string, planId: string, reason: string) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const plan = await ownedFuturePlan(prisma, actorId, planId);
  const updated = await prisma.seeraJourneyPlan.update({ where: { id: plan.id }, data: { status: "CANCELLED", cancelReason: reason } });
  await recordAudit(prisma, { actorId, action: "journey_plan.cancelled", entityType: "SeeraJourneyPlan", entityId: plan.id, afterState: { reason } });
  return updated;
}

export async function managerBeatPlans(prisma: PrismaClient, actorId: string, input: { employeeId?: string } = {}) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  const plans = await prisma.seeraJourneyPlan.findMany({
    where: { ownerId: actorId, ...(input.employeeId ? { employeeId: input.employeeId } : {}) },
    orderBy: { effectiveFrom: "desc" },
    take: 100,
  });
  const geoIds = [...new Set(plans.flatMap((p) => [p.geographyId, p.territoryId, p.beatId].filter((x): x is string => Boolean(x))))];
  const employeeIds = [...new Set(plans.map((p) => p.employeeId))];
  const [geographies, employees] = await Promise.all([
    prisma.seeraGeographyNode.findMany({ where: { id: { in: geoIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, email: true } }),
  ]);
  const geoName = new Map(geographies.map((g) => [g.id, g.name]));
  const empName = new Map(employees.map((e) => [e.id, e.name ?? e.email]));
  // Founder-final rule (23-Aug, "Before Publish show: Retailers in this plan: N"): computed for
  // every listed plan (not just at the moment of publish) so a Manager sees the gap on a DRAFT
  // before ever clicking Publish, not only as a rejection afterward. Same beatId/marketId/
  // territoryId matching createBeatPlan/publishBeatPlan/executiveBeat all already share.
  const retailerCounts = await Promise.all(
    plans.map((p) =>
      prisma.seeraRetailer.count({
        where: {
          salespersonId: p.employeeId,
          lifecycle: "ACTIVE",
          OR: [...(p.beatId ? [{ beatId: p.beatId }] : []), { marketId: p.geographyId }, ...(p.territoryId ? [{ territoryId: p.territoryId }] : [])],
        },
      }),
    ),
  );
  return plans.map((p, i) => ({
    ...p,
    employeeName: empName.get(p.employeeId) ?? p.employeeId,
    territoryName: p.territoryId ? geoName.get(p.territoryId) : undefined,
    beatName: p.beatId ? geoName.get(p.beatId) : undefined,
    geographyName: geoName.get(p.geographyId),
    isFuture: p.effectiveFrom > new Date(),
    retailerCount: retailerCounts[i],
  }));
}

export async function assignTarget(prisma: PrismaClient, actorId: string, input: { employeeId: string; periodType: "DAILY" | "WEEKLY" | "MONTHLY"; periodStart: Date; periodEnd: Date; metricType: string; skuId?: string; targetValue: number }) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (input.periodEnd <= input.periodStart || input.targetValue < 0) throw new FoundationError("INVALID_TARGET", "Invalid target period or value", 400);
  return prisma.seeraTarget.create({ data: { ...input, achievementBasis: "DELIVERED", assignedById: actorId } });
}

export async function recordCollection(prisma: PrismaClient, actorId: string, input: { retailerId: string; amount: number; paymentMode: string; reference?: string; proofFileId?: string; invoiceRef?: string; remarks?: string; idempotencyKey: string }) {
  await authorize(prisma, { actorId, permission: "collection:create" });
  const retailer = await prisma.seeraRetailer.findFirst({ where: { id: input.retailerId, salespersonId: actorId, lifecycle: "ACTIVE" } });
  if (!retailer) throw new FoundationError("RETAILER_SCOPE_DENIED", "Retailer scope denied", 403);
  if (input.amount <= 0) throw new FoundationError("INVALID_COLLECTION", "Collection amount must be positive", 400);
  if (input.paymentMode.trim().toUpperCase() === "CASH") throw new FoundationError("EXECUTIVE_CASH_PROHIBITED", "Sales Executives cannot accept cash. Record a bank, UPI or cheque reference instead.", 400);
  if (!input.reference?.trim()) throw new FoundationError("PAYMENT_REFERENCE_REQUIRED", "A bank, UPI or cheque reference is required", 400);
  return prisma.seeraCollectionEntry.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { ...input, actorId, sourcePortal: "sales-executive" } });
}

export async function captureMarketIntelligence(prisma: PrismaClient, actorId: string, input: { retailerId?: string; geographyId?: string; competitor: string; product?: string; price?: number; scheme?: string; retailerFeedback?: string; newLaunch?: string; shelfDisplay?: string; marketIssue?: string; workSessionId?: string }) {
  await authorize(prisma, { actorId, permission: "retailer:visit" });
  if (input.workSessionId) {
    const active = await prisma.seeraWorkSession.findFirst({ where: { id: input.workSessionId, employeeId: actorId, status: "ACTIVE" } });
    if (!active) throw new FoundationError("ACTIVE_WORKDAY_REQUIRED", "Active workday required", 409);
  }
  return prisma.seeraMarketIntelligence.create({ data: { ...input, actorId } });
}

export async function submitPaymentProof(prisma: PrismaClient, actorId: string, superStockistId: string, input: { orderId: string; amount: number; reference: string; fileId?: string; idempotencyKey: string }) {
  await authorize(prisma, { actorId, permission: "payment_proof:create" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const order = await prisma.seeraSalesOrder.findFirst({ where: { id: input.orderId, buyerPartnerId: superStockistId, type: "COMPANY_REPLENISHMENT" } });
  if (!order) throw new FoundationError("ORDER_SCOPE_DENIED", "Company order scope denied", 403);
  // Final closure (23-Aug), Part 17: a CANCELLED order must accept no further fulfilment action,
  // including a payment proof — cancelCompanyOrder (workflow-service.ts) already only permits
  // cancelling an order with no proof on file yet, so this closes the reverse direction.
  if (order.status === "CANCELLED") throw new FoundationError("ORDER_NOT_CANCELLABLE", "This order has been cancelled and can no longer accept a payment proof", 409);
  return prisma.seeraPaymentProof.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { orderId: order.id, amount: input.amount, reference: input.reference, fileId: input.fileId, status: "SUBMITTED", submittedById: actorId, idempotencyKey: input.idempotencyKey } });
}

export async function reviewPaymentProof(prisma: PrismaClient, actorId: string, input: { proofId: string; status: "UNDER_REVIEW" | "MATCHED" | "PARTIALLY_MATCHED" | "REJECTED" | "ADVANCE_HELD" | "VERIFIED"; reason: string }) {
  await authorize(prisma, { actorId, permission: "payment_proof:review" });
  return prisma.$transaction(async (tx) => {
    const proof = await tx.seeraPaymentProof.findUniqueOrThrow({ where: { id: input.proofId }, include: { order: true } });
    if (proof.submittedById === actorId) throw new FoundationError("PAYMENT_PROOF_SELF_REVIEW_DENIED", "Payment proof requires an independent reviewer", 403);
    if (input.status === "VERIFIED" && Number(proof.amount) < Number(proof.order.total)) throw new FoundationError("ADVANCE_PAYMENT_INSUFFICIENT", "Verified advance must cover the company order total", 409);
    if (input.status === "VERIFIED") {
      try {
        assertAdvanceOnlyCompanyOrder({ type: proof.order.type, creditDays: proof.order.contractualCreditDays, paymentProofStatus: "VERIFIED" });
      } catch (error) {
        throw new FoundationError("COMPANY_TO_SS_ADVANCE_ONLY_VIOLATION", error instanceof Error ? error.message : "Company replenishment must remain advance-payment-only", 409);
      }
    }
    const reviewed = await tx.seeraPaymentProof.update({ where: { id: proof.id }, data: { status: input.status, reviewReason: input.reason, reviewedById: actorId, reviewedAt: new Date() } });
    if (input.status === "VERIFIED") await tx.seeraSalesOrder.update({ where: { id: proof.orderId }, data: { status: "CONFIRMED", financialAcceptance: true } });
    return reviewed;
  });
}

export async function submitPartnerPayment(prisma:PrismaClient,actorId:string,input:{partnerType:"DISTRIBUTOR"|"SUPER_STOCKIST";partnerId:string;amount:number;reference:string;paymentMode:string;paymentDate:Date;proofId?:string;idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:"payment_proof:create"});
  await requirePartyMembership(prisma,actorId,input.partnerId,input.partnerType);
  if(input.amount<=0)throw new FoundationError("INVALID_PAYMENT_AMOUNT","Payment amount must be positive",400);
  const partner=await prisma.seeraPartner.findUniqueOrThrow({where:{id:input.partnerId}}),payeeId=input.partnerType==="DISTRIBUTOR"?partner.assignedSuperStockistId:"SEERA_COMPANY";
  if(!payeeId)throw new FoundationError("PAYEE_ASSIGNMENT_REQUIRED","Assigned Super Stockist is required",409);
  return prisma.$transaction(async(tx)=>{const duplicate=await tx.seeraPaymentRecord.findFirst({where:{reference:input.reference,payerId:input.partnerId,payeeId,paymentDate:input.paymentDate}});if(duplicate)throw new FoundationError("DUPLICATE_PAYMENT_REFERENCE","Duplicate UTR/payment reference",409);const payment=await tx.seeraPaymentRecord.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{paymentNumber:businessNumber("PAY",input.idempotencyKey),payerType:input.partnerType,payerId:input.partnerId,payeeType:input.partnerType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY",payeeId,amountClaimed:input.amount,unappliedAmount:0,reference:input.reference,paymentMode:input.paymentMode,paymentDate:input.paymentDate,proofId:input.proofId,status:"SUBMITTED",idempotencyKey:input.idempotencyKey}});await recordAudit(tx,{actorId,action:"payment.proof_submitted",entityType:"SeeraPaymentRecord",entityId:payment.id,afterState:{paymentNumber:payment.paymentNumber,payerType:payment.payerType,payerId:payment.payerId}});return payment;});
}

export async function submitPartnerClaim(prisma:PrismaClient,actorId:string,input:{partnerType:"DISTRIBUTOR"|"SUPER_STOCKIST";partnerId:string;type:string;sourceType?:string;sourceId?:string;details:Record<string,unknown>;idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:"distributor_claims:manage"});
  await requirePartyMembership(prisma,actorId,input.partnerId,input.partnerType);
  const partner=await prisma.seeraPartner.findUniqueOrThrow({where:{id:input.partnerId}}),againstPartyId=input.partnerType==="DISTRIBUTOR"?partner.assignedSuperStockistId:"SEERA_COMPANY";
  if(!againstPartyId)throw new FoundationError("CLAIM_COUNTERPARTY_REQUIRED","Claim counterparty is not assigned",409);
  const claim=await prisma.seeraClaim.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{claimNumber:businessNumber("CLM",input.idempotencyKey),claimantType:input.partnerType,claimantId:input.partnerId,againstPartyType:input.partnerType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY",againstPartyId,type:input.type,sourceType:input.sourceType,sourceId:input.sourceId,details:input.details as Prisma.InputJsonValue,actorId,idempotencyKey:input.idempotencyKey}});
  await recordAudit(prisma,{actorId,action:"claim.submitted",entityType:"SeeraClaim",entityId:claim.id,afterState:{claimNumber:claim.claimNumber,type:claim.type}});return claim;
}
