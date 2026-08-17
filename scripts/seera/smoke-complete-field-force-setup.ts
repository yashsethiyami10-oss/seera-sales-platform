import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { completeSoleExecutiveFieldForceSetup } from "../../lib/sales-distribution/operational-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only proof for the combined "COMPLETE NEERAJ FIELD FORCE SETUP" one-click action before it
// is ever run against production. TEST intentionally has multiple active Sales Managers AND
// multiple active Sales Executives (review-sales-manager-1/2, review-sales-executive-1/2, etc.) —
// exactly the safety property to prove here too: the composed action must refuse to guess either
// target and STOP with zero writes, exactly like its two underlying primitives already do
// individually (smoke-executive-distributor-assignment.ts, smoke-ratan-bulk-assign.ts).

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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}\n`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  const activeManagerCount = await db.userRoleAssignment.count({ where: { status: "ACTIVE", role: { code: { in: ["SALES_MANAGER", "SALES_HEAD"] } } } });
  const activeExecCount = await db.userRoleAssignment.count({ where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } } });
  console.log(`TEST currently has ${activeManagerCount} active Manager/Head users and ${activeExecCount} active Executive users (production has exactly 1 of each)`);
  assert(activeManagerCount > 1 || activeExecCount > 1, "This proof requires TEST's real ambiguous multi-user state");

  const beforeManagerTeam = await db.seeraAssignment.count({ where: { assignmentType: "MANAGER_TEAM" } });
  const beforeExecDist = await db.seeraAssignment.count({ where: { assignmentType: "EXECUTIVE_DISTRIBUTOR" } });

  console.log("\n[1] Composed action correctly STOPS given TEST's ambiguous state, before any write");
  try {
    await completeSoleExecutiveFieldForceSetup(db, founder.id);
    throw new Error("ASSERTION FAILED: expected an ambiguity error but the call succeeded");
  } catch (err) {
    assert(err instanceof FoundationError, `Expected a FoundationError, got ${err}`);
    assert(
      ["MANAGER_AMBIGUOUS", "EXECUTIVE_AMBIGUOUS", "MANAGER_NOT_FOUND", "EXECUTIVE_NOT_FOUND"].includes((err as FoundationError).code),
      `Expected an unambiguous-resolution error, got ${(err as FoundationError).code}: ${(err as FoundationError).message}`,
    );
    console.log(`  OK (rejected as expected: ${(err as FoundationError).code} — "${(err as FoundationError).message}")`);
  }
  const afterManagerTeam = await db.seeraAssignment.count({ where: { assignmentType: "MANAGER_TEAM" } });
  const afterExecDist = await db.seeraAssignment.count({ where: { assignmentType: "EXECUTIVE_DISTRIBUTOR" } });
  assert(afterManagerTeam === beforeManagerTeam, `Rejection must create ZERO MANAGER_TEAM rows — before=${beforeManagerTeam}, after=${afterManagerTeam}`);
  assert(afterExecDist === beforeExecDist, `Rejection must create ZERO EXECUTIVE_DISTRIBUTOR rows — before=${beforeExecDist}, after=${afterExecDist}`);
  console.log(`  OK — zero assignment rows of either type created by the rejected call`);

  console.log("\nALL COMPLETE-FIELD-FORCE-SETUP SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
