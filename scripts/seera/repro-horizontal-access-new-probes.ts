import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { approveDailyTravel } from "../../lib/sales-distribution/travel-claim-service";
import { decideMoneyDeskApproval } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { FoundationError } from "../../lib/foundation/errors";

// Full Production OS Audit, Phase 2 — GENUINELY NEW horizontal/vertical access probes, deliberately
// distinct from this session's existing rbac-full-matrix-drift-check-readonly.ts (DB-vs-catalog
// data check) and rbac-behavioral-matrix-proof.ts (bare authorize() ALLOW/DENY per permission).
// Those two prove the PERMISSION layer is correct; neither exercises real business functions with a
// real, OTHER actor's real record id — the actual shape a horizontal-access/IDOR attack takes. This
// does that: Executive A tries to act on Executive B's own visit; Manager A tries to verify a TA
// claim belonging to Manager B's own team member. Real record ids, real actors, real functions.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const url = new URL(test);
url.searchParams.set("connect_timeout", "30");
url.searchParams.set("connection_limit", "10");
url.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`); if (ok) pass++; else fail++; }

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const execA = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const execB = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });
  const managerA = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const managerB = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-2@seera.test" } });
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  console.log("=== Test 1: Executive B tries to check out a visit that belongs to Executive A ===");
  for (const emp of [execA, execB]) {
    const s = await prisma.seeraWorkSession.findFirst({ where: { employeeId: emp.id, status: "ACTIVE" } });
    if (s) await prisma.seeraWorkSession.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: new Date() } });
  }
  const authorizedA = await executiveAuthorizedDistributors(prisma, execA.id);
  const sessionA = await startFieldDay(prisma, execA.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorizedA[0]!.id, latitude: 28.6, longitude: 77.2 });
  const { visit: visitA } = await createRetailerAndCheckIn(prisma, execA.id, {
    businessName: `Horizontal Probe A ${suffix}`, address: { area: "Test" }, latitude: 28.6, longitude: 77.2,
    confirmDuplicate: false, idempotencyKey: randomUUID(), workSessionId: sessionA.id, checkInIdempotencyKey: randomUUID(),
  });
  let visitAOwnedCleanupRetailerId: string | undefined;
  {
    const v = await prisma.seeraVisit.findUniqueOrThrow({ where: { id: visitA.id } });
    visitAOwnedCleanupRetailerId = v.retailerId;
  }
  try {
    await executiveCheckOut(prisma, execB.id, visitA.id, { outcome: "NO_ORDER", noOrderReason: "IDOR probe", idempotencyKey: randomUUID() });
    check("Executive B checking out Executive A's visit is REJECTED", false, "did not throw — HORIZONTAL ACCESS VIOLATION");
  } catch (e) {
    check("Executive B checking out Executive A's visit is REJECTED", e instanceof FoundationError && e.code === "VISIT_SCOPE_DENIED", `code=${e instanceof FoundationError ? e.code : String(e)}`);
  }
  const stillOpen = await prisma.seeraVisit.findUniqueOrThrow({ where: { id: visitA.id } });
  check("visit A remains OPEN after Executive B's rejected attempt (no partial mutation)", stillOpen.checkedOutAt === null);

  console.log("\n=== Test 2: Manager B tries to approve a TA claim submitted by Manager A's own team executive ===");
  const taSession = await prisma.seeraWorkSession.create({
    data: { employeeId: execA.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(), endedAt: new Date(), status: "ENDED" },
  });
  const estimate = await prisma.seeraTravelEstimate.create({
    data: { employeeId: execA.id, workSessionId: taSession.id, estimateDate: new Date(), distanceKm: 10, sourceEvents: {}, calculationVersion: "1" },
  });
  const claim = await prisma.seeraTaClaim.create({
    data: {
      claimNumber: `TA-HORIZ-${suffix}`, employeeId: execA.id, managerId: managerA.id, claimDate: new Date(),
      travelEstimateId: estimate.id, originalDistanceKm: 10, claimedDistanceKm: 10, vehicleType: "STANDARD_FIELD",
      proofFileIds: [], status: "READY_FOR_REVIEW", dutyType: "UNCLASSIFIED", submittedAt: new Date(),
      idempotencyKey: `horiz-ta-${suffix}`, rateSnapshot: { policyType: "PER_KM", ratePerKm: "5", fixedAllowance: "0" },
    },
  });
  try {
    await approveDailyTravel(prisma, managerB.id, claim.id, { eligibleDistanceKm: 10, reason: "IDOR probe" });
    check("Manager B approving Manager A's team member's TA claim is REJECTED", false, "did not throw — CROSS-MANAGER ACCESS VIOLATION");
  } catch (e) {
    check("Manager B approving Manager A's team member's TA claim is REJECTED", e instanceof FoundationError && e.code === "TA_MANAGER_SCOPE_DENIED", `code=${e instanceof FoundationError ? e.code : String(e)}`);
  }
  const claimAfter = await prisma.seeraTaClaim.findUniqueOrThrow({ where: { id: claim.id } });
  check("TA claim status unchanged after Manager B's rejected attempt", claimAfter.status === "READY_FOR_REVIEW");

  console.log("\n=== Test 3: non-Founder Accounts actor tries to approve their OWN Money Desk entry (real self-approval, distinct from the earlier Founder-bypass test) ===");
  const accountsManager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `HORIZ-CASH-${suffix}`, name: `Horizontal Probe Cash ${suffix}` });
  // createMoneyDeskTransaction only actually lands a row in PENDING_APPROVAL when the configured
  // approval policy for this purpose/amount requires it (LARGE_CASH_TXN threshold etc.) — an
  // ordinary OTHER/CASH_OUT amount doesn't trigger that path, so it posts straight through and
  // there is nothing left to approve. Same direct-creation pattern already established and reviewed
  // in repro-money-desk-founder-self-approval.ts for exactly this reason: construct the
  // PENDING_APPROVAL state directly, then exercise the real decideMoneyDeskApproval() decision path
  // against it — that function is what's actually under test here, not the approval-policy trigger.
  const txn = await prisma.seeraMoneyDeskTransaction.create({
    data: {
      transactionNumber: `MD-HORIZ-${suffix}`, purposeCode: "OTHER", direction: "CASH_OUT", status: "PENDING_APPROVAL",
      source: "ACCOUNTS_PORTAL", amount: 60000, date: new Date(), treasuryAccountId: cash.id,
      counterpartyName: `Horizontal Probe Vendor ${suffix}`, formData: {}, requestedById: accountsManager.id,
      idempotencyKey: `horiz-md-${suffix}`,
    },
  });
  let approvalOutcomeThrew = false;
  let approvalCode = "";
  try {
    await decideMoneyDeskApproval(prisma, accountsManager.id, txn.id, { decision: "APPROVED", reason: "self-approval probe" });
  } catch (e) {
    approvalOutcomeThrew = true;
    approvalCode = e instanceof FoundationError ? e.code : String(e);
  }
  check("Accounts Manager approving their OWN Money Desk entry is REJECTED (self-approval)", approvalOutcomeThrew && approvalCode === "MONEY_DESK_SELF_APPROVAL_DENIED", `code=${approvalCode}`);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraVisit.deleteMany({ where: { id: visitA.id } });
  if (visitAOwnedCleanupRetailerId) await prisma.seeraRetailer.deleteMany({ where: { id: visitAOwnedCleanupRetailerId } });
  await prisma.seeraWorkSession.update({ where: { id: sessionA.id }, data: { status: "ENDED", endedAt: new Date() } });
  await prisma.seeraTaClaim.deleteMany({ where: { id: claim.id } });
  await prisma.seeraTravelEstimate.deleteMany({ where: { id: estimate.id } });
  await prisma.seeraWorkSession.deleteMany({ where: { id: taSession.id } });
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: txn.id } });
  await prisma.seeraTreasuryAccount.deleteMany({ where: { id: cash.id } });
  console.log("done.");
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
