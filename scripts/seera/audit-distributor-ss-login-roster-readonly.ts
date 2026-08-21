import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Production Distributor/Super Stockist portal-user roster for the P0 login
// investigation. NEVER prints passwordHash itself — presence only. NEVER modifies any row.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const roles = await db.role.findMany({ where: { code: { in: ["DISTRIBUTOR_OWNER", "DISTRIBUTOR_OPERATOR", "SUPER_STOCKIST_OWNER", "SUPER_STOCKIST_OPERATOR"] } } });
  console.log(`\n== ROLES FOUND ==`);
  for (const r of roles) console.log(`  id=${r.id} code=${r.code}`);

  const assignments = await db.userRoleAssignment.findMany({
    where: { roleId: { in: roles.map((r) => r.id) } },
    include: { user: true, role: true },
    orderBy: { assignedAt: "desc" },
  });
  console.log(`\n== ROLE ASSIGNMENTS (${assignments.length}) ==`);
  for (const a of assignments) {
    console.log(JSON.stringify({
      userId: a.user.id,
      name: a.user.name,
      normalizedEmail: a.user.normalizedEmail,
      phone: a.user.phone,
      userStatus: a.user.status,
      hasPasswordHash: Boolean(a.user.passwordHash),
      lastLoginAt: a.user.lastLoginAt?.toISOString() ?? null,
      authorizationVersion: a.user.authorizationVersion,
      roleCode: a.role.code,
      assignmentStatus: a.status,
      assignedAt: a.assignedAt.toISOString(),
      scopeType: a.scopeType,
      scopeId: a.scopeId,
    }));
  }

  // Cross-check: any SeeraPartner (DISTRIBUTOR/SUPER_STOCKIST) with NO active role-assignment
  // pointing at it at all — an orphaned partner nobody can actually log in for.
  const partners = await db.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, lifecycle: "ACTIVE" }, select: { id: true, legalName: true, type: true } });
  console.log(`\n== ACTIVE DISTRIBUTOR/S.S. PARTNERS (${partners.length}) ==`);
  const assignedScopeIds = new Set(assignments.filter((a) => a.status === "ACTIVE").map((a) => a.scopeId));
  for (const p of partners) {
    console.log(`  id=${p.id} name=${p.legalName} type=${p.type} hasActiveLoginAssignment=${assignedScopeIds.has(p.id)}`);
  }

  // Recent login audit trail for these users, to see actual recent failures/successes.
  const userIds = assignments.map((a) => a.user.id);
  const recentAudit = await db.auditLog.findMany({
    where: { actorId: { in: userIds }, action: { in: ["auth.login", "auth.login_failed", "auth.login_denied"] } },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });
  console.log(`\n== RECENT LOGIN AUDIT EVENTS (${recentAudit.length}) ==`);
  for (const a of recentAudit) {
    console.log(`  ${a.occurredAt.toISOString()} actorId=${a.actorId} action=${a.action} outcome=${a.outcome} reason=${a.reason ?? ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
