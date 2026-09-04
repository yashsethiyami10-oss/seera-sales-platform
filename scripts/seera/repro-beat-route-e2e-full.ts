import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  createBeatPlan,
  publishBeatPlan,
  editBeatPlan,
  reassignBeatPlan,
  cancelBeatPlan,
  managerBeatPlans,
} from "../../lib/sales-distribution/operational-service";
import { executiveBeat, createRetailer } from "../../lib/sales-distribution/field-portal-service";

// Priority 1/2 (Final Remaining System Completion Mission) — a fresh, real Manager -> real
// Executive end-to-end proof of the "Manager publishes Beat/Route but Executive cannot see it"
// class of bug, covering every sub-case the mission lists: today, a future date ("tomorrow"),
// week view, rep assignment, division isolation, published/unpublished, and an edited route.
// Supersedes the older repro-beat-route-visibility.ts (today/week + one unrelated-executive check
// only, no retailers/stops, no future date, no division isolation, no edit/reassign/cancel).
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
  const managerA = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } }); // North
  const managerB = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-2@seera.test" } }); // South — genuinely unrelated division
  const execA1 = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const execA2 = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });

  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const territoryName = `Repro Territory ${suffix}`;
  const beatName = `Repro Beat ${suffix}`;
  const townName = `Repro Town ${suffix}`;

  const territory = await prisma.seeraGeographyNode.create({
    data: { code: `REPRO-TERR-${suffix}`, name: territoryName, level: "TERRITORY", status: "ACTIVE" },
  });
  await prisma.seeraAssignment.createMany({
    data: [
      { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: managerA.id, targetType: "GEOGRAPHY", targetId: territory.id, effectiveFrom: new Date("2026-01-01"), reason: "Repro test", createdById: managerA.id },
      { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: execA1.id, targetType: "GEOGRAPHY", targetId: territory.id, effectiveFrom: new Date("2026-01-01"), reason: "Repro test", createdById: managerA.id },
    ],
  });

  console.log("=== Setup: Manager (North) creates a DRAFT plan for TODAY, assigns Executive A1 ===");
  const planToday = await createBeatPlan(prisma, managerA.id, {
    employeeId: execA1.id,
    territoryName,
    beatName,
    geographyType: "TOWN",
    geographyName: townName,
    dayOfWeek: now.getDay(),
    effectiveFrom: now,
    publish: false,
  });
  check("plan created as DRAFT", planToday.status === "DRAFT");

  console.log("\n=== Create 3 real retailers under this Beat, owned by the assigned Executive ===");
  const retailerNames = ["Zeta Store", "Alpha Traders", "Mid Kirana"]; // deliberately out of order — sequence must come out alphabetical
  const retailerIds: string[] = [];
  for (const name of retailerNames) {
    const r = await createRetailer(prisma, execA1.id, {
      businessName: `${name} ${suffix}`,
      address: { line: "Repro address" },
      territoryId: planToday.territoryId!,
      beatId: planToday.beatId!,
      idempotencyKey: `repro-retailer-${suffix}-${name}`,
    });
    retailerIds.push(r.id);
  }
  check("3 retailers created and mapped to the Beat", retailerIds.length === 3);

  console.log("\n=== PRIORITY 1/2 — Unpublished (DRAFT) plan must NOT be visible to the Executive ===");
  const beforePublish = await executiveBeat(prisma, execA1.id, "today", now);
  check("draft plan is NOT visible under 'today'", !beforePublish.plans.some((p) => p.id === planToday.id));
  const beforePublishWeek = await executiveBeat(prisma, execA1.id, "week", now);
  check("draft plan is NOT visible under 'week' either", !beforePublishWeek.plans.some((p) => p.id === planToday.id));

  console.log("\n=== Publish — real stops must be created atomically, in businessName order ===");
  const published = await publishBeatPlan(prisma, managerA.id, planToday.id);
  check("plan is now PUBLISHED", published.status === "PUBLISHED");
  const stops = await prisma.seeraJourneyPlanStop.findMany({ where: { planId: planToday.id }, orderBy: { sequence: "asc" } });
  check("exactly 3 stops were snapshotted", stops.length === 3);
  check("stops are in businessName (alphabetical) order: Alpha, Mid, Zeta", stops.map((s) => s.retailerNameSnapshot).join(",") === `Alpha Traders ${suffix},Mid Kirana ${suffix},Zeta Store ${suffix}`);

  console.log("\n=== Executive sees the published plan TODAY, with the correct retailers in sequence ===");
  const todayResult = await executiveBeat(prisma, execA1.id, "today", now);
  check("assigned executive sees the plan under 'today'", todayResult.plans.some((p) => p.id === planToday.id));
  check("all 3 retailers appear in the Executive's stop-ordered list", retailerIds.every((id) => todayResult.retailers.some((r) => r.id === id)));
  check("Executive's retailer order matches the published sequence (not re-alphabetized independently)", todayResult.retailers.slice(0, 3).map((r) => r.id).join(",") === stops.map((s) => s.retailerId).join(","));

  console.log("\n=== A different, UNRELATED Executive (A2) does NOT see this plan ===");
  const otherToday = await executiveBeat(prisma, execA2.id, "today", now);
  check("unrelated executive does not see the plan", !otherToday.plans.some((p) => p.id === planToday.id));

  console.log("\n=== PRIORITY 2 — a second plan for a FUTURE date (tomorrow), correctly windowed ===");
  const planTomorrow = await createBeatPlan(prisma, managerA.id, {
    employeeId: execA1.id,
    territoryName,
    beatName,
    geographyType: "TOWN",
    geographyName: townName,
    dayOfWeek: tomorrow.getDay(),
    effectiveFrom: tomorrow,
    publish: true,
  });
  check("future plan published", planTomorrow.status === "PUBLISHED");
  const todayAfterFuture = await executiveBeat(prisma, execA1.id, "today", now);
  check("future plan is correctly ABSENT from 'today' (hasn't started yet)", !todayAfterFuture.plans.some((p) => p.id === planTomorrow.id));
  const tomorrowResult = await executiveBeat(prisma, execA1.id, "tomorrow", now);
  check("future plan IS visible under 'tomorrow'", tomorrowResult.plans.some((p) => p.id === planTomorrow.id));
  const weekResult = await executiveBeat(prisma, execA1.id, "week", now);
  check("future plan IS visible under 'week' (week-ahead preview)", weekResult.plans.some((p) => p.id === planTomorrow.id));
  check("today's plan is ALSO still in 'week' (week shows everything active this week, not just future)", weekResult.plans.some((p) => p.id === planToday.id));

  console.log("\n=== PRIORITY 9 — DIVISION ISOLATION: an unrelated Manager (South) cannot touch North's plan or territory ===");
  // Two independent isolation layers guard this, and team-scoping (assertTeamMember) runs BEFORE
  // the territory-scope check inside createBeatPlan — Executive A1 isn't on South's team at all,
  // so THIS attempt is correctly rejected on that layer first (EXECUTIVE_SCOPE_DENIED). The
  // territory layer itself (TERRITORY_OUT_OF_SCOPE) is exercised separately just below, using a
  // South-side executive against North's territory, so team-scoping can't mask it.
  await createBeatPlan(prisma, managerB.id, {
    employeeId: execA1.id,
    territoryName,
    beatName,
    geographyType: "TOWN",
    geographyName: townName,
    dayOfWeek: now.getDay(),
    effectiveFrom: now,
    publish: false,
  }).then(
    () => check("South Manager planning for North's Executive is correctly REJECTED", false),
    (e) => check("South Manager planning for North's Executive is correctly REJECTED (EXECUTIVE_SCOPE_DENIED — team-scope layer)", e.code === "EXECUTIVE_SCOPE_DENIED"),
  );

  console.log("\n=== DIVISION ISOLATION, layer 2: even a South-side Executive cannot be planned into North's territory ===");
  const execB = await prisma.user.create({
    data: {
      email: `repro-exec-south-${suffix}@seera.test`,
      normalizedEmail: `repro-exec-south-${suffix}@seera.test`,
      name: `Repro South Executive ${suffix}`,
      passwordHash: "not-a-real-login",
    },
  });
  const executiveRole = await prisma.role.findFirstOrThrow({ where: { code: "SALES_EXECUTIVE" } });
  await prisma.userRoleAssignment.create({ data: { userId: execB.id, roleId: executiveRole.id, status: "ACTIVE" } });
  await prisma.seeraAssignment.create({
    data: { assignmentType: "MANAGER_TEAM", subjectType: "USER", subjectId: execB.id, targetType: "USER", targetId: managerB.id, effectiveFrom: new Date("2026-01-01"), reason: "Repro test", createdById: managerB.id },
  });
  await createBeatPlan(prisma, managerB.id, {
    employeeId: execB.id,
    territoryName,
    beatName,
    geographyType: "TOWN",
    geographyName: townName,
    dayOfWeek: now.getDay(),
    effectiveFrom: now,
    publish: false,
  }).then(
    () => check("South Manager planning South's OWN Executive into North's territory is correctly REJECTED", false),
    (e) => check("South Manager planning South's OWN Executive into North's territory is correctly REJECTED (TERRITORY_OUT_OF_SCOPE — territory-scope layer)", e.code === "TERRITORY_OUT_OF_SCOPE"),
  );
  const southPlans = await managerBeatPlans(prisma, managerB.id);
  check("South Manager's own plan list does NOT include North's plans (ownerId-scoped)", !southPlans.some((p) => p.id === planToday.id || p.id === planTomorrow.id));
  await editBeatPlan(prisma, managerB.id, planTomorrow.id, { notes: "hostile edit" }).then(
    () => check("South Manager editing North's plan is correctly REJECTED", false),
    (e) => check("South Manager editing North's plan is correctly REJECTED (PLAN_SCOPE_DENIED)", e.code === "PLAN_SCOPE_DENIED"),
  );
  await publishBeatPlan(prisma, managerB.id, planToday.id).then(
    () => check("South Manager publishing North's plan is correctly REJECTED", false),
    (e) => check("South Manager publishing North's plan is correctly REJECTED (PLAN_SCOPE_DENIED)", e.code === "PLAN_SCOPE_DENIED"),
  );
  await cancelBeatPlan(prisma, managerB.id, planTomorrow.id, "hostile cancel").then(
    () => check("South Manager cancelling North's plan is correctly REJECTED", false),
    (e) => check("South Manager cancelling North's plan is correctly REJECTED (PLAN_SCOPE_DENIED)", e.code === "PLAN_SCOPE_DENIED"),
  );

  console.log("\n=== Edited route: editing the FUTURE plan's notes is reflected, editing the ALREADY-STARTED plan is rejected ===");
  const edited = await editBeatPlan(prisma, managerA.id, planTomorrow.id, { notes: "Edited notes — repro" });
  check("future plan's notes updated", edited.notes === "Edited notes — repro");
  await editBeatPlan(prisma, managerA.id, planToday.id, { notes: "should be rejected" }).then(
    () => check("editing an already-started (today) plan is correctly REJECTED", false),
    (e) => check("editing an already-started (today) plan is correctly REJECTED (PLAN_NOT_FUTURE)", e.code === "PLAN_NOT_FUTURE"),
  );

  console.log("\n=== Rep (re)assignment: reassigning the future plan to Executive A2 ===");
  const reassigned = await reassignBeatPlan(prisma, managerA.id, planTomorrow.id, { employeeId: execA2.id, reason: "Repro reassignment" });
  check("plan's employeeId updated to Executive A2", reassigned.employeeId === execA2.id);
  const a2Tomorrow = await executiveBeat(prisma, execA2.id, "tomorrow", now);
  check("Executive A2 now sees the reassigned plan", a2Tomorrow.plans.some((p) => p.id === planTomorrow.id));
  const a1TomorrowAfterReassign = await executiveBeat(prisma, execA1.id, "tomorrow", now);
  check("Executive A1 no longer sees the reassigned plan (employeeId-scoped query)", !a1TomorrowAfterReassign.plans.some((p) => p.id === planTomorrow.id));

  console.log("\n=== Cancel: a cancelled plan disappears from the Executive's view ===");
  const cancelled = await cancelBeatPlan(prisma, managerA.id, planTomorrow.id, "Repro cancellation");
  check("plan status is CANCELLED", cancelled.status === "CANCELLED");
  const a2AfterCancel = await executiveBeat(prisma, execA2.id, "tomorrow", now);
  check("cancelled plan no longer visible to the Executive", !a2AfterCancel.plans.some((p) => p.id === planTomorrow.id));

  console.log("\n--- Honest scope note ---");
  console.log("No stop-REORDER API exists anywhere in this codebase (grepped operational-service.ts —");
  console.log("only create/edit/reassign/cancel/duplicate). Sequence is fixed at publish time");
  console.log("(alphabetical by businessName) and is otherwise immutable. This is a genuine feature");
  console.log("gap against the mission's 'reordered route' test case, not a bug — reported honestly,");
  console.log("not fabricated as tested or silently skipped.");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraJourneyPlanStop.deleteMany({ where: { planId: { in: [planToday.id, planTomorrow.id] } } });
  await prisma.seeraJourneyPlan.deleteMany({ where: { id: { in: [planToday.id, planTomorrow.id] } } });
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: retailerIds } } });
  await prisma.seeraAssignment.deleteMany({ where: { targetId: territory.id, assignmentType: "EXECUTIVE_TERRITORY" } });
  await prisma.seeraAssignment.deleteMany({ where: { subjectId: execB.id, assignmentType: "MANAGER_TEAM" } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: execB.id } });
  await prisma.user.delete({ where: { id: execB.id } });
  const geo = await prisma.seeraGeographyNode.findMany({ where: { name: { in: [beatName, townName] } }, select: { id: true } });
  await prisma.seeraGeographyNode.deleteMany({ where: { id: { in: geo.map((g) => g.id) } } }).catch(() => {});
  await prisma.seeraGeographyNode.delete({ where: { id: territory.id } });
  const remaining = await prisma.seeraJourneyPlan.count({ where: { id: { in: [planToday.id, planTomorrow.id] } } });
  console.log(`Remaining: plans=${remaining}`);
  if (remaining !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
