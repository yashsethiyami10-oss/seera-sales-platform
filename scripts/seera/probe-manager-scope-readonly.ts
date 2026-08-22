import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Confirms AWDHESH KUMAR MISHRA's team has a direct EXECUTIVE_DISTRIBUTOR
// assignment reaching Kuldeep Jha's distributor partner, and checks unassigned-order team scope.

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
  console.log(`[GUARD] role=${target.role}`);
  const manager = await db.user.findFirstOrThrow({ where: { name: { contains: "AWDHESH", mode: "insensitive" } } });
  const team = await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: manager.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
  const employeeIds = [...new Set(team.map((t) => t.subjectId))];
  console.log(`Manager ${manager.name} team employeeIds: ${JSON.stringify(employeeIds)}`);

  const distAssignments = await db.seeraAssignment.findMany({ where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: { in: employeeIds }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
  const distIds = [...new Set(distAssignments.map((a) => a.targetId))];
  const distributors = await db.seeraPartner.findMany({ where: { id: { in: distIds } }, select: { id: true, legalName: true, lifecycle: true } });
  console.log(`\nDirect EXECUTIVE_DISTRIBUTOR assignments reachable by this team's executives (${distributors.length}):`);
  for (const d of distributors) console.log(`  id=${d.id} name=${d.legalName} lifecycle=${d.lifecycle}${d.id === "cmsvy1mj0004s1154q0fc8urs" ? "  <-- KULDEEP JHA" : ""}`);

  const unassigned = await db.seeraSalesOrder.count({ where: { type: "RETAILER_ORDER", sellerPartnerId: null, salespersonId: { in: [manager.id, ...employeeIds] } } });
  console.log(`\nUnassigned RETAILER_ORDER rows within this manager's own salesperson scope: ${unassigned}`);
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
