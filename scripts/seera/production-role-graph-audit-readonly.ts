import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// READ-ONLY production audit (Section D of the directive): re-verify current
// MANAGER_TEAM and EXECUTIVE_DISTRIBUTOR assignment state fresh rather than
// assuming prior-report state, and investigate the duplicate "NEERAJ RAWAT"
// Sales Executive accounts surfaced by the End Day audit. No writes.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: envFile(path.join(root, ".env.test")).TEST_DATABASE_URL });
const runtime = new URL(production);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} write=false (READ-ONLY)`);

  console.log("\n=== Both NEERAJ RAWAT accounts: full detail ===");
  const neerajs = await db.user.findMany({
    where: { name: { contains: "NEERAJ RAWAT", mode: "insensitive" } },
    include: { roleAssignments: { where: { status: "ACTIVE" }, include: { role: true } } },
  });
  for (const u of neerajs) {
    console.log(`\n  user ${u.id}`);
    console.log(`    email=${u.email} normalizedEmail=${u.normalizedEmail} status=${u.status} createdAt=${u.createdAt.toISOString()}`);
    console.log(`    roles: ${u.roleAssignments.map((r) => r.role.code).join(", ") || "(none)"}`);
    const partnerMemberships = await db.seeraPartyUser.findMany({ where: { userId: u.id }, select: { active: true, partnerId: true, accessRole: true } });
    console.log(`    seeraPartyUser memberships: ${JSON.stringify(partnerMemberships)}`);
  }

  console.log("\n=== MANAGER_TEAM assignments (active) ===");
  const managerTeam = await db.seeraAssignment.findMany({
    where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  for (const a of managerTeam) {
    const subject = await db.user.findUnique({ where: { id: a.subjectId }, select: { name: true, email: true } });
    const targetUser = await db.user.findUnique({ where: { id: a.targetId }, select: { name: true, email: true } });
    console.log(`  id=${a.id} type=${a.assignmentType} subject(manager)=${a.subjectId} (${subject?.name ?? "?"}) target(employee)=${a.targetId} (${targetUser?.name ?? "?"}) effectiveFrom=${a.effectiveFrom.toISOString()} effectiveTo=${a.effectiveTo?.toISOString() ?? "null"}`);
  }

  console.log("\n=== EXECUTIVE_DISTRIBUTOR assignments (active), grouped by subject ===");
  const execDist = await db.seeraAssignment.findMany({
    where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  const bySubject = new Map<string, number>();
  for (const a of execDist) bySubject.set(a.subjectId, (bySubject.get(a.subjectId) ?? 0) + 1);
  for (const [subjectId, count] of bySubject) {
    const subject = await db.user.findUnique({ where: { id: subjectId }, select: { name: true, email: true } });
    console.log(`  subject=${subjectId} (${subject?.name ?? "?"} / ${subject?.email ?? "?"}) -> ${count} distributor(s)`);
  }
  if (!execDist.length) console.log("  (none)");

  console.log("\n=== Ratan Super Stockist -> Distributor count ===");
  const ratanSS = await db.seeraPartner.findFirst({ where: { type: "SUPER_STOCKIST", legalName: { contains: "Ratan", mode: "insensitive" } } });
  if (ratanSS) {
    const distributors = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ratanSS.id, lifecycle: "ACTIVE" }, select: { id: true, legalName: true, tradeName: true } });
    console.log(`  Ratan SS id=${ratanSS.id} legalName=${ratanSS.legalName}`);
    console.log(`  Active distributors under Ratan: ${distributors.length}`);
    for (const d of distributors) console.log(`    ${d.id} ${d.tradeName ?? d.legalName}`);
  } else {
    console.log("  Ratan Super Stockist not found");
  }
}

main().finally(() => db.$disconnect());
