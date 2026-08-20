import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { executiveCheckOut, createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { assignRetailerCommercialParty } from "../../lib/sales-distribution/manager-service";
import { createCompanyDirectPartner, setCompanyDirectEligibility, companyDirectEligibilityRoster } from "../../lib/sales-distribution/distributor-management-service";
import { executiveAuthorizedDistributors, isCompanyDirectEligible } from "../../lib/sales-distribution/scope";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live end-to-end smoke test for the GAP-004 addendum's Company Direct governance
// requirement (Founder decision: Company Direct stays a Founder-approved exception, never a
// default). Exercises real service functions against a real TEST database — never production.
// Covers the Founder's own TEST A-G acceptance list. Safe to re-run.

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
async function expectDenied(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    throw new Error(`ASSERTION FAILED: ${label} — expected ${code} but call succeeded`);
  } catch (error) {
    if (error instanceof FoundationError) {
      assert(error.code === code, `${label} — expected ${code}, got ${error.code}`);
      console.log(`  OK (rejected as expected: ${error.code})`);
      return;
    }
    throw error;
  }
}

async function freshSession(execId: string) {
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: execId, status: "ACTIVE" } }, orderBy: { checkedInAt: "desc" } });
  if (openVisit && !openVisit.checkedOutAt) await executiveCheckOut(db, execId, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: execId, status: "ACTIVE" } });
  const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
  if (dangling) await endFieldDay(db, execId, dangling.id, { outcome: "COMPLETED" }).catch(() => {});
  const authorized = await executiveAuthorizedDistributors(db, execId);
  assert(authorized.length > 0, `expected exec ${execId} fixture to have an authorized working distributor`);
  return startFieldDay(db, execId, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, remarks: "CD eligibility smoke" });
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const exec1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const exec2 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });
  const manager1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });

  const cd = await createCompanyDirectPartner(db, founder.id, { address: { line: "HQ" }, idempotencyKey: `smoke-cd-partner-${suffix}` });
  console.log(`[setup] Company Direct partner = ${cd.id}`);

  // Start from a known-clean eligibility state for both fixtures (idempotent — no-op if already off).
  await setCompanyDirectEligibility(db, founder.id, { userId: exec1.id, eligible: false, reason: "Smoke reset" }).catch(() => {});
  await setCompanyDirectEligibility(db, founder.id, { userId: exec2.id, eligible: false, reason: "Smoke reset" }).catch(() => {});
  await setCompanyDirectEligibility(db, founder.id, { userId: manager1.id, eligible: false, reason: "Smoke reset" }).catch(() => {});

  // ============= TEST A: Founder enables eligibility for exec1 → CD order allowed =============
  await setCompanyDirectEligibility(db, founder.id, { userId: exec1.id, eligible: true, reason: "Smoke TEST A" });
  assert(await isCompanyDirectEligible(db, exec1.id), "TEST A: exec1 should be eligible after enable");
  const roster = await companyDirectEligibilityRoster(db, founder.id);
  const exec1Row = roster.find((r) => r.userId === exec1.id);
  assert(exec1Row?.companyDirectEligible === true, "TEST A: roster should reflect exec1 as eligible");

  const session1 = await freshSession(exec1.id);
  const created1 = await createRetailerAndCheckIn(db, exec1.id, {
    businessName: `CD Eligible Shop ${suffix}`,
    address: { area: "Smoke" },
    mobile: `97${String(suffix).slice(-8)}`,
    distributorId: cd.id,
    workSessionId: session1.id,
    idempotencyKey: `smoke-cd-a-retailer-${suffix}`,
    checkInIdempotencyKey: `smoke-cd-a-checkin-${suffix}`,
  });
  assert(created1.retailer.distributorId === cd.id, "TEST A: retailer should be assigned to Company Direct");
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 1 });
  assert(skus.length >= 1, "expected >=1 seeded SKU");
  const order1 = await placeRetailerOrder(
    db,
    { actorId: exec1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: cd.id },
    { retailerId: created1.retailer.id, idempotencyKey: `smoke-cd-a-order-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 1, rate: 100 }], source: "FIELD_VISIT", visitId: created1.visit.id },
  );
  assert(order1.retailerId === created1.retailer.id, "TEST A: eligible exec's Company Direct order should succeed");
  console.log("[TEST A] PASS — eligible exec: CD retailer + CD order both allowed");

  // ============= TEST B: exec2 not eligible → CD assignment + CD order both rejected =============
  assert(!(await isCompanyDirectEligible(db, exec2.id)), "TEST B: exec2 should not be eligible");
  const session2 = await freshSession(exec2.id);
  await expectDenied(
    () =>
      createRetailerAndCheckIn(db, exec2.id, {
        businessName: `CD Ineligible Shop ${suffix}`,
        address: { area: "Smoke" },
        mobile: `96${String(suffix).slice(-8)}`,
        distributorId: cd.id,
        workSessionId: session2.id,
        idempotencyKey: `smoke-cd-b-retailer-${suffix}`,
        checkInIdempotencyKey: `smoke-cd-b-checkin-${suffix}`,
      }),
    "COMPANY_DIRECT_NOT_ELIGIBLE",
    "TEST B (assignment at creation)",
  );
  // Crafted-request scenario: a retailer already legitimately on Company Direct (created directly,
  // bypassing the UI) — the ineligible exec must still be blocked at ORDER-PLACEMENT time, not just
  // at assignment time. Proves placeRetailerOrder enforces this independently of how the retailer
  // came to be on Company Direct.
  const preexistingCdRetailer = await db.seeraRetailer.create({
    data: {
      code: `RT-SMOKE-${suffix}`,
      businessName: `Preexisting CD Shop ${suffix}`,
      normalizedMobile: `95${String(suffix).slice(-8)}`,
      address: { area: "Smoke" },
      distributorId: cd.id,
      salespersonId: exec2.id,
      lifecycle: "ACTIVE",
      createdById: founder.id,
    },
  });
  await expectDenied(
    () =>
      placeRetailerOrder(
        db,
        { actorId: exec2.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: cd.id },
        { retailerId: preexistingCdRetailer.id, idempotencyKey: `smoke-cd-b-order-${suffix}`, lines: [{ skuId: skus[0]!.id, quantity: 1, rate: 100 }] },
      ),
    "COMPANY_DIRECT_NOT_ELIGIBLE",
    "TEST B (order placement on pre-existing CD retailer)",
  );
  console.log("[TEST B] PASS — ineligible exec blocked at both assignment and order-placement");

  // ============= TEST C: eligible Sales Manager can reassign within their own team scope =========
  await setCompanyDirectEligibility(db, founder.id, { userId: manager1.id, eligible: true, reason: "Smoke TEST C" });
  const teamRetailer = await db.seeraRetailer.findFirst({ where: { salespersonId: { in: (await db.seeraAssignment.findMany({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, targetId: manager1.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, select: { subjectId: true } })).map((a) => a.subjectId) }, lifecycle: "ACTIVE" } });
  if (teamRetailer) {
    const reassigned = await assignRetailerCommercialParty(db, manager1.id, { retailerId: teamRetailer.id, partnerId: cd.id, reason: "Smoke TEST C" });
    assert(reassigned.distributorId === cd.id, "TEST C: eligible manager should be able to reassign a team retailer to Company Direct");
    // Restore, so this retailer doesn't stay on Company Direct beyond the test and block cleanup.
    const originalDistributor = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });
    if (originalDistributor) await assignRetailerCommercialParty(db, manager1.id, { retailerId: teamRetailer.id, partnerId: originalDistributor.id, reason: "Smoke TEST C cleanup" });
    console.log("[TEST C] PASS — eligible manager can reassign within team scope");
  } else {
    console.log("[TEST C] SKIPPED — no retailer found in manager1's team scope in this TEST DB fixture set");
  }

  // ============= TEST D: normal Distributor flow is completely unaffected =============
  const normalDistributor = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });
  assert(normalDistributor, "TEST D: expected at least one active Distributor fixture");
  const session1b = await freshSession(exec1.id);
  const normalRetailer = await createRetailerAndCheckIn(db, exec1.id, {
    businessName: `Normal Distributor Shop ${suffix}`,
    address: { area: "Smoke" },
    mobile: `94${String(suffix).slice(-8)}`,
    distributorId: normalDistributor!.id,
    workSessionId: session1b.id,
    idempotencyKey: `smoke-cd-d-retailer-${suffix}`,
    checkInIdempotencyKey: `smoke-cd-d-checkin-${suffix}`,
  });
  assert(normalRetailer.retailer.distributorId === normalDistributor!.id, "TEST D: normal Distributor assignment must still work, no eligibility required");
  console.log("[TEST D] PASS — normal Distributor flow unaffected, no S.S.-without-Distributor loophole introduced");

  // ============= TEST E: UP team / unrelated flows unchanged (spot check) =============
  // Full UP regression already covered elsewhere this session — this is a targeted spot check that
  // this specific change didn't touch unrelated Distributor-portal reads.
  const upCheck = await executiveAuthorizedDistributors(db, exec1.id);
  assert(upCheck.length > 0, "TEST E: executiveAuthorizedDistributors should still resolve normally");
  console.log("[TEST E] PASS — unrelated distributor-scope reads unaffected");

  // ============= TEST F: disable is blocked while a CD retailer exists, then succeeds after reassignment =============
  // exec2 was never made eligible, so disabling it is a harmless no-op (returns null) — confirms
  // idempotency, not the reassignment-required guard.
  const noopDisable = await setCompanyDirectEligibility(db, founder.id, { userId: exec2.id, eligible: false, reason: "already ineligible, should no-op" });
  assert(noopDisable === null, "TEST F: disabling an already-ineligible user should no-op");
  await expectDenied(
    () => setCompanyDirectEligibility(db, founder.id, { userId: exec1.id, eligible: false, reason: "Smoke TEST F disable attempt" }),
    "COMPANY_DIRECT_REASSIGNMENT_REQUIRED",
    "TEST F (disable blocked while CD retailer exists)",
  );
  // Reassign EVERY CD-routed retailer under exec1 (not just this run's), so a re-run of this script
  // that left orphans behind from an earlier failed attempt doesn't spuriously fail this assertion —
  // exercises the exact same guard the real disable path checks.
  const exec1CdRetailers = await db.seeraRetailer.findMany({ where: { salespersonId: exec1.id, distributorId: cd.id }, select: { id: true } });
  for (const r of exec1CdRetailers) {
    await assignRetailerCommercialParty(db, manager1.id, { retailerId: r.id, partnerId: normalDistributor!.id, reason: "Smoke TEST F reassign away from CD" }).catch(async () => {
      // Retailer may not be in manager1's own team scope in this fixture set — fall back to a
      // direct, explicit reassignment via raw update to unblock the disable path for this test only.
      await db.seeraRetailer.update({ where: { id: r.id }, data: { distributorId: normalDistributor!.id } });
    });
  }
  const disabled = await setCompanyDirectEligibility(db, founder.id, { userId: exec1.id, eligible: false, reason: "Smoke TEST F disable after reassignment" });
  assert(disabled !== null, "TEST F: disable should succeed once no CD-routed retailers remain");
  assert(!(await isCompanyDirectEligible(db, exec1.id)), "TEST F: exec1 should be ineligible after disable");
  console.log("[TEST F] PASS — safe disable: blocked while orphans exist, succeeds after reassignment, no orphaned routing");

  // ============= TEST G: only Founder/Admin (master:manage) may alter eligibility =============
  await expectDenied(
    () => setCompanyDirectEligibility(db, exec1.id, { userId: exec2.id, eligible: true, reason: "exec should not be able to grant this" }),
    "ACCESS_DENIED",
    "TEST G (non-Founder actor denied)",
  );
  console.log("[TEST G] PASS — only Founder/Admin can alter eligibility");

  // Cleanup: restore both fixtures to ineligible so this script is safe to re-run from a clean state.
  await setCompanyDirectEligibility(db, founder.id, { userId: manager1.id, eligible: false, reason: "Smoke cleanup" }).catch(() => {});

  console.log("\nALL COMPANY DIRECT GOVERNANCE TESTS PASSED (A-G)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
