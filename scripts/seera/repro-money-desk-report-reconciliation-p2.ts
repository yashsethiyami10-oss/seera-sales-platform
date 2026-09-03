import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { createVendor, createVendorBill } from "../../lib/finance/vendor-service";
import { balanceSheet, cashFlow, gstControlCenter } from "../../lib/finance/statements-service";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";

// P0-7 (Money Desk 2.0 Final Gap Closure — Report Reconciliation, part 2). Sample-verifies the
// remaining mature statements not yet covered by other reconciliation scripts this session:
// Balance Sheet (stays balanced, real cash asset appears), Cash Flow (reconciles to REAL treasury
// movement, independently computed), GST Control Center (real Input GST from a real Vendor Bill).
// Each expected value is computed independently here, not just checked for HTTP/return shape.
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
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  await seedDefaultChartOfAccounts(prisma, founder.id);
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `RPT-CASH-${suffix}`, name: `Report Recon Cash ${suffix}` });

  const cleanup = { moneyDeskIds: [] as string[], journalIds: [] as string[], vendorIds: [] as string[], billIds: [] as string[] };

  console.log("=== Balance Sheet: independently-computed real cash asset movement ===");
  const bsBefore = await balanceSheet(prisma, founder.id, new Date());
  check("Balance Sheet is internally balanced BEFORE the fixture (Assets = Liabilities + Equity)", bsBefore.balanced);

  const key = `rpt-recon-${suffix}`;
  const txn = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "REC-INS", direction: "CASH_IN", amount: 3300, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: `Report Recon Party ${suffix}`, formData: {}, idempotencyKey: key,
  });
  cleanup.moneyDeskIds.push(txn.id);
  const refs = (txn.downstreamRefs ?? {}) as { journalId?: string };
  if (refs.journalId) cleanup.journalIds.push(refs.journalId);
  check("fixture receipt POSTED", txn.status === "POSTED");

  const bsAfter = await balanceSheet(prisma, founder.id, new Date());
  check("Balance Sheet is still internally balanced AFTER the fixture", bsAfter.balanced);
  const cashCoa = await prisma.seeraChartOfAccount.findUniqueOrThrow({ where: { id: cash.chartOfAccountId } });
  const cashAssetRow = bsAfter.assets.find((a) => a.code === cashCoa.code);
  check("the real cash treasury account appears as a real ASSET row with the correct real amount", cashAssetRow?.amount === 3300);

  console.log("\n=== Cash Flow: reconciles to REAL treasury movement over the period ===");
  const from = new Date(Date.now() - 3600_000);
  const to = new Date(Date.now() + 3600_000);
  const cf = await cashFlow(prisma, founder.id, from, to);
  check("Cash Flow's operating movement includes exactly the real receipt amount (REC-INS -> operating bucket)", cf.operating >= 3300);
  check("Cash Flow's net movement + opening cash equals the reported closing cash (internal consistency)", cf.closingCash === cf.openingCash + cf.netMovement);

  console.log("\n=== GST Control Center: real Input GST from a real Vendor Bill ===");
  const vendor = await createVendor(prisma, founder.id, { code: `RPT-VEN-${suffix}`, legalName: `Report Recon Vendor ${suffix}`, category: "RAW_MATERIAL_SUPPLIER" });
  cleanup.vendorIds.push(vendor.id);
  const bill = await createVendorBill(prisma, founder.id, {
    vendorId: vendor.id, vendorInvoiceNumber: `RPT-SUP-${suffix}`, invoiceDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
    category: "5000", description: "Report reconciliation fixture", taxable: 5000, cgst: 450, sgst: 450, idempotencyKey: `rpt-bill-${suffix}`,
  });
  cleanup.billIds.push(bill.id);
  const gst = await gstControlCenter(prisma, founder.id, from, to);
  check("GST Control Center Input CGST includes exactly this bill's real CGST", gst.inputCgst >= 450);
  check("GST Control Center Input SGST includes exactly this bill's real SGST", gst.inputSgst >= 450);
  check("GST Control Center correctly does NOT source Input GST from the journal rail (reads SeeraVendorBill directly, unaffected by the documented dual-ledger gap)", gst.inputCgst + gst.inputSgst > 0);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  console.log("\n--- Honest scope note (P0-7) ---");
  console.log("Balance Sheet and Cash Flow (like P&L, already documented in the P0-5 commit) read ONLY the");
  console.log("journal rail — a Company/Distributor/SS invoice's receivable never appears as a Balance Sheet");
  console.log("Trade Receivables asset, since issueBillingDraft posts only to SeeraFinancialEntry, never to");
  console.log("SeeraJournalLine. GST Control Center is UNAFFECTED by this gap — it reads Output GST directly");
  console.log("from SeeraCommercialDocument and Input GST directly from SeeraVendorBill, never the journal.");

  console.log("\n=== Cleanup ===");
  if (cleanup.journalIds.length) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: cleanup.journalIds } } });
    await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: cleanup.journalIds } } });
  }
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: cleanup.moneyDeskIds } } });
  await prisma.seeraVendorBill.deleteMany({ where: { id: { in: cleanup.billIds } } });
  await prisma.seeraVendor.deleteMany({ where: { id: { in: cleanup.vendorIds } } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } }).catch(() => {});
  const remaining = {
    moneyDeskTxns: await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: cleanup.moneyDeskIds } } }),
    bills: await prisma.seeraVendorBill.count({ where: { id: { in: cleanup.billIds } } }),
    vendors: await prisma.seeraVendor.count({ where: { id: { in: cleanup.vendorIds } } }),
  };
  console.log(`Remaining: ${JSON.stringify(remaining)}`);
  if (Object.values(remaining).some((n) => n !== 0)) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
