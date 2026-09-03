import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { upsertCompanyProfile } from "../../lib/finance/company-profile-service";
import { partyLedgerStatement } from "../../lib/finance/party-ledger-service";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";

// SEERA MONEY DESK 2.0 — FINAL GAP CLOSURE P0-2: real Company Invoice auto-issued for a named-
// customer Money Desk sale. Verifies existing-customer reuse, new-customer creation, retry
// idempotency (exactly ONE order + ONE invoice), and that the anonymous walk-in path is untouched.

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
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `AI-CASH-${suffix}`, name: `Auto-Invoice Cash ${suffix}` });
  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd TEST ${suffix}`, gstin: "09ABCDE1234F1Z5", address: { line: "Plot 12", city: "Jhansi", pincode: "284001" },
    state: "Uttar Pradesh", stateCode: "09",
  });
  const priceVersion = await prisma.seeraPriceVersion.create({
    data: { skuId: sku.id, tier: "DISTRIBUTOR_TO_RETAILER", amount: 315, mrpSnapshot: sku.mrp, effectiveFrom: new Date(), status: "ACTIVE", createdById: founder.id },
  });

  const createdRetailerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdMoneyDeskIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdFinancialEntryIds: string[] = [];

  console.log("=== Scenario A: existing customer — order AND invoice both auto-created, no duplicate on retry ===");
  const existingRetailer = await prisma.seeraRetailer.create({
    data: { businessName: `Auto-Invoice Existing ${suffix}`, code: `AIEX-${suffix}`, address: { line: "Shop 1" }, customerType: "INSTITUTIONAL_OTHER", idempotencyKey: `ai-existing-${suffix}`, createdById: founder.id },
  });
  createdRetailerIds.push(existingRetailer.id);

  const key = `ai-sale-existing-${suffix}`;
  const txn1 = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-OFF", direction: "CASH_IN", amount: 630, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: existingRetailer.businessName, formData: { retailerId: existingRetailer.id, skuLines: [{ skuId: sku.id, quantity: 2 }], paymentMode: "CASH" },
    idempotencyKey: key,
  });
  check("transaction POSTED", txn1.status === "POSTED");
  const refs1 = (txn1.downstreamRefs ?? {}) as { retailerId?: string; orderId?: string; invoiceId?: string; invoiceNumber?: string };
  check("order was created", Boolean(refs1.orderId));
  check("invoice was AUTO-created and issued (real gap now closed)", Boolean(refs1.invoiceId) && Boolean(refs1.invoiceNumber));
  if (refs1.orderId) createdOrderIds.push(refs1.orderId);
  if (refs1.invoiceId) createdInvoiceIds.push(refs1.invoiceId);
  createdMoneyDeskIds.push(txn1.id);

  const invoice1 = refs1.invoiceId ? await prisma.seeraCommercialDocument.findUnique({ where: { id: refs1.invoiceId } }) : null;
  check("invoice issuerType is COMPANY", invoice1?.issuerType === "COMPANY");
  check("invoice buyerId is the real existing retailer (no duplicate customer)", invoice1?.buyerId === existingRetailer.id);
  check("invoice grandTotal matches 2 x 315 x 1.18 (real SKU pricing, not fabricated)", Math.round(Number(invoice1?.grandTotal)) === Math.round(2 * 315 * 1.18));
  const fe1 = await prisma.seeraFinancialEntry.findFirst({ where: { documentId: refs1.invoiceId } });
  if (fe1) createdFinancialEntryIds.push(fe1.id);
  check("a real Financial Entry was posted for the auto-issued invoice", Boolean(fe1));

  const ledger1 = await partyLedgerStatement(prisma, founder.id, { partyType: "RETAILER", partyId: existingRetailer.id });
  check("Retail Customer's ledger shows the exact invoice amount as closing balance", ledger1.totals.closingBalance === Number(invoice1?.grandTotal));

  console.log("\n=== Retry (same idempotencyKey) — must NOT create a second order or a second invoice ===");
  const txn1Retry = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-OFF", direction: "CASH_IN", amount: 630, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: existingRetailer.businessName, formData: { retailerId: existingRetailer.id, skuLines: [{ skuId: sku.id, quantity: 2 }], paymentMode: "CASH" },
    idempotencyKey: key,
  });
  check("retry returns the SAME transaction (outer idempotency)", txn1Retry.id === txn1.id);
  const orderCount = await prisma.seeraSalesOrder.count({ where: { retailerId: existingRetailer.id } });
  const invoiceCount = await prisma.seeraCommercialDocument.count({ where: { buyerId: existingRetailer.id, type: "TAX_INVOICE" } });
  check("exactly ONE order exists after retry", orderCount === 1);
  check("exactly ONE invoice exists after retry", invoiceCount === 1);

  console.log("\n=== Scenario B: new named customer — exactly one retailer AND one invoice created ===");
  const newName = `Auto-Invoice New Customer ${suffix}`;
  const txn2 = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-OFF", direction: "CASH_IN", amount: 315, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: newName, formData: { skuLines: [{ skuId: sku.id, quantity: 1 }], paymentMode: "CASH" },
    idempotencyKey: `ai-sale-new-${suffix}`,
  });
  check("transaction POSTED", txn2.status === "POSTED");
  const refs2 = (txn2.downstreamRefs ?? {}) as { retailerId?: string; orderId?: string; invoiceId?: string; invoiceNumber?: string };
  check("invoice auto-created for the new customer too", Boolean(refs2.invoiceId));
  if (refs2.retailerId) createdRetailerIds.push(refs2.retailerId);
  if (refs2.orderId) createdOrderIds.push(refs2.orderId);
  if (refs2.invoiceId) createdInvoiceIds.push(refs2.invoiceId);
  createdMoneyDeskIds.push(txn2.id);
  const fe2 = await prisma.seeraFinancialEntry.findFirst({ where: { documentId: refs2.invoiceId } });
  if (fe2) createdFinancialEntryIds.push(fe2.id);
  const retailerCountForNewName = await prisma.seeraRetailer.count({ where: { businessName: newName } });
  check("exactly ONE retailer created for the new name (not duplicated by invoice issuance)", retailerCountForNewName === 1);

  console.log("\n=== Scenario C: anonymous walk-in (SALE-WALKIN) — still NO order, NO invoice, NO customer ===");
  const retailerCountBefore = await prisma.seeraRetailer.count();
  const txn3 = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-WALKIN", direction: "CASH_IN", amount: 500, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: `Walkin ${suffix}`, formData: {}, idempotencyKey: `ai-walkin-${suffix}`,
  });
  check("walk-in transaction POSTED", txn3.status === "POSTED");
  const refs3 = (txn3.downstreamRefs ?? {}) as { factoryCashSaleId?: string; invoiceId?: string; orderId?: string };
  check("walk-in creates a FactoryCashSale, never an invoice/order (semantics preserved)", Boolean(refs3.factoryCashSaleId) && !refs3.invoiceId && !refs3.orderId);
  const retailerCountAfter = await prisma.seeraRetailer.count();
  check("retailer count unchanged by the walk-in sale", retailerCountAfter === retailerCountBefore);
  createdMoneyDeskIds.push(txn3.id);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFinancialEntry.deleteMany({ where: { id: { in: createdFinancialEntryIds } } });
  await prisma.seeraCommercialDocument.deleteMany({ where: { id: { in: createdInvoiceIds } } });
  // Deliberately NOT deleting SeeraDocumentSequence here — see repro-company-invoice-reconciliation.ts
  // for why: it's a shared, monotonic, real-world-semantics counter, and resetting it caused a real
  // documentNumber unique-constraint collision against a leftover document from an earlier run.
  for (const orderId of createdOrderIds) {
    await prisma.seeraOrderLine.deleteMany({ where: { orderId } });
    await prisma.seeraStatusHistory.deleteMany({ where: { entityType: "SeeraSalesOrder", entityId: orderId } }).catch(() => {});
    await prisma.seeraSalesOrder.delete({ where: { id: orderId } });
  }
  await prisma.seeraFactoryCashSale.deleteMany({ where: { partyName: { contains: suffix } } });
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: createdRetailerIds } } });
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: createdMoneyDeskIds } } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } }).catch(() => {});
  await prisma.seeraPriceVersion.delete({ where: { id: priceVersion.id } }).catch(() => {});
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } }).catch(() => {});
  const remainingInvoices = await prisma.seeraCommercialDocument.count({ where: { id: { in: createdInvoiceIds } } });
  const remainingRetailers = await prisma.seeraRetailer.count({ where: { id: { in: createdRetailerIds } } });
  const remainingTxns = await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: createdMoneyDeskIds } } });
  console.log(`Remaining: invoices=${remainingInvoices} retailers=${remainingRetailers} moneyDeskTxns=${remainingTxns}`);
  if (remainingInvoices !== 0 || remainingRetailers !== 0 || remainingTxns !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
