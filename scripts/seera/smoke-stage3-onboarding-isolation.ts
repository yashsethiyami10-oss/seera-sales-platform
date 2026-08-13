import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createUser, assignRole, grantPartyMembership, revokePartyMembership } from "../../lib/foundation/user-management-service";
import { createSuperStockist, createDistributorForSuperStockist } from "../../lib/sales-distribution/distributor-management-service";
import { superStockistDashboardSummary } from "../../lib/sales-distribution/super-stockist-easy-mode-service";
import { distributorDashboardSummary } from "../../lib/sales-distribution/distributor-easy-mode-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 3 smoke test — production-style Partner Onboarding + Isolation, NO seed scripts:
//  1. Founder creates a brand-new Super Stockist (createSuperStockist) — a party that never existed
//     in any seed fixture.
//  2. Founder creates a brand-new login (createUser), assigns SUPER_STOCKIST_OWNER (assignRole),
//     and grants party membership to the new S.S. (grantPartyMembership) — the actual missing
//     onboarding step this Stage closes.
//  3. That new login can immediately use real S.S. functions scoped to the new party — no seed
//     script touched it.
//  4. The new S.S. onboards its own new Distributor (createDistributorForSuperStockist, already
//     existing) and the SAME onboarding chain (createUser -> assignRole -> grantPartyMembership)
//     gives that Distributor a working login too.
//  5. Isolation: the brand-new S.S./Distributor logins cannot see the EXISTING seeded IV26-SS-01
//     network, and vice versa — proven with two logins that were never seeded together.
//  6. revokePartyMembership actually removes access (not just marks a flag nobody checks).
// Safe to re-run: fresh idempotency keys / emails per run.

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
runtime.searchParams.set("connection_limit", "6");
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
  const existingSs1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });

  // ============= 1. Founder creates a brand-new Super Stockist =============
  const newSs = await createSuperStockist(db, founder.id, {
    firmName: `Stage3 Onboarded Super Stockist ${suffix}`,
    tradeName: "Stage3 Fresh Hub",
    address: { city: "Pune", state: "Maharashtra" },
    mobile: `95${String(suffix).slice(-8)}`,
    ownerName: "Fresh Owner",
    gstin: "27ABCDE9999F1Z9",
    idempotencyKey: `s3-newss-${suffix}`,
  });
  assert(newSs.type === "SUPER_STOCKIST" && newSs.lifecycle === "ACTIVE", "expected a real, active SUPER_STOCKIST partner created via application code, not a seed script");
  console.log(`[1] OK — Founder created a brand-new Super Stockist (${newSs.code}) through application code — no seed script involved`);

  // ============= 2. Onboard a working login for it =============
  const newSsUser = await createUser(db, founder.id, { email: `stage3-ss-${suffix}@seera.test`, name: "Stage3 Fresh S.S. Owner", password: "Stage3OnboardingTest!2026" });
  await assignRole(db, founder.id, newSsUser.id, "SUPER_STOCKIST_OWNER", "Stage 3 onboarding smoke test");
  const membership = await grantPartyMembership(db, founder.id, { partnerId: newSs.id, userId: newSsUser.id, accessRole: "OWNER" });
  assert(membership.active, "expected the new party membership to be active immediately");
  console.log(`[2] OK — Founder onboarded a real login for the new S.S. (user ${newSsUser.email}, role SUPER_STOCKIST_OWNER, party membership granted) — a NEW party can get a working login without touching seed scripts`);

  // ============= 3. The new login works immediately =============
  const newSsDashboard = await superStockistDashboardSummary(db, newSsUser.id, newSs.id);
  assert(!!newSsDashboard, "expected the brand-new login to immediately access its own S.S. dashboard");
  console.log("[3] OK — the brand-new login immediately works for its own party (real dashboard read succeeded)");

  // ============= 4. The new S.S. onboards its own Distributor + login =============
  const { partner: newDistributor } = await createDistributorForSuperStockist(db, newSsUser.id, newSs.id, {
    firmName: `Stage3 Onboarded Distributor ${suffix}`,
    address: { city: "Pune", state: "Maharashtra" },
    mobile: `94${String(suffix).slice(-8)}`,
    creditEnabled: true,
    creditLimit: 50000,
    creditDays: 14,
    idempotencyKey: `s3-newdist-${suffix}`,
  });
  assert(newDistributor.assignedSuperStockistId === newSs.id, "expected the new Distributor to be correctly assigned to the new S.S.");
  const newDistUser = await createUser(db, founder.id, { email: `stage3-dist-${suffix}@seera.test`, name: "Stage3 Fresh Distributor Owner", password: "Stage3OnboardingTest!2026" });
  await assignRole(db, founder.id, newDistUser.id, "DISTRIBUTOR_OWNER", "Stage 3 onboarding smoke test");
  await grantPartyMembership(db, founder.id, { partnerId: newDistributor.id, userId: newDistUser.id, accessRole: "OWNER" });
  const newDistDashboard = await distributorDashboardSummary(db, newDistUser.id, newDistributor.id);
  assert(!!newDistDashboard, "expected the new Distributor's brand-new login to work immediately");
  console.log(`[4] OK — the new S.S. onboarded its OWN Distributor (${newDistributor.code}) with a working login too — full two-level chain, zero seed scripts`);

  // ============= 5. Isolation from the EXISTING seeded network =============
  let newSsCannotSeeOldSs = false;
  try {
    await superStockistDashboardSummary(db, newSsUser.id, existingSs1.id);
  } catch (error) {
    newSsCannotSeeOldSs = error instanceof FoundationError;
  }
  assert(newSsCannotSeeOldSs, "expected the brand-new S.S. login to be denied access to the pre-existing seeded IV26-SS-01");

  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  let oldSsCannotSeeNewSs = false;
  try {
    await superStockistDashboardSummary(db, ss1Owner.id, newSs.id);
  } catch (error) {
    oldSsCannotSeeNewSs = error instanceof FoundationError;
  }
  assert(oldSsCannotSeeNewSs, "expected the pre-existing seeded S.S. login to be denied access to the brand-new S.S.");
  console.log("[5] OK — true isolation between a freshly-onboarded party and the pre-existing seeded network, both directions");

  // ============= 6. revokePartyMembership actually removes access =============
  await revokePartyMembership(db, founder.id, membership.id, "Stage 3 smoke — testing revocation");
  let revokedAccessDenied = false;
  try {
    await superStockistDashboardSummary(db, newSsUser.id, newSs.id);
  } catch (error) {
    revokedAccessDenied = error instanceof FoundationError;
  }
  assert(revokedAccessDenied, "expected access to be genuinely denied after revocation, not just a flag nobody checks");
  console.log("[6] OK — revokePartyMembership genuinely removes access (re-verified: same login, same party, now denied)");

  console.log("\nALL STAGE 3 ONBOARDING + ISOLATION SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
