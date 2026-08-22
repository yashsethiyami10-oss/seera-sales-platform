import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Investigates the Founder-reported bug: a Manager publishes a
// Beat/Route Plan (SeeraJourneyPlan) for a Sales Executive, but the Executive never sees it
// in their own portal. Confirms whether real PUBLISHED plan rows exist in production, whether
// their `employeeId` resolves to a real, ACTIVE, EXECUTIVE-role User, and whether the plan
// data itself (dayOfWeek/effectiveFrom/effectiveTo/geographyId) would actually be returned by
// the existing employeeId-scoped Executive read path in lib/sales-distribution/field-portal-service.ts
// (executiveBeat / executiveDashboard). Never mutates anything. Never touches MUV.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
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

  const publishedPlans = await db.seeraJourneyPlan.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`\n== PUBLISHED SeeraJourneyPlan rows in production (${publishedPlans.length}) ==`);
  for (const p of publishedPlans) {
    console.log(
      `  id=${p.id} employeeId=${p.employeeId} ownerId=${p.ownerId} dayOfWeek=${p.dayOfWeek} status=${p.status} ` +
      `geographyType=${p.geographyType} geographyId=${p.geographyId} territoryId=${p.territoryId} beatId=${p.beatId} ` +
      `effectiveFrom=${p.effectiveFrom.toISOString()} effectiveTo=${p.effectiveTo ? p.effectiveTo.toISOString() : "null"} notes=${JSON.stringify(p.notes)}`,
    );
  }

  const targetEmployeeId = "cmswmy5je00079oa9nffc08wp";
  const livePlans = await db.seeraJourneyPlan.findMany({ where: { employeeId: targetEmployeeId }, orderBy: { createdAt: "desc" } });
  console.log(`\n== ALL SeeraJourneyPlan rows for employeeId=${targetEmployeeId} (${livePlans.length}) ==`);
  for (const p of livePlans) {
    console.log(
      `  id=${p.id} status=${p.status} dayOfWeek=${p.dayOfWeek} geographyId=${p.geographyId} territoryId=${p.territoryId} beatId=${p.beatId} ` +
      `effectiveFrom=${p.effectiveFrom.toISOString()} effectiveTo=${p.effectiveTo ? p.effectiveTo.toISOString() : "null"} notes=${JSON.stringify(p.notes)}`,
    );
  }

  const user = await db.user.findUnique({ where: { id: targetEmployeeId } });
  console.log(`\n== USER RESOLUTION for employeeId=${targetEmployeeId} ==`);
  if (!user) {
    console.log(`  NO USER FOUND with this id — employeeId does NOT resolve to a real User.id.`);
  } else {
    console.log(`  id=${user.id} name=${user.name} email=${user.email} status=${user.status} phone=${user.phone}`);
    const roleAssignments = await db.userRoleAssignment.findMany({
      where: { userId: user.id },
      include: { role: true },
      orderBy: { assignedAt: "desc" },
    });
    console.log(`  Role assignments (${roleAssignments.length}):`);
    for (const ra of roleAssignments) {
      const active = ra.status === "ACTIVE" && ra.effectiveFrom <= new Date() && (!ra.effectiveTo || ra.effectiveTo > new Date());
      console.log(
        `    roleCode=${ra.role.code} roleStatus=${ra.role.status} assignmentStatus=${ra.status} effectiveFrom=${ra.effectiveFrom.toISOString()} ` +
        `effectiveTo=${ra.effectiveTo ? ra.effectiveTo.toISOString() : "null"} -> currentlyActive=${active}`,
      );
    }
  }

  // Simulate the exact where-clause used by executiveBeat()/executiveDashboard() in
  // lib/sales-distribution/field-portal-service.ts, for each of the found PUBLISHED plans' own
  // employeeId, across all 7 days (i.e. what a "week" range request would return) as of NOW.
  console.log(`\n== SIMULATING EXECUTIVE READ PATH (executiveBeat/-Dashboard where-clause) ==`);
  const now = new Date();
  for (const p of publishedPlans) {
    const wouldMatchAnyDay = await db.seeraJourneyPlan.findMany({
      where: {
        employeeId: p.employeeId,
        dayOfWeek: { in: [0, 1, 2, 3, 4, 5, 6] },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    });
    const matchesThisPlan = wouldMatchAnyDay.some((x) => x.id === p.id);
    console.log(`  plan id=${p.id} employeeId=${p.employeeId} -> executiveBeat("week") would return this plan: ${matchesThisPlan}`);
  }

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
