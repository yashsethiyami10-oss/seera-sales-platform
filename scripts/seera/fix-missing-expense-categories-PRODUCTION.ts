import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";
import { retryMoneyDeskTransaction } from "../../lib/finance/money-desk-service";

// Post-Audit Gap Closure, Phase 3 — FOUNDER-EXECUTED FIX for a real, confirmed production defect.
//
// ROOT CAUSE (confirmed via direct read-only production inspection this session): the base Chart of
// Accounts expense-category seed (seedDefaultChartOfAccounts, the exact same function already used
// everywhere else in this codebase — no new code, no new engine) never fully completed against
// production at some point in the past. Specifically, code "5230" ("Miscellaneous") — the fallback
// every Quick-Entry-Expense purpose without its own dedicated category code falls back to — does
// not exist in production's SeeraExpenseCategory table, even though all 33 QE-* categories from the
// SEPARATE quick-entry seeder do exist. This left 8 real Money Desk transactions permanently stuck
// in POSTING with a raw Prisma "No SeeraExpenseCategory found" failureReason (purposeCodes: OTHER,
// EXP-FUEL, EXP-PACK), dated 2026-08-22 through 2026-09-02 — genuinely stuck since creation, never
// auto-recovering, because retryMoneyDeskTransaction would just hit the identical missing-row error
// every time.
//
// THE FIX: re-run the EXISTING seedDefaultChartOfAccounts() unchanged. It is idempotent BY
// CONSTRUCTION — every write is `upsert({ where: { code }, update: {}, create: ... })`, meaning it
// can ONLY ever create a row that is genuinely missing; it is architecturally incapable of
// modifying or overwriting anything that already exists (update: {} is a deliberate no-op on an
// existing match). Running it again is exactly as safe as running it the first time, and this
// script changes nothing else — no new categories invented, no schema change, no business-data
// touched beyond this one governed, already-audited reference-data seed.
//
// After seeding, this script retries the 8 specific stuck transactions above through the REAL,
// governed retryMoneyDeskTransaction() — the same recovery path Accounts/Founder already has in the
// Money Desk UI ("Needs Attention" > Retry) — so they post exactly as they would have the first
// time, with full audit trail, no shortcuts.
//
// A 9th stuck transaction (MD-60817C2372D198DD, REC-INS/institutional-receipt, treasuryAccountId
// null) is a SEPARATE, older, pre-fix-era row — the code that would have produced its raw Prisma
// error no longer exists (requireTreasuryAccountId() already guards this path cleanly). It is NOT
// touched by this script: a null treasuryAccountId is missing information this script cannot
// safely guess — it needs a human to open that transaction in Money Desk, use EDIT/CORRECT to pick
// the real Cash/Bank account it should have been posted against, then Retry. Left exactly as-is here.
//
// USAGE: npx tsx scripts/seera/fix-missing-expense-categories-PRODUCTION.ts           (dry run)
//        npx tsx scripts/seera/fix-missing-expense-categories-PRODUCTION.ts --execute  (apply)

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const prod = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
const EXECUTE = process.argv.includes("--execute");
const target = authorizeDatabaseCommand({ intendedRole: "production", write: EXECUTE, targetUrl: prod, productionUrl: prod, testUrl: test });
const db = new PrismaClient({ datasourceUrl: prod });

const STUCK_TRANSACTION_NUMBERS = [
  "MD-278887B71A2F8774",
  "MD-503444482D1D760C",
  "MD-AF1D86A7E9EAB04C",
  "MD-BA0A87A57AEFA0A1",
  "MD-900BB345F7EEF689",
  "MD-62834E34CE564F27",
  "MD-3BA36FBFD36CDD6B",
  "MD-A08A871E7D80A634",
];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} mode=${EXECUTE ? "EXECUTE" : "DRY RUN (no changes)"}\n`);

  const before = await db.seeraExpenseCategory.findFirst({ where: { code: "5230" } });
  console.log(`Before: code 5230 exists = ${Boolean(before)}`);

  const founder = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "FOUNDER_SUPER_ADMIN" } } } } });
  console.log(`Acting as Founder: ${founder.email}\n`);

  if (!EXECUTE) {
    console.log("DRY RUN — would call seedDefaultChartOfAccounts() (idempotent upsert, creates only what's missing), then retry:");
    for (const num of STUCK_TRANSACTION_NUMBERS) console.log(`  would retry: ${num}`);
    console.log("\nPass --execute to apply.");
    return;
  }

  const seedResult = await seedDefaultChartOfAccounts(db, founder.id);
  console.log(`Seed complete: ${seedResult.accounts.length} chart-of-account rows, ${seedResult.categories.length} expense-category rows upserted (existing rows untouched).`);

  const after = await db.seeraExpenseCategory.findFirst({ where: { code: "5230" } });
  console.log(`After: code 5230 exists = ${Boolean(after)}`);
  if (!after) throw new Error("5230 still missing after seed — do not proceed to retry");

  console.log("\n=== Retrying the 8 stuck transactions ===");
  for (const num of STUCK_TRANSACTION_NUMBERS) {
    const txn = await db.seeraMoneyDeskTransaction.findUnique({ where: { transactionNumber: num } });
    if (!txn) { console.log(`  ${num}: NOT FOUND — skipped`); continue; }
    try {
      const result = await retryMoneyDeskTransaction(db, founder.id, txn.id);
      console.log(`  ${num}: status now ${result.status}`);
    } catch (e) {
      console.log(`  ${num}: retry failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nDone. Verify the Money Desk 'Needs Attention' queue directly to confirm.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
