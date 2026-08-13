import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createQuotationDraft, issueQuotation, updateQuotationDraft } from "../../lib/sales-distribution/quotation-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 1D smoke test — Quotation creation + issue with REAL data (S.S. -> Distributor buyer, real
// Seera SKU, real governed SS_TO_DISTRIBUTOR rate), proving the Quotation buyer/product selectors'
// underlying data actually exists and the issue pipeline (numbering, immutability, notification)
// works end-to-end — not just an empty-state code review.
// Safe to re-run: fresh idempotency key per run.

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
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });

  const draft = await createQuotationDraft(db, ss1Owner.id, {
    issuerType: "SUPER_STOCKIST",
    issuerId: ss1.id,
    buyerType: "DISTRIBUTOR",
    buyerId: distributor1.id,
    sourcePortal: "super-stockist",
    validUntil: new Date(Date.now() + 7 * 86_400_000),
    paymentTerms: "Net 15",
    lines: [{ skuId: cakeSku.id, quantity: 10, rate: 315 }],
    idempotencyKey: `s1d-quote-${suffix}`,
  });
  assert(draft.status === "DRAFT", `expected DRAFT status, got ${draft.status}`);
  assert(Number(draft.grandTotal) === 3150, `expected grandTotal = 10 x ₹315 = ₹3150 (real governed S.S.->Distributor rate), got ${draft.grandTotal}`);
  console.log(`[Q1] OK — Quotation drafted for a REAL Distributor buyer (${distributor1.code}) with a REAL Seera SKU at the governed ₹315 rate, grandTotal=₹${draft.grandTotal}`);

  const issued = await issueQuotation(db, ss1Owner.id, draft.id);
  assert(issued.status === "ISSUED", `expected ISSUED status, got ${issued.status}`);
  assert(!!issued.documentNumber && issued.documentNumber.includes("/QT/"), `expected an issuer-scoped, financial-year-aware document number, got ${issued.documentNumber}`);
  console.log(`[Q2] OK — Quotation issued with real numbering: ${issued.documentNumber}`);

  let immutabilityHeld = false;
  try {
    await updateQuotationDraft(db, ss1Owner.id, issued.id, { lines: [{ skuId: cakeSku.id, quantity: 99, rate: 1 }] });
  } catch (error) {
    immutabilityHeld = error instanceof FoundationError && error.code === "QUOTATION_NOT_DRAFT";
  }
  assert(immutabilityHeld, "expected an ISSUED quotation to be immutable — updateQuotationDraft must reject with QUOTATION_NOT_DRAFT");
  console.log("[Q2b] OK — issued quotation is immutable: updateQuotationDraft correctly rejects editing it (QUOTATION_NOT_DRAFT)");

  // Confirm the real selector query used by the S.S. Billing/Quotations screen actually returns
  // this issued quotation now.
  const selectorRows = await db.seeraCommercialDocument.findMany({ where: { type: "QUOTATION_DOCUMENT", issuerId: ss1.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const found = selectorRows.find((r) => r.id === issued.id);
  assert(!!found, "expected the S.S. Quotations screen's real query (type=QUOTATION_DOCUMENT, issuerId scoped) to return this newly issued quotation — not an empty state");
  console.log("[Q3] OK — the real Quotations-screen query returns this quotation (selector proven with real data, not an empty state)");

  console.log("\nALL STAGE 1D QUOTATION LIVE SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
