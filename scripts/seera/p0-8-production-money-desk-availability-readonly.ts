import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { moneyDeskHome, moneyDeskSupportingData } from "../../lib/finance/money-desk-service";

// P0-8 (Money Desk 2.0 Final Gap Closure) — READ-ONLY production re-test of the "Money Desk data
// temporarily unavailable" bug. Calls the SAME functions the real Money Desk screen calls
// (moneyDeskHome / moneyDeskSupportingData) directly against PRODUCTION for every real,
// currently-ACTIVE user holding money_desk:view, and reports which section (if any) throws —
// resilientList's per-query .catch() means a genuine section failure degrades to an empty array
// rather than crashing the whole screen, so this also confirms whether the resilience fix is
// actually holding in production, not just in TEST DB.
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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
if (target.role !== "production") throw new Error("ABORT: expected production");
const db = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);

  const permission = await db.permission.findUnique({ where: { code: "money_desk:view" } });
  if (!permission) {
    console.log("money_desk:view permission not found in production — cannot enumerate real holders. Reporting honestly rather than guessing.");
    return;
  }
  const roleIds = (await db.rolePermission.findMany({ where: { permissionId: permission.id }, select: { roleId: true } })).map((r) => r.roleId);
  const assignments = roleIds.length
    ? await db.userRoleAssignment.findMany({ where: { roleId: { in: roleIds }, status: "ACTIVE" }, include: { user: true }, distinct: ["userId"] })
    : [];
  console.log(`Found ${assignments.length} real, currently-ACTIVE production user(s) holding money_desk:view.\n`);
  if (assignments.length === 0) {
    console.log("No real production user currently holds money_desk:view — nothing to test live. Reporting honestly rather than fabricating a user.");
    return;
  }

  let anyFailure = false;
  for (const a of assignments) {
    const u = a.user;
    console.log(`--- Testing as userId=${u.id} (${u.name ?? u.normalizedEmail}) ---`);
    try {
      const home = await moneyDeskHome(db, u.id);
      console.log(`  moneyDeskHome OK — recentTransactions=${home.recentTransactions.length} pendingApprovals=${home.pendingApprovals.length} needsAttention=${home.needsAttention.length} cashBankAccounts=${home.cashBankToday.length}`);
    } catch (e) {
      anyFailure = true;
      console.error(`  moneyDeskHome THREW: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const supporting = await moneyDeskSupportingData(db, u.id);
      console.log(`  moneyDeskSupportingData OK — treasuryAccounts=${supporting.treasuryAccounts?.length ?? "n/a"} employees=${supporting.employees?.length ?? "n/a"} retailers=${supporting.retailers?.length ?? "n/a"}`);
    } catch (e) {
      anyFailure = true;
      console.error(`  moneyDeskSupportingData THREW: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n=== RESULT: ${anyFailure ? "AT LEAST ONE FAILURE — investigate the stack trace(s) above" : "ALL real production users with money_desk:view load Money Desk data cleanly — no 'Data Unavailable' reproduction"} ===`);
  if (anyFailure) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
