import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createTerritory, createBeat, updateGeographyNode, territoriesAndBeats, assignExecutiveTerritory, removeExecutiveTerritoryAssignment, activeExecutiveTerritoryAssignments } from "../../lib/sales-distribution/operational-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live end-to-end smoke test for the Founder/Admin Territory & Beat management gap fix
// (Bhilwara/Manoj onboarding). Exercises real service functions against TEST DB, never production.

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
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

let pass = 0, fail = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (cond) { pass++; console.log(`  PASS: ${message}`); } else { fail++; console.error(`  FAIL: ${message}`); }
}
async function expectDenied(fn: () => Promise<unknown>, code: string, label: string) {
  try { await fn(); fail++; console.error(`  FAIL: ${label} — expected ${code} but succeeded`); }
  catch (error) { const actual = error instanceof FoundationError ? error.code : String(error); assert(actual === code, `${label} — expected ${code}, got ${actual}`); }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const run = Date.now().toString(36);

  console.log("\n=== Create Territory ===");
  const territory = await createTerritory(db, founder.id, { name: `Test Territory ${run}`, headquarters: "Test City", state: "Test State", status: "ACTIVE" });
  assert(territory.level === "TERRITORY" && territory.status === "ACTIVE", "territory created with level=TERRITORY, status=ACTIVE");
  const territoryAgain = await createTerritory(db, founder.id, { name: `Test Territory ${run}` });
  assert(territoryAgain.id === territory.id, "duplicate-name create is idempotent (returns existing)");

  console.log("\n=== Non-Founder cannot create Territory ===");
  await expectDenied(() => createTerritory(db, manager.id, { name: `Manager Attempt ${run}` }), "ACCESS_DENIED", "Sales Manager (network:manage only) cannot create Territory");

  console.log("\n=== Create Beat under Territory ===");
  const beat = await createBeat(db, founder.id, { name: `Test Beat ${run}`, territoryId: territory.id });
  assert(beat.level === "BEAT" && beat.parentId === territory.id, "beat created under the correct territory");

  console.log("\n=== Read model ===");
  const list = await territoriesAndBeats(db, founder.id);
  const found = list.find((x) => x.territory.id === territory.id);
  assert(!!found && found.beats.some((b) => b.id === beat.id), "territoriesAndBeats returns the new territory with its beat nested");

  console.log("\n=== Update Territory status ===");
  const updated = await updateGeographyNode(db, founder.id, territory.id, { status: "INACTIVE" });
  assert(updated.status === "INACTIVE", "territory status updated");
  await updateGeographyNode(db, founder.id, territory.id, { status: "ACTIVE" });

  console.log("\n=== Assign Sales Manager to Territory ===");
  const assignment = await assignExecutiveTerritory(db, founder.id, { userId: manager.id, territoryId: territory.id, reason: "Smoke test assignment" });
  assert(assignment.subjectId === manager.id && assignment.targetId === territory.id, "assignment created");
  const assignmentAgain = await assignExecutiveTerritory(db, founder.id, { userId: manager.id, territoryId: territory.id, reason: "retry" });
  assert(assignmentAgain.id === assignment.id, "duplicate assignment is idempotent");

  const assignmentData = await activeExecutiveTerritoryAssignments(db, founder.id);
  assert(assignmentData.assignments.some((a) => a.id === assignment.id), "assignment appears in the read model");

  console.log("\n=== Non-Founder cannot assign ===");
  await expectDenied(() => assignExecutiveTerritory(db, manager.id, { userId: manager.id, territoryId: territory.id, reason: "self-attempt" }), "ACCESS_DENIED", "Sales Manager cannot self-assign a territory");

  console.log("\n=== Remove assignment ===");
  const removed = await removeExecutiveTerritoryAssignment(db, founder.id, assignment.id, "Smoke test cleanup");
  assert(!!removed.effectiveTo, "assignment closed via effectiveTo, not deleted");
  const assignmentDataAfter = await activeExecutiveTerritoryAssignments(db, founder.id);
  assert(!assignmentDataAfter.assignments.some((a) => a.id === assignment.id), "removed assignment no longer active");

  console.log(`\n\n========== RESULT: ${pass} passed, ${fail} failed ==========`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
