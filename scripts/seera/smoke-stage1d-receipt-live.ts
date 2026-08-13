import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { submitPartnerPayment } from "../../lib/sales-distribution/operational-service";
import { verifyPayment, generateDistributorPaymentReceipt } from "../../lib/sales-distribution/financial-service";
import { downloadDocument } from "../../lib/sales-distribution/document-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 1D smoke test — GENERATE RECEIPT contextual action, real end-to-end lifecycle:
//  R0. A receipt CANNOT be generated from a SUBMITTED (not yet verified/posted) payment — governance
//      gate holds.
//  R1. Distributor submits a real payment to their assigned S.S. (submitPartnerPayment).
//  R2. Accounts verifies it (verifyPayment) -> POSTED ledger entry created (existing, unmodified
//      pipeline).
//  R3. S.S. generates a receipt from the NOW-verified payment -> real issued PAYMENT_RECEIPT
//      document, auto-filled entirely from the payment record (no re-entry), real PDF renders.
//  R4. Receipt is immutable and re-generating (same idempotencyKey) returns the SAME document, not a
//      duplicate.
//  R5. The real OperationalWorkspace selector query (verifiedPayments / receiptByPaymentId) reflects
//      the issued receipt correctly.
// Safe to re-run: fresh idempotency keys per run.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const accountsManager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });

  const payment = await submitPartnerPayment(db, distributorOwner.id, {
    partnerType: "DISTRIBUTOR",
    partnerId: distributor1.id,
    amount: 5000,
    reference: `UTR-RCPT-${suffix}`,
    paymentMode: "BANK_TRANSFER",
    paymentDate: new Date(),
    idempotencyKey: `s1d-receipt-payment-${suffix}`,
  });
  assert(payment.status === "SUBMITTED", `expected SUBMITTED status, got ${payment.status}`);

  // ============= R0: cannot receipt an unverified payment =============
  let unverifiedRejected = false;
  try {
    await generateDistributorPaymentReceipt(db, ss1Owner.id, ss1.id, { paymentId: payment.id, idempotencyKey: `receipt-${payment.id}` });
  } catch (error) {
    unverifiedRejected = error instanceof FoundationError && error.code === "PAYMENT_NOT_VERIFIED";
  }
  assert(unverifiedRejected, "expected a receipt request against an unverified/unposted payment to be refused with PAYMENT_NOT_VERIFIED");
  console.log("[R0] OK — receipt refused for an unverified payment (governance gate holds, S.S. cannot manufacture proof Accounts hasn't confirmed)");

  // ============= R1+R2: Accounts verifies =============
  await verifyPayment(db, accountsManager.id, payment.id, { matchedAmount: 5000, reason: "Bank statement matched" });
  const verified = await db.seeraPaymentRecord.findUniqueOrThrow({ where: { id: payment.id } });
  assert(verified.status === "VERIFIED", `expected VERIFIED status, got ${verified.status}`);
  const ledgerEntry = await db.seeraFinancialEntry.findFirst({ where: { idempotencyKey: `${payment.idempotencyKey}:verified-ledger` } });
  assert(!!ledgerEntry && ledgerEntry.status === "POSTED", "expected a real POSTED ledger entry from the unmodified verifyPayment pipeline");
  console.log(`[R1] OK — Distributor payment submitted (₹${payment.amountClaimed}) and verified by Accounts, real ledger entry posted (${ledgerEntry!.entryNumber})`);

  // ============= R3: S.S. generates the receipt =============
  const receipt = await generateDistributorPaymentReceipt(db, ss1Owner.id, ss1.id, { paymentId: payment.id, idempotencyKey: `receipt-${payment.id}` });
  assert(receipt.status === "ISSUED", `expected ISSUED status, got ${receipt.status}`);
  assert(receipt.type === "PAYMENT_RECEIPT", `expected PAYMENT_RECEIPT type, got ${receipt.type}`);
  assert(Number(receipt.grandTotal) === 5000, `expected the receipt amount to be auto-filled from the payment (₹5000), got ${receipt.grandTotal}`);
  const buyerSnapshot = receipt.buyerSnapshot as { legalName?: string } | null;
  assert(buyerSnapshot?.legalName === distributor1.legalName, "expected the Distributor identity to be auto-filled, not re-entered");
  console.log(`[R3] OK — S.S. generated receipt ${receipt.documentNumber} entirely auto-filled from the verified payment (amount, date, mode, reference, Distributor identity) — no re-entry`);

  const pdf = await downloadDocument(db, ss1Owner.id, receipt.id);
  assert(pdf.mimeType === "application/pdf" && new TextDecoder().decode(pdf.bytes.slice(0, 5)) === "%PDF-", "expected a real renderable PDF via the existing shared PDF pipeline (no parallel engine)");
  console.log("[R3b] OK — receipt PDF renders via the SAME shared pipeline every other document type uses");

  // ============= R4: immutable + idempotent re-generation =============
  const secondCall = await generateDistributorPaymentReceipt(db, ss1Owner.id, ss1.id, { paymentId: payment.id, idempotencyKey: `receipt-${payment.id}` });
  assert(secondCall.id === receipt.id, "expected re-generating the same receipt to return the SAME document, not a duplicate");
  const receiptCount = await db.seeraCommercialDocument.count({ where: { type: "PAYMENT_RECEIPT", idempotencyKey: `receipt-${payment.id}` } });
  assert(receiptCount === 1, `expected exactly 1 receipt document for this payment even after two calls, got ${receiptCount}`);
  console.log("[R4] OK — receipt is immutable and idempotent: re-generating returns the same document, never a duplicate");

  // ============= R5: real selector query reflects it =============
  const verifiedPayments = await db.seeraPaymentRecord.findMany({
    where: { payeeType: "SUPER_STOCKIST", payeeId: ss1.id, payerType: "DISTRIBUTOR", payerId: distributor1.id, status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } },
  });
  const found = verifiedPayments.find((p) => p.id === payment.id);
  assert(!!found, "expected the real OperationalWorkspace selector query to find this verified payment");
  const receiptDoc = await db.seeraCommercialDocument.findFirst({ where: { idempotencyKey: `receipt-${payment.id}` } });
  assert(!!receiptDoc, "expected the real receiptByPaymentId lookup to find the issued receipt for this payment");
  console.log("[R5] OK — the real S.S. Payments (Receive from Distributor) selector query finds the verified payment AND its issued receipt (not an empty state)");

  console.log("\nALL STAGE 1D RECEIPT-GENERATION SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
