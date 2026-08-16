import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createSuperStockist } from "../../lib/sales-distribution/distributor-management-service";
import { bulkOnboardRatanDistributors } from "../../lib/sales-distribution/ratan-onboarding-service";

// TEST-only proof for the governed one-time Ratan Products & Traders bulk onboarding action before
// it is ever run against production: (1) full 10-row creation succeeds, (2) rerunning it is a true
// no-op (0 new Partners/Users/memberships, all rows RECONCILED), (3) cross-distributor data
// isolation holds between the two same-named "Sahu Kirana" rows specifically.

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
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  let ss = await db.seeraPartner.findFirst({ where: { type: "SUPER_STOCKIST", legalName: "M/s Ratan Products & Traders" } });
  if (!ss) {
    ss = await createSuperStockist(db, founder.id, {
      firmName: "M/s Ratan Products & Traders",
      address: { line: "Test fixture address", city: "Jhansi", state: "Uttar Pradesh" },
      mobile: "9000000000",
      idempotencyKey: `test-ratan-ss-${Date.now()}`,
    });
    console.log(`[SETUP] Created TEST-only "M/s Ratan Products & Traders" Super Stockist (${ss.id})`);
  } else {
    console.log(`[SETUP] Reusing existing TEST "M/s Ratan Products & Traders" Super Stockist (${ss.id})`);
  }

  const partnerCountBefore = await db.seeraPartner.count({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id } });
  const userCountBefore = await db.user.count();

  const firstRun = await bulkOnboardRatanDistributors(db, founder.id);
  assert(firstRun.length === 10, `expected 10 rows, got ${firstRun.length}`);
  const created = firstRun.filter((r) => r.status === "CREATED");
  const conflicts = firstRun.filter((r) => r.status === "CONFLICT");
  assert(conflicts.length === 0, `expected 0 conflicts on first run, got ${JSON.stringify(conflicts)}`);
  assert(created.length >= 1, "expected at least some rows CREATED on first run (all pre-existing would be suspicious)");
  for (const row of firstRun) {
    assert(row.partnerId, `row ${row.firm} missing partnerId`);
    assert(row.userId, `row ${row.firm} missing userId`);
    assert(row.loginEmail?.startsWith("dist."), `row ${row.firm} login email not in dist.<mobile>@seera.local form: ${row.loginEmail}`);
  }
  console.log(`[1] OK — first run: ${created.length} created, 0 conflicts, all 10 rows have partner+user+login`);

  const partnerCountAfterFirst = await db.seeraPartner.count({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id } });
  assert(partnerCountAfterFirst === partnerCountBefore + created.length, "distributor count did not increase by exactly the number of newly created rows");

  const secondRun = await bulkOnboardRatanDistributors(db, founder.id);
  const secondCreated = secondRun.filter((r) => r.status === "CREATED");
  const secondReconciled = secondRun.filter((r) => r.status === "RECONCILED");
  assert(secondCreated.length === 0, `rerun must create 0 new rows, got ${secondCreated.length}`);
  assert(secondReconciled.length === 10, `rerun must reconcile all 10 rows, got ${secondReconciled.length}`);
  console.log("[2] OK — second run (idempotency): 0 newly created, all 10 RECONCILED");

  const partnerCountAfterSecond = await db.seeraPartner.count({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id } });
  const userCountAfterSecond = await db.user.count();
  assert(partnerCountAfterSecond === partnerCountAfterFirst, "rerun must not create duplicate Partner rows");
  assert(userCountAfterSecond === userCountBefore + created.length, "rerun must not create duplicate User rows");
  console.log(`[3] OK — 0 duplicate Partners, 0 duplicate Users across rerun (partners=${partnerCountAfterSecond}, new users=${userCountAfterSecond - userCountBefore})`);

  const mahroni = firstRun.find((r) => r.town === "Mahroni")!;
  const madawra = firstRun.find((r) => r.town === "Madawra")!;
  assert(mahroni.partnerId !== madawra.partnerId, "the two 'Sahu Kirana' rows must be distinct Partner records");
  assert(mahroni.userId !== madawra.userId, "the two 'Sahu Kirana' rows must have distinct User logins");
  const mahroniPartner = await db.seeraPartner.findUniqueOrThrow({ where: { id: mahroni.partnerId! } });
  const madawraPartner = await db.seeraPartner.findUniqueOrThrow({ where: { id: madawra.partnerId! } });
  const mahroniCity = (mahroniPartner.addresses as { city?: string } | null)?.city;
  const madawraCity = (madawraPartner.addresses as { city?: string } | null)?.city;
  assert(mahroniCity === "Mahroni" && madawraCity === "Madawra", `town disambiguation data missing on the two Sahu Kirana rows: ${mahroniCity} / ${madawraCity}`);
  console.log("[4] OK — the two same-named 'Sahu Kirana' distributors are distinct Partners+Users with distinct Town data");

  const mahroniMembership = await db.seeraPartyUser.findFirst({ where: { partnerId: mahroni.partnerId!, userId: mahroni.userId!, active: true } });
  const madawraSeesMahroni = await db.seeraPartyUser.findFirst({ where: { partnerId: mahroni.partnerId!, userId: madawra.userId! } });
  assert(mahroniMembership, "Mahroni user must have active membership on its own partner");
  assert(!madawraSeesMahroni, "Madawra's user must have no membership at all on Mahroni's partner");
  console.log("[5] OK — cross-distributor membership isolation holds (Madawra user has zero rows against Mahroni's partner)");

  console.log("\nALL RATAN BULK ONBOARD SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
