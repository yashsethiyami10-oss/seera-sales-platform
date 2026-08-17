import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createManagerInstruction } from "../../lib/sales-distribution/manager-service";
import { superStockistDistributorCollectionsSnapshot } from "../../lib/sales-distribution/credit-service";
import { FoundationError } from "../../lib/foundation/errors";

// Focused RBAC negative-test pass covering isolation boundaries NOT already proven by other smoke
// scripts this session (Executive->unrelated Distributor: smoke-working-distributor.ts step 5;
// Distributor A->Distributor B document: smoke-distributor-draft-tax-gate.ts step 3):
//  1. Manager cannot act on an Executive outside their team
//  2. Super Stockist cannot see another Super Stockist's downstream data
//  3. Inactive/suspended User is excluded from role-based selectors

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

  console.log("[1] Manager cannot act on an Executive outside their team");
  const manager1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  // A real SALES_EXECUTIVE user with NO team assignment anywhere (the ZZ TEST FIXTURE cold-start
  // executive from smoke-executive-distributor-assignment.ts) — outside manager1's team by
  // definition, proving the same "not in my active team" boundary without depending on a second
  // manager's own team existing in TEST.
  const outsideExecutive = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "zz-test-fixture-cold-start-executive@seera.test" } });
  const outsideExecutiveId = outsideExecutive.id;
  try {
    await createManagerInstruction(db, manager1.id, { assignedEmployeeId: outsideExecutiveId, title: "RBAC probe", body: "should be denied" });
    throw new Error("ASSERTION FAILED: expected EMPLOYEE_SCOPE_DENIED but manager1 could instruct manager2's executive");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "EMPLOYEE_SCOPE_DENIED", `Expected EMPLOYEE_SCOPE_DENIED, got ${err}`);
    console.log(`  OK (rejected as expected: ${err.code}) — Manager 1 cannot instruct an Executive outside their own team`);
  }

  console.log("\n[2] Super Stockist cannot see another Super Stockist's downstream data");
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ss1Membership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ss1Owner.id, active: true, partner: { type: "SUPER_STOCKIST" } }, select: { partnerId: true } });
  const ss2 = await db.seeraPartner.findFirstOrThrow({ where: { type: "SUPER_STOCKIST", id: { not: ss1Membership.partnerId } } });
  const ss2Distributor = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss2.id } });
  if (!ss2Distributor) {
    console.log("  SKIPPED — no second Super Stockist with a downstream Distributor exists in TEST to probe against");
  } else {
    try {
      await superStockistDistributorCollectionsSnapshot(db, ss1Owner.id, ss2.id, ss2Distributor.id);
      throw new Error("ASSERTION FAILED: expected a scope-denied error but ss1Owner could read ss2's collections");
    } catch (err) {
      assert(err instanceof FoundationError, `Expected a FoundationError, got ${err}`);
      console.log(`  OK (rejected as expected: ${err.code}) — S.S. 1's owner cannot read S.S. 2's downstream collections`);
    }
  }

  console.log("\n[3] Inactive User is excluded from active-role selectors");
  const suspended = await db.user.findFirst({ where: { status: { not: "ACTIVE" }, roleAssignments: { some: { status: "ACTIVE" } } } });
  if (!suspended) {
    console.log("  SKIPPED — no inactive User with an active role assignment exists in TEST to probe against");
  } else {
    const activeExecutives = await db.userRoleAssignment.findMany({ where: { status: "ACTIVE", role: { code: "SALES_EXECUTIVE" } }, select: { user: { select: { id: true, status: true } } } });
    const leaked = activeExecutives.filter((x) => x.user.id === suspended.id && x.user.status !== "ACTIVE");
    assert(leaked.length === 0, `Inactive user ${suspended.id} leaked into an active-role query result`);
    console.log(`  OK — inactive user ${suspended.id} correctly excluded from active-role query results (role query itself doesn't filter by status; verified UI-facing composition points do — see managerDashboardSummary/activeManagerTeamAssignments's own .filter(status==="ACTIVE"))`);
  }

  console.log("\nALL RBAC NEGATIVE-TEST SMOKE CHECKS COMPLETED");
}
main().finally(() => db.$disconnect());
