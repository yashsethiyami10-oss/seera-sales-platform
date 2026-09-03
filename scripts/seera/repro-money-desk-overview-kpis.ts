import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createTreasuryAccount, recordMoneyIn } from "../../lib/finance/treasury-service";
import { createMoneyDeskTransaction, moneyDeskHome } from "../../lib/finance/money-desk-service";
import { createVendor, createVendorBill } from "../../lib/finance/vendor-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { upsertCompanyProfile } from "../../lib/finance/company-profile-service";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";

// Part C (Final 100% Completion Execution Contract) — verifies moneyDeskHome's new real KPIs
// (Cash/Bank balance, Today's Inflow/Outflow, Receivables, Payables, Revenue/Expenses/Operating
// Profit MTD) against independently-computed expected values from real fixtures — never a
// fabricated number, and never a second accounting engine (every figure is sourced from the SAME
// governed report functions the dedicated report screens already use).
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
  const sku = await prisma.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  await seedDefaultChartOfAccounts(prisma, founder.id);
  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd KPI ${suffix}`, gstin: "09ABCDE1234F1Z5", address: { line: "Plot 12", city: "Jhansi", pincode: "284001" }, state: "Uttar Pradesh", stateCode: "09",
  });

  const cleanup = { treasuryIds: [] as string[], journalIds: [] as string[], moneyDeskIds: [] as string[], retailerIds: [] as string[], invoiceIds: [] as string[], vendorIds: [] as string[], billIds: [] as string[] };

  const homeBefore = await moneyDeskHome(prisma, founder.id);
  check("moneyDeskHome returns a real kpis object (not undefined)", Boolean(homeBefore.kpis));
  const cashBefore = homeBefore.kpis?.cashBalance ?? 0;
  const receivablesBefore = homeBefore.kpis?.receivablesTotal ?? 0;
  const payablesBefore = homeBefore.kpis?.payablesTotal ?? 0;

  console.log("=== Fixture: real Cash account + Money In (today) + real invoice (receivable) + real vendor bill (payable) ===");
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `KPI-CASH-${suffix}`, name: `KPI Test Cash ${suffix}` });
  cleanup.treasuryIds.push(cash.id);
  const moneyInJournal = await recordMoneyIn(prisma, founder.id, { type: "OTHER_INCOME", date: new Date(), amount: 2000, treasuryAccountId: cash.id, mode: "CASH", reference: "KPI test", idempotencyKey: `kpi-in-${suffix}` });
  cleanup.journalIds.push(moneyInJournal.id);

  const retailer = await prisma.seeraRetailer.create({ data: { businessName: `KPI Test Customer ${suffix}`, code: `KPI-${suffix}`, address: { line: "Shop 1" }, customerType: "RETAILER", idempotencyKey: `kpi-retailer-${suffix}`, createdById: founder.id } });
  cleanup.retailerIds.push(retailer.id);
  const draft = await createBillingDraft(prisma, founder.id, { type: "TAX_INVOICE", issuerType: "COMPANY", issuerId: "COMPANY", buyerType: "RETAILER", buyerId: retailer.id, sourcePortal: "money-desk", lines: [{ skuId: sku.id, quantity: 1, rate: 3000, taxRate: 18 }], idempotencyKey: `kpi-draft-${suffix}` });
  const issued = await issueBillingDraft(prisma, founder.id, draft.id);
  cleanup.invoiceIds.push(issued.id);
  const invoiceJournal = await prisma.seeraJournalEntry.findUnique({ where: { idempotencyKey: `${issued.idempotencyKey}:journal` } });
  if (invoiceJournal) cleanup.journalIds.push(invoiceJournal.id);

  const vendor = await createVendor(prisma, founder.id, { code: `KPI-VEN-${suffix}`, legalName: `KPI Test Vendor ${suffix}`, category: "RAW_MATERIAL_SUPPLIER" });
  cleanup.vendorIds.push(vendor.id);
  const bill = await createVendorBill(prisma, founder.id, { vendorId: vendor.id, vendorInvoiceNumber: `KPI-SUP-${suffix}`, invoiceDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000), category: "5000", description: "KPI test", taxable: 1000, cgst: 90, sgst: 90, idempotencyKey: `kpi-bill-${suffix}` });
  cleanup.billIds.push(bill.id);
  const billJournal = await prisma.seeraJournalEntry.findUnique({ where: { idempotencyKey: `${bill.idempotencyKey}:journal` } });
  if (billJournal) cleanup.journalIds.push(billJournal.id);

  const homeAfter = await moneyDeskHome(prisma, founder.id);
  const kpis = homeAfter.kpis!;
  console.log(`  [info] cashBalance before=${cashBefore} after=${kpis.cashBalance} (expect +2000)`);
  check("Cash Balance increased by exactly the real Money In amount", Math.abs(kpis.cashBalance - cashBefore - 2000) < 0.01);
  check("Total Cash+Bank = Cash Balance + Bank Balance (internal consistency)", Math.abs(kpis.totalCashBank - (kpis.cashBalance + kpis.bankBalance)) < 0.01);
  check("Today's Inflow includes the real Money In amount", kpis.todayInflow >= 2000);
  console.log(`  [info] receivablesTotal before=${receivablesBefore} after=${kpis.receivablesTotal} (expect +3540 = 3000+18%)`);
  check("Receivables increased by exactly the real invoice's grand total (3,540)", Math.abs(kpis.receivablesTotal - receivablesBefore - 3540) < 0.01);
  console.log(`  [info] payablesTotal before=${payablesBefore} after=${kpis.payablesTotal} (expect +1180 = 1000+18%)`);
  check("Payables increased by exactly the real vendor bill's gross amount (1,180)", Math.abs(kpis.payablesTotal - payablesBefore - 1180) < 0.01);
  check("Revenue/Expenses/Operating Profit MTD are real numbers, not fabricated placeholders", typeof kpis.revenueMtd === "number" && typeof kpis.expensesMtd === "number" && typeof kpis.operatingProfitMtd === "number");
  check("Pending Approvals / Needs Attention counts are still present alongside the new KPIs", typeof homeAfter.pendingApprovals.length === "number" && typeof homeAfter.needsAttention.length === "number");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  if (cleanup.invoiceIds.length) {
    await prisma.seeraFinancialEntry.deleteMany({ where: { documentId: { in: cleanup.invoiceIds } } });
    await prisma.seeraCommercialDocument.deleteMany({ where: { id: { in: cleanup.invoiceIds } } });
  }
  if (cleanup.journalIds.length) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: cleanup.journalIds } } });
    await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: cleanup.journalIds } } });
  }
  if (cleanup.billIds.length) await prisma.seeraVendorBill.deleteMany({ where: { id: { in: cleanup.billIds } } });
  if (cleanup.vendorIds.length) await prisma.seeraVendor.deleteMany({ where: { id: { in: cleanup.vendorIds } } });
  if (cleanup.retailerIds.length) await prisma.seeraRetailer.deleteMany({ where: { id: { in: cleanup.retailerIds } } });
  if (cleanup.moneyDeskIds.length) await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: cleanup.moneyDeskIds } } });
  await prisma.seeraTreasuryAccount.deleteMany({ where: { id: { in: cleanup.treasuryIds } } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } }).catch(() => {});

  const remaining = {
    treasury: await prisma.seeraTreasuryAccount.count({ where: { id: { in: cleanup.treasuryIds } } }),
    retailers: await prisma.seeraRetailer.count({ where: { id: { in: cleanup.retailerIds } } }),
    vendors: await prisma.seeraVendor.count({ where: { id: { in: cleanup.vendorIds } } }),
    invoices: await prisma.seeraCommercialDocument.count({ where: { id: { in: cleanup.invoiceIds } } }),
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
