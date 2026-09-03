import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// P1-13 (Money Desk 2.0 Final Gap Closure) — final TEST DB baseline sweep. Read-only. Checks for
// orphaned debris matching THIS session's own naming conventions (suffixes like "E2E ", "Retry
// Test", "Report Recon", "P0 ", "Auto-Invoice", "Corporate Test", "PR Test") left behind by any
// script run in this session that may not have cleaned up completely.
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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: expected test");
const prisma = new PrismaClient({ datasourceUrl: test });

const SESSION_MARKERS = ["E2E ", "Retry Test", "Report Recon", "P0 ", "Auto-Invoice", "Corporate Test", "PR Test", "PR Pending", "PR Payee"];
const orFilter = (field: string) => ({ OR: SESSION_MARKERS.map((m) => ({ [field]: { contains: m } })) });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);

  const orphanTxns = await prisma.seeraMoneyDeskTransaction.findMany({ where: orFilter("counterpartyName"), select: { id: true, transactionNumber: true, counterpartyName: true, status: true } });
  console.log(`Orphaned Money Desk transactions (session-marker match): ${orphanTxns.length}`);
  for (const t of orphanTxns) console.log(`  ${t.transactionNumber} | ${t.counterpartyName} | ${t.status}`);

  const orphanRetailers = await prisma.seeraRetailer.findMany({ where: orFilter("businessName"), select: { id: true, businessName: true } });
  console.log(`\nOrphaned retailers (session-marker match): ${orphanRetailers.length}`);
  for (const r of orphanRetailers) console.log(`  ${r.businessName}`);

  const orphanVendors = await prisma.seeraVendor.findMany({ where: orFilter("legalName"), select: { id: true, legalName: true } });
  console.log(`\nOrphaned vendors (session-marker match): ${orphanVendors.length}`);
  for (const v of orphanVendors) console.log(`  ${v.legalName}`);

  const orphanDocs = await prisma.seeraCommercialDocument.count({ where: { issuerId: "COMPANY" } });
  console.log(`\nTotal COMPANY-issuer commercial documents remaining in TEST DB: ${orphanDocs} (0 expected — every test script that issues one cleans it up)`);

  const orphanFactoryCashSales = await prisma.seeraFactoryCashSale.findMany({ where: orFilter("partyName"), select: { id: true, partyName: true } });
  console.log(`\nOrphaned factory cash sales (session-marker match): ${orphanFactoryCashSales.length}`);

  const stuckMoneyDesk = await prisma.seeraMoneyDeskTransaction.count({ where: { status: "POSTING", failureReason: { not: null } } });
  console.log(`\nTEST DB transactions currently in Needs Attention: ${stuckMoneyDesk} (0 expected at baseline)`);

  const total = orphanTxns.length + orphanRetailers.length + orphanVendors.length + orphanDocs + orphanFactoryCashSales.length + stuckMoneyDesk;
  console.log(`\n=== ${total === 0 ? "BASELINE CLEAN — zero orphans found" : `${total} ORPHAN(S) FOUND — see detail above`} ===`);
  if (total !== 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
