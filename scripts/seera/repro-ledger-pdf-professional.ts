import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { upsertCompanyProfile, uploadCompanyBrandingAsset } from "../../lib/finance/company-profile-service";
import { renderLedgerStatementPdf } from "../../lib/finance/statement-pdf";
import { partyLedgerStatement } from "../../lib/finance/party-ledger-service";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";

// GAP 2 (Final 100% Gap Closure) — verifies the rewritten, branded Ledger Statement PDF. Generates
// a real PDF against a real fixture (real invoice + real Company Profile + a real signature image)
// and reads its ACTUAL text back with pdftotext — never accepts HTTP 200 / byte-length alone.
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

// A minimal real 1x1 PNG (valid PNG magic bytes + IHDR/IDAT/IEND) for the signature-image fixture.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const sku = await prisma.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  await seedDefaultChartOfAccounts(prisma, founder.id);

  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd LP ${suffix}`, gstin: "09ABCDE1234F1Z5", pan: "ABCDE1234F", address: { line: "Plot 12", city: "Jhansi", pincode: "284001" },
    state: "Uttar Pradesh", stateCode: "09", phone: "9876543210", email: "accounts@seera.test", website: "www.seeradetergent.in",
    signatoryName: "Yash Sethi", signatoryDesignation: "Director",
  });
  await uploadCompanyBrandingAsset(prisma, founder.id, { kind: "SIGNATURE", originalName: "sig.png", mimeType: "image/png", bytes: PNG_1PX });

  const retailer = await createRetailer(prisma, founder.id, {
    businessName: `Ledger PDF Test Customer ${suffix}`, address: { line: "Shop 5", city: "Jhansi", state: "Uttar Pradesh", pincode: "284001" },
    mobile: "9012345678", idempotencyKey: `lp-retailer-${suffix}`,
  });
  const draft = await createBillingDraft(prisma, founder.id, {
    type: "TAX_INVOICE", issuerType: "COMPANY", issuerId: "COMPANY", buyerType: "RETAILER", buyerId: retailer.id,
    sourcePortal: "money-desk", lines: [{ skuId: sku.id, quantity: 3, rate: 315, taxRate: 18 }], idempotencyKey: `lp-draft-${suffix}`,
  });
  const issued = await issueBillingDraft(prisma, founder.id, draft.id);

  const statement = await partyLedgerStatement(prisma, founder.id, { partyType: "RETAILER", partyId: retailer.id });
  check("real ledger statement has exactly one row (the invoice)", statement.rows.length === 1);

  const { getBrandingAssetBytes } = await import("../../lib/finance/company-profile-service");
  const { formatAddress } = await import("../../lib/sales-distribution/document-lines");
  const signatureImage = await getBrandingAssetBytes(prisma, profile.signatureFileId);
  const pdfBytes = await renderLedgerStatementPdf({
    companyName: profile.tradeName || profile.legalName,
    company: { gstin: profile.gstin, pan: profile.pan, address: formatAddress(profile.registeredAddress), phone: profile.phone, email: profile.email, website: profile.website },
    party: statement.party,
    period: statement.period,
    openingBalance: statement.openingBalance,
    rows: statement.rows,
    totals: statement.totals,
    normalSide: statement.normalSide,
    branding: { signatoryName: profile.signatoryName ?? undefined, signatoryDesignation: profile.signatoryDesignation ?? undefined, signatureImage: signatureImage ?? undefined },
  });
  check("PDF generated with a real PDF header", Buffer.from(pdfBytes.slice(0, 5)).toString() === "%PDF-");

  const outDir = path.join(root, ".tmp-ledger-pdf-verify");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ledger-${suffix}.pdf`);
  writeFileSync(outPath, pdfBytes);
  console.log(`  Written: ${outPath} (${pdfBytes.length} bytes)`);

  const { execSync } = await import("node:child_process");
  const extracted = execSync(`pdftotext -layout "${outPath}" -`).toString();
  check("PDF text contains the document title", extracted.includes("PARTY LEDGER STATEMENT"));
  check("PDF text contains the real company legal/trade name", extracted.includes(profile.tradeName || profile.legalName));
  check("PDF text contains the real company GSTIN", extracted.includes("09ABCDE1234F1Z5"));
  check("PDF text contains the real company PAN", extracted.includes("ABCDE1234F"));
  check("PDF text contains the real company phone", extracted.includes("9876543210"));
  check("PDF text contains the real company email", extracted.includes("accounts@seera.test"));
  check("PDF text contains the real company website", extracted.includes("seeradetergent.in"));
  check("PDF text contains the real party name", extracted.includes(retailer.businessName));
  check("PDF text contains the real party mobile", extracted.includes("9012345678"));
  check("PDF text contains the real invoice's document number as the voucher reference", extracted.includes(issued.documentNumber));
  check("PDF text shows the real invoice amount as Total Debit", extracted.includes(Math.round(Number(issued.grandTotal)).toLocaleString("en-IN")));
  check("PDF text shows the Account Summary section", extracted.includes("ACCOUNT SUMMARY"));
  check("PDF text shows Opening Balance", extracted.includes("Opening Balance"));
  check("PDF text shows Closing Balance", extracted.includes("CLOSING BALANCE"));
  check("PDF text shows amount in words", extracted.includes("Amount in words"));
  check("PDF text shows the configured signatory name/designation", extracted.includes("Yash Sethi") && extracted.includes("Director"));
  check("PDF text does NOT contain raw JSON (address formatting still governed, never a fabricated dump)", !extracted.includes("{\"line\""));
  check("PDF text shows page numbering", /Page 1 of \d+/.test(extracted));

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  const fe = await prisma.seeraFinancialEntry.findFirst({ where: { documentId: issued.id } });
  if (fe) await prisma.seeraFinancialEntry.delete({ where: { id: fe.id } });
  const journal = await prisma.seeraJournalEntry.findUnique({ where: { idempotencyKey: `${issued.idempotencyKey}:journal` } });
  if (journal) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: journal.id } });
    await prisma.seeraJournalEntry.delete({ where: { id: journal.id } });
  }
  await prisma.seeraCommercialDocument.delete({ where: { id: issued.id } });
  await prisma.seeraRetailer.delete({ where: { id: retailer.id } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } });
  const remainingDoc = await prisma.seeraCommercialDocument.count({ where: { id: issued.id } });
  const remainingRetailer = await prisma.seeraRetailer.count({ where: { id: retailer.id } });
  console.log(`Remaining: document=${remainingDoc} retailer=${remainingRetailer}`);
  console.log(`PDF left on disk at ${outDir} for manual/Read-tool inspection.`);
  if (remainingDoc !== 0 || remainingRetailer !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("DB cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
