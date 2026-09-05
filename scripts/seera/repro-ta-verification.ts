import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { classifyDailyTravelDuty, approveDailyTravel } from "../../lib/sales-distribution/travel-claim-service";

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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const manager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  // Confirm the actual current assignment linking executive -> manager (the real production
  // mechanism reviewerFor() relies on).
  const assignment = await prisma.seeraAssignment.findFirst({
    where: { subjectId: executive.id, assignmentType: { in: ["MANAGER_TEAM", "TEAM"] }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
  });
  console.log(`Executive->Manager assignment exists: ${Boolean(assignment)}, targetId=${assignment?.targetId} (expected manager=${manager.id})`);
  check("executive is assigned to the manager under test", assignment?.targetId === manager.id);

  // Create a claim with a KNOWN managerId matching reviewerFor()'s real resolution logic, then
  // exercise the actual verification actions a real Manager Portal click would call.
  const session = await prisma.seeraWorkSession.create({
    data: { employeeId: executive.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(), endedAt: new Date(), status: "ENDED" },
  });
  const estimate = await prisma.seeraTravelEstimate.create({
    data: { employeeId: executive.id, workSessionId: session.id, estimateDate: new Date(), distanceKm: 42, sourceEvents: {}, calculationVersion: "1" },
  });
  const claim = await prisma.seeraTaClaim.create({
    data: {
      claimNumber: `TA-REPRO-${session.id.slice(-10)}`,
      employeeId: executive.id,
      managerId: assignment?.targetId, // exactly what finalizeDailyTravelClaim's reviewerFor() would set
      claimDate: new Date(),
      travelEstimateId: estimate.id,
      originalDistanceKm: 42,
      claimedDistanceKm: 42,
      vehicleType: "STANDARD_FIELD",
      proofFileIds: [],
      status: "READY_FOR_REVIEW",
      dutyType: "UNCLASSIFIED",
      submittedAt: new Date(),
      idempotencyKey: `repro-ta-${session.id}`,
      rateSnapshot: {},
    },
  });
  console.log(`Created claim ${claim.id} with managerId=${claim.managerId}`);

  console.log("\nTest 1 — Set duty (classifyDailyTravelDuty) as the real assigned manager");
  try {
    const result = await classifyDailyTravelDuty(prisma, manager.id, claim.id, { dutyType: "LOCAL_HQ", reason: "Repro test" });
    check("Set duty succeeds for the correctly-assigned manager", result.dutyType === "LOCAL_HQ");
  } catch (e) {
    check("Set duty succeeds for the correctly-assigned manager", false);
    console.log(`  ERROR: ${(e as Error).message} code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 2 — Verify (approveDailyTravel) as the real assigned manager");
  try {
    const result = await approveDailyTravel(prisma, manager.id, claim.id, { eligibleDistanceKm: 42, reason: "Repro test verify" });
    check("Verify succeeds for the correctly-assigned manager", result.status === "READY_FOR_REVIEW" || result.status === "SENT_TO_ACCOUNTS" || Boolean(result.id));
  } catch (e) {
    check("Verify succeeds for the correctly-assigned manager", false);
    console.log(`  ERROR: ${(e as Error).message} code=${(e as { code?: string }).code}`);
  }

  console.log("\nTest 3 — an UNRELATED manager cannot verify this claim (scope must still be enforced)");
  const otherManager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-2@seera.test" } });
  const session2 = await prisma.seeraWorkSession.create({
    data: { employeeId: executive.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(), endedAt: new Date(), status: "ENDED" },
  });
  const estimate2 = await prisma.seeraTravelEstimate.create({
    data: { employeeId: executive.id, workSessionId: session2.id, estimateDate: new Date(), distanceKm: 10, sourceEvents: {}, calculationVersion: "1" },
  });
  const claim2 = await prisma.seeraTaClaim.create({
    data: {
      claimNumber: `TA-REPRO2-${session.id.slice(-10)}`,
      employeeId: executive.id,
      managerId: assignment?.targetId,
      claimDate: new Date(),
      travelEstimateId: estimate2.id,
      originalDistanceKm: 10,
      claimedDistanceKm: 10,
      vehicleType: "STANDARD_FIELD",
      proofFileIds: [],
      status: "READY_FOR_REVIEW",
      dutyType: "LOCAL_HQ",
      submittedAt: new Date(),
      idempotencyKey: `repro-ta2-${session.id}`,
      rateSnapshot: {},
    },
  });
  try {
    await approveDailyTravel(prisma, otherManager.id, claim2.id, { eligibleDistanceKm: 10, reason: "Should be denied" });
    check("unrelated manager correctly denied", false);
  } catch (e) {
    check("unrelated manager correctly denied", (e as { code?: string }).code === "TA_MANAGER_SCOPE_DENIED");
  }

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraTaClaim.deleteMany({ where: { id: { in: [claim.id, claim2.id] } } });
  await prisma.seeraTravelEstimate.deleteMany({ where: { id: { in: [estimate.id, estimate2.id] } } });
  await prisma.seeraWorkSession.deleteMany({ where: { id: { in: [session.id, session2.id] } } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
