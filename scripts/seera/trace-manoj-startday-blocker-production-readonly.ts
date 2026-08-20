import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// STRICTLY READ-ONLY. Traces Manoj Vijayvargiya's exact current production state before the
// Company Direct Start Day fix — no name/id hardcoded logic anywhere in the actual fix, this
// script is diagnostic only, per the Founder's own explicit "First trace current production state"
// instruction.

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
const prisma = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const manoj = await prisma.user.findFirst({
    where: { OR: [{ name: { contains: "Manoj", mode: "insensitive" } }, { name: { contains: "Vijayvargiya", mode: "insensitive" } }] },
    include: { roleAssignments: { where: { status: "ACTIVE" }, include: { role: true } } },
  });
  if (!manoj) { console.log("Manoj user NOT FOUND"); return; }
  console.log(`\nManoj: id=${manoj.id} name=${manoj.name} status=${manoj.status}`);
  console.log(`Roles: ${manoj.roleAssignments.map((r) => r.role.code).join(", ")}`);

  const now = new Date();
  const territoryAssignment = await prisma.seeraAssignment.findFirst({
    where: { assignmentType: "EXECUTIVE_TERRITORY", subjectId: manoj.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
  });
  console.log(`\nBhilwara/territory assignment: ${territoryAssignment ? `present -> targetId=${territoryAssignment.targetId}` : "NONE"}`);
  if (territoryAssignment) {
    const territory = await prisma.seeraGeographyNode.findUnique({ where: { id: territoryAssignment.targetId } });
    console.log(`  Territory: ${territory ? `${territory.name} (${territory.level}, status=${territory.status})` : "NOT FOUND"}`);
  }

  const cdEligibility = await prisma.seeraAssignment.findFirst({
    where: { assignmentType: "COMPANY_DIRECT_ELIGIBLE", subjectId: manoj.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
  });
  console.log(`\nCompany Direct eligibility: ${cdEligibility ? `ACTIVE (since ${cdEligibility.effectiveFrom.toISOString()}, reason="${cdEligibility.reason}")` : "NOT GRANTED"}`);

  const cdPartner = await prisma.seeraPartner.findFirst({ where: { type: "COMPANY_DIRECT" } });
  console.log(`\nCompany Direct singleton partner: ${cdPartner ? `EXISTS (id=${cdPartner.id}, legalName=${cdPartner.legalName}, lifecycle=${cdPartner.lifecycle})` : "DOES NOT EXIST"}`);

  const activeSession = await prisma.seeraWorkSession.findFirst({ where: { employeeId: manoj.id, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" } });
  console.log(`\nManoj's current active work session: ${activeSession ? `id=${activeSession.id}, workingType=${activeSession.workingType}, workingDistributorId=${activeSession.workingDistributorId ?? "null"}` : "none"}`);

  // Reproduce the exact resolution executiveAuthorizedDistributors performs, without the
  // Company-Direct addition, to show precisely what the CURRENT deployed code returns for Manoj.
  const managerTeam = await prisma.seeraAssignment.findFirst({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, subjectId: manoj.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
  const directAssignments = await prisma.seeraAssignment.findMany({ where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: manoj.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
  const ownRetailerDistributors = await prisma.seeraRetailer.findMany({ where: { salespersonId: manoj.id, distributorId: { not: null } }, select: { distributorId: true }, distinct: ["distributorId"] });
  console.log(`\nBEFORE FIX — what executiveAuthorizedDistributors currently returns for Manoj:`);
  console.log(`  Manager-team assignment: ${managerTeam ? "present" : "none"}`);
  console.log(`  Direct EXECUTIVE_DISTRIBUTOR assignments: ${directAssignments.length}`);
  console.log(`  Own retailer-derived distributorIds: ${ownRetailerDistributors.length}`);
  const totalAuthorizedToday = directAssignments.length + ownRetailerDistributors.length;
  console.log(`  => Authorized (type=DISTRIBUTOR only) count: ${totalAuthorizedToday} ${totalAuthorizedToday === 0 ? "<-- THIS IS WHY distributorOptions IS EMPTY, WHICH IS THE BLOCKING CONDITION" : ""}`);

  // AFTER FIX — the actual, currently-deployed executiveAuthorizedDistributors() function itself,
  // live against real production data. This is the exact function Start Day's distributorOptions
  // and startFieldDay's own server-side authorization both read.
  const liveAuthorized = await executiveAuthorizedDistributors(prisma, manoj.id);
  console.log(`\nAFTER FIX — live executiveAuthorizedDistributors(prisma, manoj.id) result:`);
  console.log(`  count: ${liveAuthorized.length}`);
  for (const d of liveAuthorized) console.log(`    ${d.id} | ${d.legalName}${d.id === cdPartner?.id ? "  <-- Company Direct" : ""}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
