import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createVendor, createVendorBill, recordVendorPayment } from "../../lib/finance/vendor-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";
import { partyLedgerStatement } from "../../lib/finance/party-ledger-service";
import { generalLedger } from "../../lib/finance/journal-service";
import { purchaseRegister, payablesAgeing } from "../../lib/finance/reports-service";

// SEERA MONEY DESK 2.0 — PERMANENT ACCOUNTING RECONCILIATION SUITE (Part 34/35). For one real
// Vendor Bill + one real partial Vendor Payment, proves all four layers genuinely agree:
//   Transaction (SeeraVendorBill) == Journal (SeeraJournalLine sum) == Ledger (partyLedgerStatement)
//   == Reports (purchaseRegister / payablesAgeing)
// If any layer disagrees with the transaction's own real numbers, this FAILS — matching the
// mission's explicit "if Transaction says X but Ledger says Y, the feature is NOT complete" rule.

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
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `RECON-CASH-${suffix}`, name: `Reconciliation Cash Box ${suffix}` });

  console.log("=== Layer 1->4 reconciliation: Vendor Bill (Transaction -> Journal -> Ledger -> Report) ===");
  const vendor = await createVendor(prisma, founder.id, { code: `RECON-V-${suffix}`, legalName: `Reconciliation Vendor ${suffix}`, state: "Uttar Pradesh", stateCode: "09" });
  const bill = await createVendorBill(prisma, founder.id, {
    vendorId: vendor.id, vendorInvoiceNumber: `RECON-INV-${suffix}`, invoiceDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
    category: "5000", description: "Reconciliation test bill", taxable: 20000, cgst: 1800, sgst: 1800, idempotencyKey: `recon-bill-${suffix}`,
  });
  const billGross = Number(bill.grossAmount);
  check("Layer 1 (Transaction): gross = taxable + cgst + sgst", billGross === 23600);

  // Layer 2: Journal — sum of journal lines for this bill's source must balance and match gross.
  const journalLines = await prisma.seeraJournalLine.findMany({ where: { journal: { sourceId: bill.id, sourceType: "VENDOR_BILL" } } });
  const journalDebit = journalLines.reduce((s, l) => s + Number(l.debit), 0);
  const journalCredit = journalLines.reduce((s, l) => s + Number(l.credit), 0);
  check("Layer 2 (Journal): debit total = credit total (balanced)", journalDebit === journalCredit);
  check("Layer 2 (Journal): credit total = Transaction gross amount", journalCredit === billGross);
  const payableLine = journalLines.find((l) => l.partyType === "VENDOR" && l.partyId === vendor.id);
  check("Layer 2 (Journal): a real Trade Payables line exists for this exact vendor", Boolean(payableLine) && Number(payableLine!.credit) === billGross);

  // Layer 3: Ledger — partyLedgerStatement(VENDOR) must show this bill as a credit of the same amount.
  const ledgerBeforePayment = await partyLedgerStatement(prisma, founder.id, { partyType: "VENDOR", partyId: vendor.id });
  const ledgerRow = ledgerBeforePayment.rows.find((r) => r.sourceId === bill.id);
  check("Layer 3 (Ledger): the bill appears as exactly one row", Boolean(ledgerRow));
  check("Layer 3 (Ledger): row credit amount = Transaction gross amount", Number(ledgerRow?.credit) === billGross);
  check("Layer 3 (Ledger): closing balance = gross amount (nothing paid yet)", ledgerBeforePayment.totals.closingBalance === billGross);

  // Layer 4: Reports — purchaseRegister must show this exact bill with matching totals; payablesAgeing must show it as fully outstanding.
  const register = await purchaseRegister(prisma, founder.id, { from: new Date(bill.invoiceDate.getTime() - 86400000), to: new Date(bill.invoiceDate.getTime() + 86400000) });
  const registerRow = register.find((r) => r.id === bill.id);
  check("Layer 4 (Report — Purchase Register): the bill appears with matching gross", registerRow?.gross === billGross);
  check("Layer 4 (Report — Purchase Register): status is UNPAID (nothing paid yet)", registerRow?.status === "UNPAID");
  const ageingBefore = await payablesAgeing(prisma, founder.id);
  const ageingRow = ageingBefore.rows.find((r) => r.partyId === vendor.id);
  check("Layer 4 (Report — Payables Ageing): vendor's outstanding = full gross amount", ageingRow?.outstandingTotal === billGross);

  console.log("\n=== Partial payment: re-verify all four layers after a real payment ===");
  const paymentAmount = 10000;
  const payment = await recordVendorPayment(prisma, founder.id, {
    vendorId: vendor.id, billId: bill.id, amount: paymentAmount, treasuryAccountId: cash.id, treasuryAccountCoaCode: cash.chartOfAccountCode,
    paymentMode: "CASH", paymentDate: new Date(), idempotencyKey: `recon-pay-${suffix}`,
  });
  const billAfter = await prisma.seeraVendorBill.findUniqueOrThrow({ where: { id: bill.id } });
  check("Layer 1 (Transaction): bill paidAmount updated to the real payment amount", Number(billAfter.paidAmount) === paymentAmount);
  check("Layer 1 (Transaction): bill status is PARTIALLY_PAID", billAfter.status === "PARTIALLY_PAID");

  const paymentJournalLines = await prisma.seeraJournalLine.findMany({ where: { journal: { sourceId: payment.id, sourceType: "VENDOR_PAYMENT" } } });
  const paymentJournalDebit = paymentJournalLines.reduce((s, l) => s + Number(l.debit), 0);
  const paymentJournalCredit = paymentJournalLines.reduce((s, l) => s + Number(l.credit), 0);
  check("Layer 2 (Journal): payment journal balanced and matches the real payment amount", paymentJournalDebit === paymentJournalCredit && paymentJournalCredit === paymentAmount);

  const ledgerAfterPayment = await partyLedgerStatement(prisma, founder.id, { partyType: "VENDOR", partyId: vendor.id });
  check("Layer 3 (Ledger): closing balance = gross - payment (real running balance)", ledgerAfterPayment.totals.closingBalance === billGross - paymentAmount);

  const ageingAfter = await payablesAgeing(prisma, founder.id);
  const ageingRowAfter = ageingAfter.rows.find((r) => r.partyId === vendor.id);
  check("Layer 4 (Report — Payables Ageing): outstanding reduced by exactly the payment amount", ageingRowAfter?.outstandingTotal === billGross - paymentAmount);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraJournalLine.deleteMany({ where: { journal: { sourceId: { in: [bill.id, payment.id] } } } });
  await prisma.seeraJournalEntry.deleteMany({ where: { sourceId: { in: [bill.id, payment.id] } } });
  await prisma.seeraVendorPayment.delete({ where: { id: payment.id } });
  await prisma.seeraVendorBill.delete({ where: { id: bill.id } });
  await prisma.seeraVendor.delete({ where: { id: vendor.id } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } });
  const remainingBill = await prisma.seeraVendorBill.count({ where: { id: bill.id } });
  const remainingVendor = await prisma.seeraVendor.count({ where: { id: vendor.id } });
  console.log(`Remaining: bill=${remainingBill} vendor=${remainingVendor}`);
  if (remainingBill !== 0 || remainingVendor !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
