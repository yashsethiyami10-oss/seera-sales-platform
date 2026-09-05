import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { upsertCompanyProfile, uploadCompanyBrandingAsset, getCompanyProfile } from "../../lib/finance/company-profile-service";
import { partySnapshot } from "../../lib/sales-distribution/document-lines";
import { renderIssuedDocumentPdf } from "../../lib/sales-distribution/document-pdf";
import { renderLedgerStatementPdf } from "../../lib/finance/statement-pdf";
import { partyLedgerStatement } from "../../lib/finance/party-ledger-service";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";

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

// Minimal 1x1 red PNG, valid PNG magic bytes + real image data — for signature/seal upload tests.
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  console.log("=== Part AD: Company Profile save/read ===");
  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd TEST ${suffix}`,
    tradeName: "SEERA",
    gstin: "09ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    address: { line: "Plot 12, Industrial Area", city: "Jhansi", pincode: "284001" },
    state: "Uttar Pradesh",
    stateCode: "09",
    phone: "9876543210",
    email: "accounts@seeradetergent.in",
    website: "www.seeradetergent.in",
    bankName: "HDFC Bank",
    bankAccountName: "Seera Detergents Pvt Ltd",
    bankAccountNumber: "50100123456789",
    ifsc: "HDFC0001234",
    upiId: "seera@hdfcbank",
    signatoryName: "Yash Sethi",
    signatoryDesignation: "Director",
    invoicePrefix: "SEERA",
    termsAndConditions: "Goods once sold will not be taken back. Subject to Jhansi jurisdiction.",
  });
  check("company profile saved with real legal name", profile.legalName === `Seera Detergents Pvt Ltd TEST ${suffix}`);
  check("company profile is VERIFIED/authorizedBilling", profile.verificationStatus === "VERIFIED" && profile.authorizedBilling === true);

  const reread = await getCompanyProfile(prisma);
  check("getCompanyProfile reads back the same row (upsert-in-place works)", reread?.id === profile.id);

  console.log("\n=== Part N: branding asset upload ===");
  const withSignature = await uploadCompanyBrandingAsset(prisma, founder.id, { kind: "SIGNATURE", originalName: "signature.png", mimeType: "image/png", bytes: Buffer.from(TINY_PNG_BASE64, "base64") });
  check("signature asset uploaded, signatureFileId set", Boolean(withSignature.signatureFileId));
  const withSeal = await uploadCompanyBrandingAsset(prisma, founder.id, { kind: "SEAL", originalName: "seal.png", mimeType: "image/png", bytes: Buffer.from(TINY_PNG_BASE64, "base64") });
  check("seal asset uploaded, sealFileId set", Boolean(withSeal.sealFileId));

  console.log("\n=== Part G: partySnapshot COMPANY branch ===");
  const companySnapshot = await partySnapshot(prisma, "COMPANY", "COMPANY");
  check("partySnapshot(COMPANY) resolves the real legal name (no crash, no fabrication)", companySnapshot.legalName === `Seera Detergents Pvt Ltd TEST ${suffix}`);
  check("partySnapshot(COMPANY) carries the real GSTIN", companySnapshot.gstin === "09ABCDE1234F1Z5");
  check("partySnapshot(COMPANY) carries a formatted address", companySnapshot.address.includes("Jhansi"));

  console.log("\n=== Part G/N: render an actual Sales Invoice PDF and inspect it ===");
  // Test-script hygiene fix: a fixed mobile number here collided with whatever earlier run of this
  // same script had already left in the (persistent, never-cleaned) TEST DB, tripping the real and
  // correctly-working SIMILAR_RETAILER_EXISTS duplicate check — not a product bug. Derive a mobile
  // that's unique per run, same as businessName's suffix already is.
  const uniqueMobile = "9" + suffix.replace(/\D/g, "").padEnd(9, "1").slice(0, 9);
  const buyerRetailer = await createRetailer(prisma, founder.id, {
    businessName: `PDF Test Customer ${suffix}`,
    address: { line: "Shop 4, Main Bazaar", city: "Jhansi", state: "Uttar Pradesh", pincode: "284001" },
    mobile: uniqueMobile,
    idempotencyKey: `pdf-buyer-${suffix}`,
  });
  const buyerSnapshot = await partySnapshot(prisma, "RETAILER", buyerRetailer.id);
  const { getBrandingAssetBytes } = await import("../../lib/finance/company-profile-service");
  const sigBytes = await getBrandingAssetBytes(prisma, withSeal.signatureFileId);
  const sealBytes = await getBrandingAssetBytes(prisma, withSeal.sealFileId);
  const pdfBytes = await renderIssuedDocumentPdf(
    {
      type: "TAX_INVOICE",
      documentNumber: `SEERA-TEST-${suffix}`,
      issueDate: new Date().toLocaleDateString("en-IN"),
      issuer: companySnapshot,
      buyer: buyerSnapshot,
      lines: [
        { description: "Seera Detergent Cake Blue 250g", hsn: "3401", quantity: 100, unit: "PCS", rate: 15, taxableValue: 1500, cgst: 135, sgst: 135, total: 1770 },
        { description: "Seera Detergent Powder 1kg", hsn: "3402", quantity: 20, unit: "BAG", rate: 90, taxableValue: 1800, cgst: 162, sgst: 162, total: 2124 },
      ],
      subtotal: 3300, taxableTotal: 3300, cgstTotal: 297, sgstTotal: 297, igstTotal: 0, grandTotal: 3894,
      paymentTerms: "Cash on delivery",
    },
    { signatoryName: profile.signatoryName ?? undefined, signatoryDesignation: profile.signatoryDesignation ?? undefined, signatureImage: sigBytes ?? undefined, sealImage: sealBytes ?? undefined },
  );
  const outDir = path.join(root, ".tmp-money-desk-2-pdf-verify");
  mkdirSync(outDir, { recursive: true });
  const invoicePath = path.join(outDir, `invoice-${suffix}.pdf`);
  writeFileSync(invoicePath, pdfBytes);
  check("Sales Invoice PDF generated (non-empty bytes)", pdfBytes.length > 5000);
  check("Sales Invoice PDF starts with a real PDF header", Buffer.from(pdfBytes.slice(0, 5)).toString() === "%PDF-");
  console.log(`  Invoice PDF written to: ${invoicePath} (${pdfBytes.length} bytes) — will be read back with the Read tool next.`);

  console.log("\n=== Part F: render an actual Ledger Statement PDF and inspect it ===");
  const statement = await partyLedgerStatement(prisma, founder.id, { partyType: "RETAILER", partyId: buyerRetailer.id });
  const ledgerPdfBytes = await renderLedgerStatementPdf({
    companyName: profile.tradeName || profile.legalName,
    company: { gstin: profile.gstin, address: companySnapshot.address, phone: profile.phone, email: profile.email },
    party: statement.party,
    period: statement.period,
    openingBalance: statement.openingBalance,
    rows: statement.rows,
    totals: statement.totals,
    normalSide: statement.normalSide,
  });
  const ledgerPath = path.join(outDir, `ledger-${suffix}.pdf`);
  writeFileSync(ledgerPath, ledgerPdfBytes);
  check("Ledger Statement PDF generated (non-empty bytes)", ledgerPdfBytes.length > 500);
  check("Ledger Statement PDF starts with a real PDF header", Buffer.from(ledgerPdfBytes.slice(0, 5)).toString() === "%PDF-");
  console.log(`  Ledger PDF written to: ${ledgerPath} (${ledgerPdfBytes.length} bytes) — will be read back with the Read tool next.`);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraRetailer.delete({ where: { id: buyerRetailer.id } });
  await prisma.storedFile.deleteMany({ where: { id: { in: [withSignature.signatureFileId, withSeal.sealFileId].filter((x): x is string => Boolean(x)) } } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } });
  const remainingRetailer = await prisma.seeraRetailer.count({ where: { id: buyerRetailer.id } });
  const remainingProfile = await prisma.seeraBillingProfile.count({ where: { id: profile.id } });
  console.log(`Remaining: retailer=${remainingRetailer} companyProfile=${remainingProfile}`);
  console.log(`Note: PDF files at ${outDir} are intentionally left on disk for manual/Read-tool inspection, not part of DB cleanup.`);
  if (remainingRetailer !== 0 || remainingProfile !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("DB cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
