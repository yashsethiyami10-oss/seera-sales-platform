import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createVendor, createVendorBill, vendorBillSnapshot } from "../../lib/finance/vendor-service";
import { renderIssuedDocumentPdf } from "../../lib/sales-distribution/document-pdf";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";
import { upsertCompanyProfile } from "../../lib/finance/company-profile-service";

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

  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd TEST ${suffix}`, gstin: "09ABCDE1234F1Z5", address: { line: "Plot 12", city: "Jhansi", pincode: "284001" },
    state: "Uttar Pradesh", stateCode: "09", signatoryName: "Yash Sethi", signatoryDesignation: "Director",
  });

  console.log("=== Scenario A: service/expense-only Purchase Bill (no GRN) ===");
  const vendor = await createVendor(prisma, founder.id, { code: `PB-TEST-${suffix}`, legalName: `Test Chemicals Supplier ${suffix}`, gstin: "09XYZAB5678C1Z3", phone: "9988776655", state: "Uttar Pradesh", stateCode: "09" });
  const bill = await createVendorBill(prisma, founder.id, {
    vendorId: vendor.id, vendorInvoiceNumber: `SUP-INV-${suffix}`, invoiceDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
    category: "5000", description: "Raw chemical supply — bulk", taxable: 10000, cgst: 900, sgst: 900, idempotencyKey: `pb-bill-${suffix}`,
  });
  check("vendor bill created with correct gross", Number(bill.grossAmount) === 11800);

  const snapshotA = await vendorBillSnapshot(prisma, founder.id, bill.id);
  check("snapshot type is PURCHASE_BILL", snapshotA.type === "PURCHASE_BILL");
  check("snapshot issuer is the real vendor (not the company)", snapshotA.issuer.legalName === vendor.legalName);
  check("snapshot buyer is the real company", snapshotA.buyer.legalName === profile.legalName);
  check("snapshot has exactly one aggregate line (no GRN)", snapshotA.lines.length === 1);
  check("snapshot totals match the real bill", snapshotA.grandTotal === 11800 && snapshotA.taxableTotal === 10000);

  const pdfA = await renderIssuedDocumentPdf(snapshotA, { signatoryParty: "buyer", signatoryName: profile.signatoryName ?? undefined, signatoryDesignation: profile.signatoryDesignation ?? undefined });
  const outDir = path.join(root, ".tmp-purchase-bill-pdf-verify");
  mkdirSync(outDir, { recursive: true });
  const pathA = path.join(outDir, `purchase-bill-service-${suffix}.pdf`);
  writeFileSync(pathA, pdfA);
  check("Purchase Bill PDF (service-only) generated with real PDF header", Buffer.from(pdfA.slice(0, 5)).toString() === "%PDF-");
  console.log(`  Written: ${pathA} (${pdfA.length} bytes)`);

  const { execSync } = await import("node:child_process");
  const extractedText = execSync(`pdftotext -layout "${pathA}" -`).toString();
  check("PDF text contains the real vendor legal name in ISSUED BY", extractedText.includes(vendor.legalName));
  check("PDF text contains the real company legal name in BILLED TO", extractedText.includes(profile.legalName));
  check("PDF text contains the real vendor GSTIN", extractedText.includes("09XYZAB5678C1Z3"));
  check("PDF text contains the real company GSTIN", extractedText.includes("09ABCDE1234F1Z5"));
  check("PDF text contains the real bill number", extractedText.includes(bill.billNumber));
  check("PDF text contains the real supplier invoice reference", extractedText.includes(`SUP-INV-${suffix}`));
  check("PDF text shows correct GRAND TOTAL (11,800)", extractedText.includes("11,800.00"));
  check("PDF text shows correct amount in words", extractedText.includes("Eleven Thousand Eight Hundred"));
  check("PDF text shows the Outstanding payment status", extractedText.includes("Outstanding"));
  // The signature-party fix: must say "For <Company>", never "For <Vendor>".
  check("signatory line correctly says 'For <Company>' (buyer), not 'For <Vendor>'", extractedText.includes(`For ${profile.legalName}`) && !extractedText.includes(`For ${vendor.legalName}`));
  check("configured signatory name/designation appear under the signature line", extractedText.includes("Yash Sethi") && extractedText.includes("Director"));

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraVendorPayment.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.seeraJournalLine.deleteMany({ where: { journal: { sourceId: bill.id } } });
  await prisma.seeraJournalEntry.deleteMany({ where: { sourceId: bill.id } });
  await prisma.seeraVendorBill.delete({ where: { id: bill.id } });
  await prisma.seeraVendor.delete({ where: { id: vendor.id } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } });
  const remainingBill = await prisma.seeraVendorBill.count({ where: { id: bill.id } });
  const remainingVendor = await prisma.seeraVendor.count({ where: { id: vendor.id } });
  console.log(`Remaining: bill=${remainingBill} vendor=${remainingVendor}`);
  console.log(`PDF left on disk at ${outDir} for manual/Read-tool inspection.`);
  if (remainingBill !== 0 || remainingVendor !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("DB cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
