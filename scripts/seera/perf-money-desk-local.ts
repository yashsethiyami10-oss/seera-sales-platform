import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction, moneyDeskHome, moneyDeskSupportingData } from "../../lib/finance/money-desk-service";

// TEST-only local timing sanity check (server-side function time only, not HTTP round trip) for
// Money Desk's Part D performance targets. Not a substitute for the real staging HTTP benchmark —
// this only rules out an obviously slow local implementation before that step.

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

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  console.log(`  ${label}: ${Math.round(performance.now() - start)}ms`);
  return result;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findFirstOrThrow({ where: { email: "review-founder@seera.test" } });
  const accountsManager = await db.user.findFirstOrThrow({ where: { email: "review-accounts-manager@seera.test" } });
  const cash = await db.seeraTreasuryAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true } });
  const run = Date.now().toString(36);

  for (let i = 0; i < 5; i++) {
    await time(`moneyDeskHome (accountsManager) run ${i + 1}`, () => moneyDeskHome(db, accountsManager.id));
  }
  for (let i = 0; i < 5; i++) {
    await time(`moneyDeskSupportingData run ${i + 1}`, () => moneyDeskSupportingData(db, accountsManager.id));
  }
  for (let i = 0; i < 5; i++) {
    await time(`simple EXP-OFFICE create+post run ${i + 1}`, () =>
      createMoneyDeskTransaction(db, accountsManager.id, {
        purposeCode: "EXP-OFFICE", direction: "CASH_OUT", amount: 200, date: new Date(), treasuryAccountId: cash.id,
        formData: {}, idempotencyKey: `perf-md-${run}-${i}`,
      }),
    );
  }
}
main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
