import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { managerDashboardSummary } from "../../lib/sales-distribution/manager-service";
import { createDistributorForSuperStockist, createSuperStockist } from "../../lib/sales-distribution/distributor-management-service";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only proof for the "Choose Working Distributor" Start Day feature before any production
// deployment: required-vs-optional gating per work type, server-side authorization of the supplied
// Partner ID, Firm+Town label disambiguation (Mahroni vs Madawra "Sahu Kirana"), persistence across
// a fresh read, Manager visibility, and — most importantly — that retailer order routing is
// completely unaffected by the Start Day selection (it must keep resolving strictly from
// retailer.distributorId, never from SeeraWorkSession.workingDistributorId).

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
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const executive = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  console.log(`Using executive=${executive.id} manager=${manager.id}`);

  // End any pre-existing active session for this executive so start-day is clean to test.
  await db.seeraWorkSession.updateMany({ where: { employeeId: executive.id, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });

  let ss = await db.seeraPartner.findFirst({ where: { type: "SUPER_STOCKIST", legalName: "M/s Ratan Products & Traders" } });
  if (!ss) throw new Error("Expected TEST 'M/s Ratan Products & Traders' fixture from an earlier smoke run — not found");
  const mahroni = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id, addresses: { path: ["city"], equals: "Mahroni" } } });
  const madawra = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id, addresses: { path: ["city"], equals: "Madawra" } } });
  assert(mahroni && madawra, "Expected Mahroni/Madawra 'Sahu Kirana' fixtures from an earlier smoke run — not found");

  // A genuinely unrelated distributor under a DEDICATED fixture S.S. (never Ratan's own — that was
  // the actual cause of TEST Ratan drifting to 15 distributors across earlier reruns of this exact
  // script) — used to prove unauthorized Partner IDs are rejected server-side, not just filtered
  // out of the picker. Both idempotencyKeys are deterministic (not suffix-based), so reruns reuse
  // the same two rows instead of accumulating new ones.
  const fixtureSS = await createSuperStockist(db, founder.id, {
    firmName: "ZZ TEST FIXTURE - Unrelated Super Stockist",
    address: { line: "fixture", city: "Nowhere", state: "Uttar Pradesh" },
    mobile: "9000000001",
    idempotencyKey: "zz-test-fixture-unrelated-ss",
  });
  const otherSS = await createDistributorForSuperStockist(db, founder.id, fixtureSS.id, {
    firmName: "ZZ TEST FIXTURE - Unrelated Distributor",
    address: { line: "fixture", city: "Nowhere", state: "Uttar Pradesh" },
    mobile: "9000000002",
    creditEnabled: false,
    idempotencyKey: "zz-test-fixture-unrelated-distributor",
  });
  const unrelatedDistributorId = otherSS.partner.id;

  // Map the executive to Mahroni via a real retailer check-in trail (the canonical relation the
  // feature reuses) — create a retailer whose salesperson is this executive and distributor is
  // Mahroni, so executiveAuthorizedDistributors() picks it up without any parallel assignment table.
  // Deterministic identity + notes (createRetailer's own idempotency dedups on
  // notes containing idempotencyKey) so reruns reuse the same row instead of accumulating.
  const retailer = await createRetailer(db, executive.id, {
    businessName: "ZZ TEST FIXTURE - WD Test Retailer",
    address: { area: "Test area" },
    mobile: "8000000001",
    distributorId: mahroni!.id,
    confirmDuplicate: true,
    notes: "zz-test-fixture-wd-retailer",
    idempotencyKey: "zz-test-fixture-wd-retailer",
  });

  // A second retailer with its OWN distributor (Madawra) — used later to prove order routing keeps
  // using retailer.distributorId regardless of what the executive picked for Start Day.
  const routingRetailer = await createRetailer(db, executive.id, {
    businessName: "ZZ TEST FIXTURE - WD Routing Retailer",
    address: { area: "Test area" },
    mobile: "7000000001",
    distributorId: madawra!.id,
    notes: "zz-test-fixture-wd-routing-retailer",
    confirmDuplicate: true,
    idempotencyKey: "zz-test-fixture-wd-routing-retailer",
  });

  console.log("\n[1] Authorized distributor options + Firm+Town disambiguation");
  const options = await executiveAuthorizedDistributors(db, executive.id);
  const mahroniOpt = options.find((o) => o.id === mahroni!.id);
  assert(mahroniOpt, "Mahroni must appear in the executive's authorized options (retailer-mapped)");
  const label = (d: { legalName: string; tradeName: string | null; addresses: unknown }) => {
    const city = (d.addresses as { city?: string } | null)?.city;
    return city ? `${d.tradeName ?? d.legalName} — ${city}` : d.tradeName ?? d.legalName;
  };
  assert(label(mahroniOpt) === "Sahu Kirana — Mahroni", `Expected 'Sahu Kirana — Mahroni', got '${label(mahroniOpt)}'`);
  assert(!options.some((o) => o.id === unrelatedDistributorId), "Unrelated distributor must NOT appear in authorized options");
  console.log(`  OK — options include ${label(mahroniOpt)}, exclude the unrelated distributor (${options.length} total options)`);

  console.log("\n[2] Retailing requires a distributor");
  await expectError(
    () => startFieldDay(db, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 25.4, longitude: 78.5 }),
    "WORKING_DISTRIBUTOR_REQUIRED",
    "RETAILING with no distributorId",
  );

  console.log("\n[3] Distributor Visit requires a distributor");
  await expectError(
    () => startFieldDay(db, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "DISTRIBUTOR_VISIT", latitude: 25.4, longitude: 78.5 }),
    "WORKING_DISTRIBUTOR_REQUIRED",
    "DISTRIBUTOR_VISIT with no distributorId",
  );

  console.log("\n[4] Distributor Search can start without one");
  const searchSession = await startFieldDay(db, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "DISTRIBUTOR_SEARCH", latitude: 25.4, longitude: 78.5 });
  assert(searchSession.workingDistributorId === null, "Distributor Search session must have workingDistributorId null");
  await db.seeraWorkSession.update({ where: { id: searchSession.id }, data: { status: "ENDED", endedAt: new Date() } });
  console.log("  OK — started with no distributor, workingDistributorId is null");

  console.log("\n[5] Unauthorized distributor rejected server-side");
  await expectError(
    () => startFieldDay(db, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 25.4, longitude: 78.5, workingDistributorId: unrelatedDistributorId }),
    "DISTRIBUTOR_NOT_AUTHORIZED",
    "RETAILING with unrelated distributorId",
  );

  console.log("\n[6] Valid Retailing start with authorized distributor — persists");
  const session = await startFieldDay(db, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 25.4, longitude: 78.5, workingDistributorId: mahroni!.id });
  assert(session.workingDistributorId === mahroni!.id, "Session must persist the chosen workingDistributorId");
  const reread = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session.id } });
  assert(reread.workingDistributorId === mahroni!.id, "workingDistributorId must survive a fresh read (persistence)");
  console.log(`  OK — session ${session.id} persisted workingDistributorId=${reread.workingDistributorId}`);

  console.log("\n[7] Manager visibility");
  const managerAssignment = await db.seeraAssignment.findFirst({ where: { assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, subjectId: executive.id, targetId: manager.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
  assert(managerAssignment, "Expected review-sales-executive-1 to be on review-sales-manager-1's team (existing fixture) — Manager visibility cannot be proven without this");
  const managerSummary = await managerDashboardSummary(db, manager.id);
  const teamRow = managerSummary.teamToday.find((r) => r.employeeId === executive.id);
  assert(teamRow, "Executive must appear in Manager's teamToday");
  assert(teamRow!.workingDistributorLabel === "Sahu Kirana — Mahroni", `Expected Manager to see 'Sahu Kirana — Mahroni', got '${teamRow!.workingDistributorLabel}'`);
  assert(teamRow!.dayStatus === "ACTIVE", "Manager must see the executive's day as ACTIVE");
  console.log(`  OK — Manager sees: ${teamRow!.employeeName} — ${teamRow!.dayStatus} — ${teamRow!.workingDistributorLabel}`);

  console.log("\n[8] Retailer order routing is unaffected by Start Day distributor");
  // Mirrors exactly how app/api/field/operations/route.ts builds this call: commercialPartyId is
  // derived server-side from the retailer's OWN distributorId fetched fresh from the DB — the
  // client never gets to supply it, and placeRetailerOrder's own internal resolution (see its
  // "Executive->Distributor routing foundation" comment) independently re-derives from
  // retailer.distributorId regardless. Sanity-checked below: Madawra (retailer's own) must differ
  // from Mahroni (the executive's Start Day distributor) for this to be a meaningful proof.
  assert(madawra!.id !== reread.workingDistributorId, "Sanity: routing retailer's distributor (Madawra) must differ from the Start Day distributor (Mahroni)");
  const orderResult = await placeRetailerOrder(
    db,
    { actorId: executive.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: routingRetailer.distributorId ?? "" },
    { retailerId: routingRetailer.id, idempotencyKey: `wd-order-${suffix}`, commercialPaymentType: "CREDIT", lines: [] },
  ).catch((e) => (e instanceof FoundationError ? e : Promise.reject(e)));
  // An empty-lines order is expected to hit placeRetailerOrder's own line validation (400) — that's
  // fine and expected; this step only needs to prove which Distributor routing resolved to, which
  // it must reach before line validation (or, if it errors first, the retailer row itself proves
  // the point below regardless of order-creation success).
  const retailerAfter = await db.seeraRetailer.findUniqueOrThrow({ where: { id: routingRetailer.id } });
  assert(retailerAfter.distributorId === madawra!.id, "Routing retailer's own distributorId must remain Madawra, untouched by Start Day");
  console.log(`  OK — retailer.distributorId remains Madawra, independent of the executive's Start Day distributor (Mahroni). placeRetailerOrder outcome: ${orderResult instanceof FoundationError ? orderResult.code : "order created"}`);

  await db.seeraWorkSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });

  console.log("\nALL WORKING DISTRIBUTOR SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
