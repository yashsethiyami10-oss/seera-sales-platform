import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { assignDistributorToExecutive, removeExecutiveDistributorAssignment, activeExecutiveDistributorAssignments } from "../../lib/sales-distribution/operational-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { createDistributorForSuperStockist, createSuperStockist } from "../../lib/sales-distribution/distributor-management-service";
import { createUser, assignRole } from "../../lib/foundation/user-management-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only proof for the direct EXECUTIVE_DISTRIBUTOR assignment (production gap: a brand-new
// Executive/territory with ZERO retailers checked in yet has no way to bootstrap Start Day's
// distributor picker via the retailer-derived relation alone). Uses a genuinely fresh Executive with
// no retailers at all — mirrors the real production state (Neeraj Rawat) exactly, rather than
// reusing the review-sales-executive-1 fixture which already has retailer-derived options.

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
async function expectError(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    throw new Error(`ASSERTION FAILED: ${label} — expected ${code} but call succeeded`);
  } catch (err) {
    if (err instanceof FoundationError) {
      assert(err.code === code, `${label} — expected ${code}, got ${err.code}: ${err.message}`);
      console.log(`  OK (rejected as expected: ${err.code})`);
    } else throw err;
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}\n`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  // A brand-new Executive with ZERO retailers, ZERO manager assignment — the exact production
  // cold-start scenario. Deterministic fixture identity (find-or-create) so reruns reuse the same
  // row instead of accumulating a new throwaway User every time — this script always cleans up its
  // own EXECUTIVE_DISTRIBUTOR assignment in step [7], so reuse across runs is safe.
  const freshExecutive =
    (await db.user.findUnique({ where: { normalizedEmail: "zz-test-fixture-cold-start-executive@seera.test" } })) ??
    (await createUser(db, founder.id, { email: "zz-test-fixture-cold-start-executive@seera.test", name: "ZZ TEST FIXTURE - Cold Start Executive", password: "TempPassword12345!" }));
  const hasExecutiveRole = await db.userRoleAssignment.findFirst({ where: { userId: freshExecutive.id, status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } } });
  if (!hasExecutiveRole) await assignRole(db, founder.id, freshExecutive.id, "SALES_EXECUTIVE", "Smoke test fixture");

  const ss = await db.seeraPartner.findFirst({ where: { type: "SUPER_STOCKIST", legalName: "M/s Ratan Products & Traders" } });
  assert(ss, "Expected TEST 'M/s Ratan Products & Traders' fixture from an earlier smoke run");
  const mahroni = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss!.id, addresses: { path: ["city"], equals: "Mahroni" } } });
  assert(mahroni, "Expected Mahroni 'Sahu Kirana' fixture from an earlier smoke run");
  // DEDICATED fixture S.S./Distributor (never Ratan's own — that was the actual cause of TEST
  // Ratan drifting to 15 distributors) — same stable idempotencyKeys as
  // smoke-working-distributor.ts, so both scripts converge on the same two rows, not a pair each.
  const fixtureSS = await createSuperStockist(db, founder.id, {
    firmName: "ZZ TEST FIXTURE - Unrelated Super Stockist",
    address: { line: "fixture", city: "Nowhere", state: "Uttar Pradesh" },
    mobile: "9000000001",
    idempotencyKey: "zz-test-fixture-unrelated-ss",
  });
  const other = await createDistributorForSuperStockist(db, founder.id, fixtureSS.id, {
    firmName: "ZZ TEST FIXTURE - Unrelated Distributor",
    address: { line: "fixture", city: "Nowhere", state: "Uttar Pradesh" },
    mobile: "9000000002",
    creditEnabled: false,
    idempotencyKey: "zz-test-fixture-unrelated-distributor",
  });

  console.log("[1] Before assignment: authorized distributors = 0 (true cold-start reproduction)");
  const before = await executiveAuthorizedDistributors(db, freshExecutive.id);
  assert(before.length === 0, `Expected 0 authorized distributors before any assignment, got ${before.length}`);
  console.log("  OK — confirms the exact production symptom");

  console.log("\n[2] Direct assignment (Founder-governed) makes it available immediately, no retailer needed");
  const assignment = await assignDistributorToExecutive(db, founder.id, { executiveId: freshExecutive.id, distributorId: mahroni!.id, reason: "Ratan network assignment (smoke test)" });
  const after = await executiveAuthorizedDistributors(db, freshExecutive.id);
  assert(after.some((d) => d.id === mahroni!.id), "Mahroni must now appear in authorized options");
  assert(after.length === 1, `Expected exactly 1 authorized distributor, got ${after.length}`);
  console.log(`  OK — ${after.length} authorized distributor(s): ${after.map((d) => d.legalName).join(", ")}`);

  console.log("\n[3] Idempotent: assigning the same pair again returns the same row, no duplicate");
  const again = await assignDistributorToExecutive(db, founder.id, { executiveId: freshExecutive.id, distributorId: mahroni!.id, reason: "Repeat call" });
  assert(again.id === assignment.id, "Repeat assignment must return the SAME row, not create a duplicate");
  const afterRepeat = await executiveAuthorizedDistributors(db, freshExecutive.id);
  assert(afterRepeat.length === 1, `Expected still exactly 1 authorized distributor after repeat call, got ${afterRepeat.length}`);
  console.log("  OK — no duplicate assignment row, authorized list unchanged");

  console.log("\n[4] Unrelated distributor never appears merely from this assignment");
  assert(!after.some((d) => d.id === other.partner.id), "Unrelated distributor must not leak into authorized options");
  console.log("  OK");

  console.log("\n[5] Non-existent/inactive distributor rejected");
  await expectError(
    () => assignDistributorToExecutive(db, founder.id, { executiveId: freshExecutive.id, distributorId: "not-a-real-id", reason: "bad" }),
    "DISTRIBUTOR_NOT_FOUND",
    "assign with bogus distributorId",
  );

  console.log("\n[6] Listing (Founder oversight view)");
  const listed = await activeExecutiveDistributorAssignments(db, founder.id);
  const row = listed.assignments.find((a) => a.id === assignment.id);
  assert(row, "Assignment must appear in the Founder oversight list");
  assert(row!.distributorLabel === "Sahu Kirana — Mahroni", `Expected 'Sahu Kirana — Mahroni', got '${row!.distributorLabel}'`);
  console.log(`  OK — Founder sees: ${row!.executiveName} → ${row!.distributorLabel}`);

  console.log("\n[7] Removal actually revokes access");
  await removeExecutiveDistributorAssignment(db, founder.id, assignment.id, "Smoke test cleanup");
  const afterRemoval = await executiveAuthorizedDistributors(db, freshExecutive.id);
  assert(afterRemoval.length === 0, `Expected 0 authorized distributors after removal, got ${afterRemoval.length}`);
  console.log("  OK — access genuinely revoked, not just flagged");

  console.log("\nALL EXECUTIVE-DISTRIBUTOR ASSIGNMENT SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
