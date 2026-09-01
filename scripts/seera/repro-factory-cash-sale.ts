import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createFactoryCashSale, factoryCashSalesForPeriod } from "../../lib/finance/factory-cash-sale-service";

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
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  const sale = await createFactoryCashSale(prisma, founder.id, {
    saleDate: new Date("2026-08-15"),
    partyName: "Walk-in Cash Customer",
    amount: 4500,
    notes: "Factory gate cash sale test",
  });
  check("sale created with correct amount", Number(sale.amount) === 4500);
  check("sale has no ledger/order linkage fields", !("orderId" in sale) && !("ledgerEntryId" in sale));

  try {
    await createFactoryCashSale(prisma, founder.id, { saleDate: new Date(), amount: 0 });
    check("zero amount rejected", false);
  } catch (e) {
    check("zero amount rejected", (e as { code?: string }).code === "INVALID_AMOUNT");
  }

  const period = await factoryCashSalesForPeriod(prisma, founder.id, new Date("2026-08-01"), new Date("2026-09-01"));
  check("period read model includes the created sale", period.rows.some((r) => r.id === sale.id));
  check("period total includes the amount", period.total >= 4500);

  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  try {
    await createFactoryCashSale(prisma, executive.id, { saleDate: new Date(), amount: 100 });
    check("unauthorized actor rejected", false);
  } catch (e) {
    check("unauthorized actor rejected", (e as { code?: string }).code === "ACCESS_DENIED" || (e as { status?: number }).status === 403);
  }

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFactoryCashSale.deleteMany({ where: { id: sale.id } });
  const remaining = await prisma.seeraFactoryCashSale.count({ where: { notes: "Factory gate cash sale test" } });
  console.log(`Remaining test rows: ${remaining}`);
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
