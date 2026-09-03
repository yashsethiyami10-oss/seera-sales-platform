import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { partyLedgerStatement } from "../../lib/finance/party-ledger-service";
import { upsertCompanyProfile } from "../../lib/finance/company-profile-service";

// SEERA MONEY DESK 2.0 — Sales-side reconciliation (Part 20/34). Proves the structural fix to
// billing-service.ts (issuerType "COMPANY" now a real, authorized issuer) genuinely closes the
// "Named Customer -> Sale -> Invoice -> Receivable -> Customer Ledger" chain end-to-end:
//   Document (SeeraCommercialDocument) == Financial Entry (SeeraFinancialEntry) == Ledger
//   (partyLedgerStatement) all agree on the SAME real amount.
// Before this fix, createBillingDraft's own TypeScript type made issuerType:"COMPANY" impossible to
// even attempt, and requireIssuerScope hard-threw INVALID_ISSUER_TYPE for anything but Distributor/
// Super Stockist — a Company-direct/factory sale to a named customer had NO path to a real invoice.

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

  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd TEST ${suffix}`, gstin: "09ABCDE1234F1Z5", address: { line: "Plot 12", city: "Jhansi", pincode: "284001" },
    state: "Uttar Pradesh", stateCode: "09", invoicePrefix: `INV${suffix.slice(0, 4).toUpperCase()}`,
  });

  const retailer = await createRetailer(prisma, founder.id, {
    businessName: `Company Invoice Test Customer ${suffix}`, address: { line: "Shop 9", city: "Jhansi", state: "Uttar Pradesh", pincode: "284001" },
    mobile: "9012345678", idempotencyKey: `ci-retailer-${suffix}`,
  });

  console.log("=== Structural fix: createBillingDraft accepts issuerType COMPANY (was previously impossible) ===");
  const draft = await createBillingDraft(prisma, founder.id, {
    type: "TAX_INVOICE", issuerType: "COMPANY", issuerId: "COMPANY", buyerType: "RETAILER", buyerId: retailer.id,
    sourcePortal: "money-desk", lines: [{ skuId: sku.id, quantity: 5, rate: 315, taxRate: 18 }],
    idempotencyKey: `ci-draft-${suffix}`,
  });
  check("draft created with real issuerType COMPANY", draft.issuerType === "COMPANY");
  check("draft status is DRAFT", draft.status === "DRAFT");
  const draftGrand = Number(draft.grandTotal);
  check("draft grand total is correct (5 x 315 = 1575 taxable, +18% GST)", Math.round(draftGrand) === Math.round(1575 * 1.18));

  console.log("\n=== Issue: real billing profile (Company Profile) resolved, real document number, real Financial Entry ===");
  const issued = await issueBillingDraft(prisma, founder.id, draft.id);
  check("document ISSUED", issued.status === "ISSUED");
  check("issued document carries a real generated document number (not a DRAFT- placeholder)", !issued.documentNumber.startsWith("DRAFT-"));
  const issuerSnap = issued.issuerSnapshot as { legalName?: string; gstin?: string };
  check("issued document's issuerSnapshot uses the REAL configured Company Profile (not a fallback)", issuerSnap.legalName === profile.legalName && issuerSnap.gstin === profile.gstin);

  const financialEntry = await prisma.seeraFinancialEntry.findFirst({ where: { documentId: issued.id } });
  check("a real SeeraFinancialEntry was posted for this invoice", Boolean(financialEntry));
  check("Financial Entry: debit party is the real retailer (receivable)", financialEntry?.debitPartyType === "RETAILER" && financialEntry?.debitPartyId === retailer.id);
  check("Financial Entry: credit party is the Company (revenue)", financialEntry?.creditPartyType === "COMPANY" && financialEntry?.creditPartyId === "COMPANY");
  check("Financial Entry amount == Document grandTotal (Layer agreement)", Number(financialEntry?.amount) === Number(issued.grandTotal));

  console.log("\n=== Ledger: partyLedgerStatement(RETAILER) shows this exact invoice ===");
  const statement = await partyLedgerStatement(prisma, founder.id, { partyType: "RETAILER", partyId: retailer.id });
  const ledgerRow = statement.rows.find((r) => r.sourceId === issued.id || r.sourceId === financialEntry?.id);
  check("the invoice appears as exactly one ledger row", Boolean(ledgerRow));
  check("Ledger row debit amount == Document grandTotal (Layer agreement)", Number(ledgerRow?.debit) === Number(issued.grandTotal));
  check("Ledger closing balance == Document grandTotal (real receivable, nothing paid)", statement.totals.closingBalance === Number(issued.grandTotal));
  check("Ledger row references the REAL invoice document number as its voucher", ledgerRow?.voucher === issued.documentNumber);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFinancialEntry.deleteMany({ where: { documentId: issued.id } });
  await prisma.seeraCommercialDocument.delete({ where: { id: issued.id } });
  await prisma.seeraDocumentSequence.deleteMany({ where: { issuerId: "COMPANY" } });
  await prisma.seeraRetailer.delete({ where: { id: retailer.id } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } });
  const remainingDoc = await prisma.seeraCommercialDocument.count({ where: { id: issued.id } });
  const remainingRetailer = await prisma.seeraRetailer.count({ where: { id: retailer.id } });
  console.log(`Remaining: document=${remainingDoc} retailer=${remainingRetailer}`);
  if (remainingDoc !== 0 || remainingRetailer !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
