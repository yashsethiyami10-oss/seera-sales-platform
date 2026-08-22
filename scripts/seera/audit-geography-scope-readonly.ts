import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
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
  console.log(`[GUARD] role=${target.role} (READ-ONLY)`);
  const users = await db.user.findMany({
    where: { OR: [{ name: { contains: "manoj", mode: "insensitive" } }, { name: { contains: "neeraj", mode: "insensitive" } }, { name: { contains: "awdhesh", mode: "insensitive" } }] },
    select: { id: true, name: true, email: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { code: true, name: true } } } } },
  });
  console.log("\n=== USERS ===");
  console.log(JSON.stringify(users, null, 2));

  const userIds = users.map((u) => u.id);
  const territoryAssignments = await db.seeraAssignment.findMany({
    where: { assignmentType: "EXECUTIVE_TERRITORY", subjectId: { in: userIds }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  console.log("\n=== EXECUTIVE_TERRITORY assignments ===");
  console.log(JSON.stringify(territoryAssignments, null, 2));

  const managerTeam = await db.seeraAssignment.findMany({
    where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, OR: [{ subjectId: { in: userIds } }, { targetId: { in: userIds } }] },
  });
  console.log("\n=== MANAGER_TEAM assignments involving these users ===");
  console.log(JSON.stringify(managerTeam, null, 2));

  console.log("\n=== EMPLOYEE HEADQUARTERS === (table not yet migrated in production, skipped)");

  const territories = await db.seeraGeographyNode.findMany({ where: { level: "TERRITORY" }, select: { id: true, name: true, status: true } });
  console.log("\n=== ALL TERRITORY NODES ===");
  console.log(JSON.stringify(territories, null, 2));

  const beats = await db.seeraGeographyNode.findMany({ where: { level: "BEAT" }, select: { id: true, name: true, parentId: true, status: true } });
  console.log(`\n=== ALL BEAT NODES (${beats.length}) ===`);
  console.log(JSON.stringify(beats, null, 2));

  const partners = await db.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] } }, select: { id: true, legalName: true, tradeName: true, type: true, territoryIds: true, lifecycle: true } });
  console.log("\n=== DISTRIBUTOR / SS PARTNERS + territoryIds ===");
  console.log(JSON.stringify(partners, null, 2));

  const retailers = await db.seeraRetailer.findMany({ where: { salespersonId: { in: userIds } }, select: { id: true, businessName: true, salespersonId: true, territoryId: true, beatId: true, distributorId: true, lifecycle: true } });
  console.log("\n=== RETAILERS mapped to these users ===");
  console.log(JSON.stringify(retailers, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
