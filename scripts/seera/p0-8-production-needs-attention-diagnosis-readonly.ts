import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// P0-8 follow-up (read-only): diagnose the 8 real production Money Desk transactions currently
// sitting in "Needs Attention" (status POSTING, failureReason set) — differentiate genuine zero
// data / configuration missing / authorization denied / server failure rather than guessing.
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
  const stuck = await db.seeraMoneyDeskTransaction.findMany({
    where: { status: "POSTING", failureReason: { not: null } },
    select: { id: true, transactionNumber: true, purposeCode: true, amount: true, failureReason: true, createdAt: true, requestedById: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${stuck.length} transaction(s) in Needs Attention:\n`);
  for (const t of stuck) {
    console.log(`${t.transactionNumber} | purpose=${t.purposeCode} | amount=${t.amount} | created=${t.createdAt.toISOString()}`);
    console.log(`  failureReason: ${t.failureReason}`);
  }
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
