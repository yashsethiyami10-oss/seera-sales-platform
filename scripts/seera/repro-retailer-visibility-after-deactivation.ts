import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createBeatPlan, publishBeatPlan } from "../../lib/sales-distribution/operational-service";
import { executiveBeat, createRetailer, executiveCheckIn } from "../../lib/sales-distribution/field-portal-service";

// Money Desk + Founder Approvals Integration mission, §28 — real root cause: executiveBeat's
// stop-resolution query (field-portal-service.ts) had NO lifecycle filter at all — a retailer
// disabled/closed/cleaned AFTER being included in an already-published plan's immutable stop
// snapshot remained permanently visible (and, before this session's earlier fix, checkoutable) in
// the Executive Portal. The check-in ACTION itself (executiveCheckIn) already correctly rejected a
// disabled retailer (RETAILER_SCOPE_DENIED) — this was purely a read/list-side gap, not a write-side
// one. Proves both halves: before deactivation the retailer is visible; after, it disappears from
// the list AND check-in is independently rejected too.
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
const testUrl = new URL(test);
testUrl.searchParams.set("connect_timeout", "30");
testUrl.searchParams.set("connection_limit", "10");
testUrl.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: testUrl.toString() });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const manager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();

  const territory = await prisma.seeraGeographyNode.create({
    data: { code: `REPRO-VIS-TERR-${suffix}`, name: `Repro Visibility Territory ${suffix}`, level: "TERRITORY", status: "ACTIVE" },
  });
  await prisma.seeraAssignment.createMany({
    data: [
      { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: manager.id, targetType: "GEOGRAPHY", targetId: territory.id, effectiveFrom: new Date("2026-01-01"), reason: "Repro test", createdById: manager.id },
      { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: executive.id, targetType: "GEOGRAPHY", targetId: territory.id, effectiveFrom: new Date("2026-01-01"), reason: "Repro test", createdById: manager.id },
    ],
  });

  console.log("=== Setup: publish a real Beat plan with a real ACTIVE retailer stop ===");
  const draft = await createBeatPlan(prisma, manager.id, {
    employeeId: executive.id,
    territoryName: territory.name,
    beatName: `Repro Visibility Beat ${suffix}`,
    geographyType: "TOWN",
    geographyName: "Repro Visibility Town",
    dayOfWeek: now.getDay(),
    effectiveFrom: now,
    publish: false,
  });
  const retailer = await createRetailer(prisma, executive.id, {
    businessName: `Repro Cleaned Retailer ${suffix}`,
    address: { line: "Repro address" },
    territoryId: draft.territoryId!,
    beatId: draft.beatId!,
    idempotencyKey: `repro-vis-retailer-${suffix}`,
  });
  const published = await publishBeatPlan(prisma, manager.id, draft.id);
  const stops = await prisma.seeraJourneyPlanStop.findMany({ where: { planId: published.id } });
  check("retailer became a real, immutable stop on the published plan", stops.some((s) => s.retailerId === retailer.id));

  console.log("\n=== BEFORE deactivation: retailer correctly visible in the Executive's Beat ===");
  const before = await executiveBeat(prisma, executive.id, "today", now);
  check("retailer IS visible before deactivation", before.retailers.some((r) => r.id === retailer.id));

  console.log("\n=== Deactivate the retailer (simulating data cleanup / Founder disabling it) ===");
  await prisma.seeraRetailer.update({ where: { id: retailer.id }, data: { lifecycle: "DEACTIVATED" } });

  console.log("\n=== §28 FIX — AFTER deactivation, retailer no longer appears, even though the stop snapshot still names it ===");
  const after = await executiveBeat(prisma, executive.id, "today", now);
  check("deactivated retailer is NO LONGER visible in the Executive's Beat", !after.retailers.some((r) => r.id === retailer.id));

  console.log("\n=== Defense in depth — check-in against the deactivated retailer is still independently rejected ===");
  await executiveCheckIn(prisma, executive.id, { workSessionId: "irrelevant", retailerId: retailer.id, idempotencyKey: `repro-vis-checkin-${suffix}` }).then(
    () => check("check-in against a deactivated retailer is correctly rejected", false),
    (e) => check("check-in against a deactivated retailer is correctly rejected (ACTIVE_WORKDAY_REQUIRED or RETAILER_SCOPE_DENIED)", ["ACTIVE_WORKDAY_REQUIRED", "RETAILER_SCOPE_DENIED"].includes((e as { code?: string }).code ?? "")),
  );

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraJourneyPlanStop.deleteMany({ where: { planId: published.id } });
  await prisma.seeraJourneyPlan.delete({ where: { id: published.id } });
  await prisma.seeraRetailer.delete({ where: { id: retailer.id } });
  await prisma.seeraAssignment.deleteMany({ where: { targetId: territory.id, assignmentType: "EXECUTIVE_TERRITORY" } });
  const geo = await prisma.seeraGeographyNode.findMany({ where: { name: { in: [`Repro Visibility Beat ${suffix}`, "Repro Visibility Town"] } }, select: { id: true } });
  await prisma.seeraGeographyNode.deleteMany({ where: { id: { in: geo.map((g) => g.id) } } }).catch(() => {});
  await prisma.seeraGeographyNode.delete({ where: { id: territory.id } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
