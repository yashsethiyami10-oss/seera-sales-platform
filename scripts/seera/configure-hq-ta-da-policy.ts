import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classifyDatabaseTarget } from "../../lib/database/identity-guard";
import { configureEmployeeHeadquarters, configureTravelPolicy, configureDaPolicy } from "../../lib/sales-distribution/travel-claim-service";

// FOUNDER FINAL GPS/TA/DA POLICY CONFIGURATION (25-Aug). Idempotent — safe to re-run against either
// TEST or (with explicit confirmation) PRODUCTION; each governed create is skipped if an equivalent
// active row already exists. Uses the SAME governed service functions the app itself uses
// (configureEmployeeHeadquarters / configureTravelPolicy / configureDaPolicy) — never a raw DB
// write — so every row this creates carries the same authorize()/recordAudit() trail a real
// Founder-driven config screen would produce.
//
// Requires explicit confirmation to write to PRODUCTION: `--confirm-production-write` AND
// SEERA_ALLOW_PRODUCTION_TRAVEL_POLICY_SEED=confirm — same pattern as
// deploy-seed-production-foundation.ts, deliberately narrow to this one purpose.

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
const intendedRole = process.argv.includes("--production") ? "production" : "test";
const targetUrl = intendedRole === "production" ? production : test;
const target = classifyDatabaseTarget({ targetUrl, productionUrl: production, testUrl: test });
if (target.role !== intendedRole) throw new Error(`Refusing to run: resolved database role (${target.role}) does not match --production flag intent (${intendedRole})`);
if (target.role === "production") {
  if (!process.argv.includes("--confirm-production-write")) { console.error("Refusing to run: pass --confirm-production-write to acknowledge this writes to the PRODUCTION database."); process.exit(1); }
  if (process.env.SEERA_ALLOW_PRODUCTION_TRAVEL_POLICY_SEED !== "confirm") { console.error("Refusing to run: set SEERA_ALLOW_PRODUCTION_TRAVEL_POLICY_SEED=confirm to acknowledge this configures live GPS/TA/DA policy on PRODUCTION."); process.exit(1); }
}

const prisma = new PrismaClient({ datasourceUrl: targetUrl });

const EMPLOYEES = {
  NEERAJ_RAWAT: { userId: "cmswmy5je00079oa9nffc08wp", hqName: "JHANSI DIVISION", hqGeographyId: "cmt305yiz0034er0p2rcf1g5m", fullDayDa: 150 },
  MANOJ_VIJAYVARGIYA: { userId: "cmt15izjh000414bqeo4fxfd9", hqName: "BHILWARA", hqGeographyId: "cmt17fsn20000w12fba6unp4i", fullDayDa: 300 },
  AWDHESH_KUMAR_MISHRA: { userId: "cmstxqe9u0000gudquhbd30nl", hqName: "JHANSI DIVISION", hqGeographyId: "cmt305yiz0034er0p2rcf1g5m", fullDayDa: 300 },
} as const;

const EFFECTIVE_FROM = new Date("2026-08-25T00:00:00.000Z"); // Founder approval date for this policy pass

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "FOUNDER_SUPER_ADMIN" } } } } });
  console.log(`Acting as Founder: ${founder.name ?? founder.email} (${founder.id})`);

  console.log("\n=== 1. TA Travel Policy — PER_KM ₹2/km, SALES_EXECUTIVE + SALES_MANAGER ===");
  for (const role of ["SALES_EXECUTIVE", "SALES_MANAGER"] as const) {
    const existing = await prisma.seeraTravelPolicy.findFirst({ where: { employeeRole: role, policyType: "PER_KM", status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
    if (existing && Number(existing.ratePerKm) === 2) { console.log(`  SKIP ${role}: already has an active PER_KM ₹2/km policy (${existing.id})`); continue; }
    const policy = await configureTravelPolicy(prisma, founder.id, { employeeRole: role, vehicleType: "STANDARD_FIELD", policyType: "PER_KM", ratePerKm: 2, effectiveFrom: EFFECTIVE_FROM, status: "ACTIVE" });
    console.log(`  CREATED ${role}: ${policy.id} — PER_KM ₹2/km effective ${policy.effectiveFrom.toISOString()}`);
  }

  console.log("\n=== 2. Employee HQ + DA Policy ===");
  for (const [label, cfg] of Object.entries(EMPLOYEES)) {
    console.log(`\n--- ${label} ---`);
    const existingHq = await prisma.seeraEmployeeHeadquarters.findFirst({ where: { employeeId: cfg.userId, status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
    if (existingHq) console.log(`  SKIP HQ: already has an active HQ (${existingHq.headquartersName}, ${existingHq.id})`);
    else {
      const hq = await configureEmployeeHeadquarters(prisma, founder.id, { employeeId: cfg.userId, headquartersName: cfg.hqName, geographyId: cfg.hqGeographyId, effectiveFrom: EFFECTIVE_FROM, reason: "Founder final GPS/TA/DA policy configuration, 25-Aug" });
      console.log(`  CREATED HQ: ${hq.id} — ${hq.headquartersName}`);
    }

    const existingDa = await prisma.seeraDaPolicy.findFirst({ where: { employeeId: cfg.userId, policyType: "FULL_DAY", status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
    if (existingDa && Number(existingDa.amount) === cfg.fullDayDa) console.log(`  SKIP DA: already has an active FULL_DAY ₹${cfg.fullDayDa} policy (${existingDa.id})`);
    else {
      const da = await configureDaPolicy(prisma, founder.id, { employeeId: cfg.userId, policyType: "FULL_DAY", amount: cfg.fullDayDa, effectiveFrom: EFFECTIVE_FROM, status: "ACTIVE" });
      console.log(`  CREATED DA: ${da.id} — FULL_DAY ₹${da.amount}`);
    }
  }

  console.log("\n=== DONE ===");
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exitCode = 1; });
