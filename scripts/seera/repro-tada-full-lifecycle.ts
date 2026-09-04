import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  classifyDailyTravelDuty,
  approveDailyTravel,
  decideDailyTravel,
  requestTaCorrectionFinal,
  payDailyTravel,
} from "../../lib/sales-distribution/travel-claim-service";

// Priority 7/8 (Final Remaining System Completion Mission) — completes the TA/DA lifecycle
// coverage repro-ta-verification.ts already has (Set Duty + Verify + unauthorized-manager scope
// denial) with everything else the mission explicitly lists: blank duty reason, approval blocked
// on UNCLASSIFIED duty (the exact defect class that caused the real "10 stuck claims" production
// incident this session traced earlier — must not recur), rejection, resubmission after rejection,
// re-approval of a resubmitted claim, duplicate/already-approved rejection (TA_STATE_INVALID),
// payment against an approved claim, idempotent double-payment (never double-posts), and payment
// attempted against an unapproved claim (TA_PAYMENT_STATE_INVALID). Cross-division/unauthorized-
// manager scope is already proven by repro-ta-verification.ts (manager-1/North vs manager-2/South)
// — not re-duplicated here.
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
const prisma = new PrismaClient({ datasourceUrl: test });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function makeClaim(manager: { id: string }, executive: { id: string }, suffix: string, km: number) {
  const session = await prisma.seeraWorkSession.create({
    data: { employeeId: executive.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(), endedAt: new Date(), status: "ENDED" },
  });
  const estimate = await prisma.seeraTravelEstimate.create({
    data: { employeeId: executive.id, workSessionId: session.id, estimateDate: new Date(), distanceKm: km, sourceEvents: {}, calculationVersion: "1" },
  });
  const claim = await prisma.seeraTaClaim.create({
    data: {
      claimNumber: `TA-LIFECYCLE-${suffix}`,
      employeeId: executive.id,
      managerId: manager.id,
      claimDate: new Date(),
      travelEstimateId: estimate.id,
      originalDistanceKm: km,
      claimedDistanceKm: km,
      vehicleType: "STANDARD_FIELD",
      proofFileIds: [],
      status: "READY_FOR_REVIEW",
      dutyType: "UNCLASSIFIED",
      submittedAt: new Date(),
      idempotencyKey: `repro-tada-lifecycle-${suffix}`,
      // A real governed rate snapshot (PER_KM @ Rs.5/km) — without this, approveDailyTravel's own
      // amounts calculation correctly resolves to null (no configured policy to price against),
      // which then correctly blocks payDailyTravel with TA_PAYMENT_STATE_INVALID (totalApproved
      // stays null) — a real guard, not a bug, but it means a claim used to test the PAYMENT step
      // specifically needs a real rate snapshot, matching what finalizeDailyTravelClaim would
      // normally have resolved from an actual configured SeeraTravelPolicy.
      rateSnapshot: { policyType: "PER_KM", ratePerKm: "5", fixedAllowance: "0" },
    },
  });
  return { session, estimate, claim };
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const manager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const suffix = randomUUID().slice(0, 8);
  const createdIds: string[] = [];
  const sessionIds: string[] = [];
  const estimateIds: string[] = [];

  console.log("=== Blank duty reason must be rejected (the exact class that caused the real stuck-claims incident) ===");
  const c1 = await makeClaim(manager, executive, `blank-${suffix}`, 20);
  createdIds.push(c1.claim.id); sessionIds.push(c1.session.id); estimateIds.push(c1.estimate.id);
  await classifyDailyTravelDuty(prisma, manager.id, c1.claim.id, { dutyType: "LOCAL_HQ", reason: "" }).then(
    () => check("blank duty reason is correctly rejected", false),
    (e) => check("blank duty reason is correctly rejected (TA_DUTY_REASON_REQUIRED)", e.code === "TA_DUTY_REASON_REQUIRED"),
  );

  console.log("\n=== Approval is blocked while duty is still UNCLASSIFIED ===");
  await approveDailyTravel(prisma, manager.id, c1.claim.id, { eligibleDistanceKm: 20, reason: "attempt" }).then(
    () => check("approval on an UNCLASSIFIED claim is correctly rejected", false),
    (e) => check("approval on an UNCLASSIFIED claim is correctly rejected (TA_DUTY_CLASSIFICATION_REQUIRED)", e.code === "TA_DUTY_CLASSIFICATION_REQUIRED"),
  );

  console.log("\n=== Rejection, then resubmission, then re-approval ===");
  const c2 = await makeClaim(manager, executive, `reject-resubmit-${suffix}`, 15);
  createdIds.push(c2.claim.id); sessionIds.push(c2.session.id); estimateIds.push(c2.estimate.id);
  await classifyDailyTravelDuty(prisma, manager.id, c2.claim.id, { dutyType: "LOCAL_HQ", reason: "Repro classification" });
  const rejected = await decideDailyTravel(prisma, manager.id, c2.claim.id, { decision: "REJECT", reason: "Distance looks wrong" });
  check("claim status is MANAGER_REJECTED", rejected.status === "MANAGER_REJECTED");
  const resubmitted = await requestTaCorrectionFinal(prisma, executive.id, c2.claim.id, { correctedDistanceKm: 12, reason: "Corrected after rejection", evidenceFileIds: [] });
  check("resubmission moves the claim back to READY_FOR_REVIEW", resubmitted.status === "READY_FOR_REVIEW");
  check("resubmission updated the claimed distance", Number(resubmitted.claimedDistanceKm) === 12);
  const reapproved = await approveDailyTravel(prisma, manager.id, c2.claim.id, { eligibleDistanceKm: 12, reason: "Approved after correction" });
  check("resubmitted claim can now be approved (SENT_TO_ACCOUNTS)", reapproved.status === "SENT_TO_ACCOUNTS");

  console.log("\n=== Duplicate / already-approved: re-approving or re-rejecting a SENT_TO_ACCOUNTS claim is rejected ===");
  await approveDailyTravel(prisma, manager.id, c2.claim.id, { eligibleDistanceKm: 12, reason: "duplicate attempt" }).then(
    () => check("re-approving an already-approved claim is correctly rejected", false),
    (e) => check("re-approving an already-approved claim is correctly rejected (TA_STATE_INVALID)", e.code === "TA_STATE_INVALID"),
  );
  await decideDailyTravel(prisma, manager.id, c2.claim.id, { decision: "REJECT", reason: "too late" }).then(
    () => check("rejecting an already-approved claim is correctly rejected", false),
    (e) => check("rejecting an already-approved claim is correctly rejected (TA_STATE_INVALID)", e.code === "TA_STATE_INVALID"),
  );

  console.log("\n=== Payment: cannot pay an unapproved claim, CAN pay an approved one, and paying twice never double-posts ===");
  const c3 = await makeClaim(manager, executive, `payment-${suffix}`, 8);
  createdIds.push(c3.claim.id); sessionIds.push(c3.session.id); estimateIds.push(c3.estimate.id);
  await payDailyTravel(prisma, founder.id, c3.claim.id, { employeePartyId: executive.id, companyPartyId: "COMPANY", idempotencyKey: `repro-tada-pay-early-${suffix}`, paymentReference: "should fail" }).then(
    () => check("paying an unapproved (READY_FOR_REVIEW) claim is correctly rejected", false),
    (e) => check("paying an unapproved claim is correctly rejected (TA_PAYMENT_STATE_INVALID)", e.code === "TA_PAYMENT_STATE_INVALID"),
  );
  const { entry: firstEntry, claim: paid } = await payDailyTravel(prisma, founder.id, c2.claim.id, { employeePartyId: executive.id, companyPartyId: "COMPANY", idempotencyKey: `repro-tada-pay-${suffix}`, paymentReference: `REF-${suffix}` });
  check("approved claim is now PAID", paid.status === "PAID");
  check("a real ledger entry was posted for the payment", Boolean(firstEntry?.id));
  const { entry: secondEntry, claim: paidAgain } = await payDailyTravel(prisma, founder.id, c2.claim.id, { employeePartyId: executive.id, companyPartyId: "COMPANY", idempotencyKey: `repro-tada-pay-${suffix}`, paymentReference: `REF-${suffix}` });
  check("paying an already-PAID claim again is a safe no-op (idempotent, not an error)", paidAgain.status === "PAID");
  check("no second ledger entry was created by the repeat payment call", secondEntry?.id === firstEntry?.id);
  const entryCount = await prisma.seeraFinancialEntry.count({ where: { taClaimId: c2.claim.id } });
  check("exactly ONE financial entry exists for this claim after two payment calls", entryCount === 1);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFinancialEntry.deleteMany({ where: { taClaimId: { in: createdIds } } });
  await prisma.seeraTaClaim.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.seeraTravelEstimate.deleteMany({ where: { id: { in: estimateIds } } });
  await prisma.seeraWorkSession.deleteMany({ where: { id: { in: sessionIds } } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
