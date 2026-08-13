import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createDistributorForSuperStockist } from "../../lib/sales-distribution/distributor-management-service";

// STAGE 4 smoke test — Founder can onboard a Distributor for an S.S. it is NOT a registered party
// member of (the same reachability class of bug already fixed for decideReturnRequest). Founder
// holds distributor_credit:manage via PHASE_1_PERMISSIONS but was never a SeeraPartyUser of any
// specific S.S. — this proves the new system:super_admin bypass actually works, without weakening
// the check for a normal S.S. Owner (regression-checked separately via phase2-5 integration).

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const ss2 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-02" } });
  const founderIsMember = await db.seeraPartyUser.findFirst({ where: { userId: founder.id, partnerId: ss2.id } });
  assert(!founderIsMember, "sanity check: Founder should NOT be a registered party member of IV26-SS-02 for this test to prove anything");

  const { partner } = await createDistributorForSuperStockist(db, founder.id, ss2.id, {
    firmName: `Stage4 Founder-Onboarded Distributor ${suffix}`,
    address: { city: "Bengaluru", state: "Karnataka" },
    mobile: `93${String(suffix).slice(-8)}`,
    creditEnabled: true,
    creditLimit: 75000,
    creditDays: 21,
    idempotencyKey: `s4-founder-dist-${suffix}`,
  });
  assert(partner.assignedSuperStockistId === ss2.id, "expected the new Distributor to be correctly assigned to IV26-SS-02");
  console.log(`[1] OK — Founder onboarded a Distributor (${partner.code}) for an S.S. it was never personally a party member of — Stage 4 "Distributor CRUD" gap closed`);

  console.log("\nALL STAGE 4 FOUNDER DISTRIBUTOR-ONBOARDING SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
