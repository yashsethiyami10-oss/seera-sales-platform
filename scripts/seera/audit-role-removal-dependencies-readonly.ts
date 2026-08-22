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

const MANOJ = "cmt15izjh000414bqeo4fxfd9";
const XYZ_DIST = "cmsty80dh0013814xph4nn1i5";
const ORPHAN_PRATEEK = "cmsty638f000s814xve2roz1h";

async function main() {
  console.log(`[GUARD] role=${target.role}`);

  console.log(`\n== MANOJ (${MANOJ}) as-manager dependency check ==`);
  const managerTeam = await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: MANOJ } });
  console.log(`SeeraAssignment rows where Manoj is the MANAGER target: ${managerTeam.length}`);
  for (const a of managerTeam) console.log(`  subjectId=${a.subjectId} effectiveFrom=${a.effectiveFrom.toISOString()} effectiveTo=${a.effectiveTo?.toISOString() ?? "null"}`);
  const journeyPlansOwned = await db.seeraJourneyPlan.count({ where: { ownerId: MANOJ } });
  console.log(`SeeraJourneyPlan rows Manoj created as Manager (ownerId): ${journeyPlansOwned}`);
  const jointWork = await db.seeraJointWork.count({ where: { managerId: MANOJ } });
  console.log(`SeeraJointWork rows where Manoj is managerId: ${jointWork}`);
  const managerOrders = await db.seeraSalesOrder.count({ where: { salespersonId: MANOJ, sourcePortal: "sales-manager" } });
  console.log(`SeeraSalesOrder rows Manoj placed as Manager (sourcePortal=sales-manager): ${managerOrders}`);
  const managerWorkSessions = await db.seeraWorkSession.count({ where: { employeeId: MANOJ, employeeRole: "SALES_MANAGER" } });
  console.log(`SeeraWorkSession rows Manoj worked as Manager: ${managerWorkSessions}`);
  const execWorkSessions = await db.seeraWorkSession.count({ where: { employeeId: MANOJ, employeeRole: "SALES_EXECUTIVE" } });
  console.log(`SeeraWorkSession rows Manoj worked as Executive: ${execWorkSessions}`);
  const execTeam = await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, subjectId: MANOJ } });
  console.log(`SeeraAssignment rows where Manoj is a TEAM MEMBER (subject) under some other Manager: ${execTeam.length}`);
  for (const a of execTeam) console.log(`  targetId(manager)=${a.targetId} effectiveFrom=${a.effectiveFrom.toISOString()} effectiveTo=${a.effectiveTo?.toISOString() ?? "null"}`);

  for (const [label, id] of [["XYZ distributor", XYZ_DIST], ["orphan PRATEEK", ORPHAN_PRATEEK]] as const) {
    console.log(`\n== ${label} (${id}) dependency check ==`);
    const orders = await db.seeraSalesOrder.count({ where: { actorId: id } });
    const sessions = await db.seeraWorkSession.count({ where: { employeeId: id } });
    const audits = await db.auditLog.count({ where: { actorId: id } });
    const roleAssignments = await db.userRoleAssignment.findMany({ where: { userId: id, status: "ACTIVE" }, include: { role: true } });
    console.log(`  orders actorId=${orders}, workSessions=${sessions}, auditLog rows=${audits}`);
    console.log(`  active role assignments: ${roleAssignments.map((r) => r.role.code).join(", ") || "none"}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
