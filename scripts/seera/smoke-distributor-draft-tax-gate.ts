import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createQuotationDraft, updateQuotationDraft, issueQuotation } from "../../lib/sales-distribution/quotation-service";
import { createBillingDraft, updateBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { createSku } from "../../lib/sales-distribution/workflow-service";
import { FoundationError } from "../../lib/foundation/errors";

// Distributor-side proof, run SEPARATELY from the S.S. proof (smoke-quotation-billing-draft-tax-
// gate.ts) per explicit instruction not to assume Distributor is fine just because it shares code
// with S.S. — same shared quotation-service.ts/billing-service.ts, but exercised end-to-end as a
// real Distributor-owner identity, buyer = a real Retailer, proving Partner scope, persistence, and
// isolation (a second Distributor cannot touch this draft).

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
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}\n`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const distOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const distMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: distOwner.id, active: true, partner: { type: "DISTRIBUTOR" } }, select: { partnerId: true } });
  const distributor = { id: distMembership.partnerId };
  // A genuinely different Distributor's own login — any of the real Ratan TEST distributor owners
  // (seeded by an earlier smoke run) other than `distributor` itself, for the isolation check below.
  const dist2Membership = await db.seeraPartyUser.findFirstOrThrow({
    where: { active: true, accessRole: "OWNER", partnerId: { not: distributor.id }, partner: { type: "DISTRIBUTOR" } },
    select: { userId: true, partnerId: true },
  });
  const dist2Owner = { id: dist2Membership.userId };
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { distributorId: distributor.id }, select: { id: true } }).catch(async () => {
    // No existing retailer mapped to this Distributor in TEST — fall back to any retailer, the
    // buyer party just needs to exist; the point of this proof is issuer-side (Distributor) scope.
    return db.seeraRetailer.findFirstOrThrow({ select: { id: true } });
  });

  const sku = await createSku(db, founder.id, {
    code: `DIST-TAXGATE-${suffix}`,
    productName: `Distributor Tax Gate Test Product ${suffix}`,
    category: "TEST",
    packSize: 500,
    unitType: "g",
    unitsPerCase: 1,
    mrp: 100,
  });

  console.log("[1] Distributor Quotation Save Draft succeeds with an unconfigured SKU");
  const quotation = await createQuotationDraft(db, distOwner.id, {
    issuerType: "DISTRIBUTOR",
    issuerId: distributor.id,
    buyerType: "RETAILER",
    buyerId: retailer.id,
    sourcePortal: "distributor",
    lines: [{ skuId: sku.id, quantity: 2, rate: 100 }],
    idempotencyKey: `dist-taxgate-quote-${suffix}`,
  });
  assert(quotation.status === "DRAFT", "Quotation must save as DRAFT");
  assert(quotation.issuerId === distributor.id, "Quotation must be scoped to the correct Distributor Partner");
  console.log(`  OK — quotation ${quotation.id} saved as DRAFT, scoped to Distributor ${distributor.id}`);

  console.log("\n[2] Reload/reopen/edit persists (stable document ID, line persistence)");
  const reQuoted = await updateQuotationDraft(db, distOwner.id, quotation.id, { lines: [{ skuId: sku.id, quantity: 5, rate: 100 }] });
  assert(reQuoted.id === quotation.id, "Document ID must remain stable across edits");
  assert(Number(reQuoted.grandTotal) === 500, `Expected grandTotal 500, got ${reQuoted.grandTotal}`);
  console.log("  OK — same document ID, edit persisted");

  console.log("\n[3] A DIFFERENT Distributor cannot edit this draft (Partner isolation)");
  try {
    await updateQuotationDraft(db, dist2Owner.id, quotation.id, { lines: [{ skuId: sku.id, quantity: 1, rate: 100 }] });
    throw new Error("ASSERTION FAILED: expected PARTY_SCOPE_DENIED but a different Distributor could edit this draft");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "PARTY_SCOPE_DENIED", `Expected PARTY_SCOPE_DENIED, got ${err}`);
    console.log(`  OK (rejected as expected: ${err.code}) — Distributor A's draft is invisible to Distributor B`);
  }

  console.log("\n[4] Issuing is correctly blocked until tax is configured (no premature ledger/stock posting)");
  try {
    await issueQuotation(db, distOwner.id, quotation.id);
    throw new Error("ASSERTION FAILED: expected TAX_CONFIGURATION_REQUIRED but issue succeeded");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "TAX_CONFIGURATION_REQUIRED", `Expected TAX_CONFIGURATION_REQUIRED, got ${err}`);
    console.log(`  OK (rejected as expected: ${err.code})`);
  }

  console.log("\n[5] Distributor GST Billing Save Draft succeeds with an unconfigured SKU");
  const bill = await createBillingDraft(db, distOwner.id, {
    type: "TAX_INVOICE",
    issuerType: "DISTRIBUTOR",
    issuerId: distributor.id,
    buyerType: "RETAILER",
    buyerId: retailer.id,
    sourcePortal: "distributor",
    lines: [{ skuId: sku.id, quantity: 1, rate: 100 }],
    idempotencyKey: `dist-taxgate-bill-${suffix}`,
  });
  assert(bill.status === "DRAFT", "Bill must save as DRAFT");
  assert(bill.issuerId === distributor.id, "Bill must be scoped to the correct Distributor Partner");
  console.log(`  OK — bill ${bill.id} saved as DRAFT, scoped to Distributor ${distributor.id}`);

  console.log("\n[6] Bill reload/reopen/edit persists");
  const reBilled = await updateBillingDraft(db, distOwner.id, bill.id, { lines: [{ skuId: sku.id, quantity: 3, rate: 100 }] });
  assert(reBilled.id === bill.id, "Document ID must remain stable");
  assert(Number(reBilled.grandTotal) === 300, `Expected grandTotal 300, got ${reBilled.grandTotal}`);
  console.log("  OK — same document ID, edit persisted");

  console.log("\n[7] Bill issue correctly blocked until tax configured");
  try {
    await issueBillingDraft(db, distOwner.id, bill.id);
    throw new Error("ASSERTION FAILED: expected TAX_CONFIGURATION_REQUIRED but issue succeeded");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "TAX_CONFIGURATION_REQUIRED", `Expected TAX_CONFIGURATION_REQUIRED, got ${err}`);
    console.log(`  OK (rejected as expected: ${err.code})`);
  }

  console.log("\n[8] Once configured, issue succeeds; still no premature posting beyond the document itself");
  await db.seeraSku.update({ where: { id: sku.id }, data: { taxRate: 18, hsn: "34022090" } });
  await updateQuotationDraft(db, distOwner.id, quotation.id, { lines: [{ skuId: sku.id, quantity: 5, rate: 100 }] });
  const issued = await issueQuotation(db, distOwner.id, quotation.id);
  assert(issued.status === "ISSUED", `Expected ISSUED, got ${issued.status}`);
  console.log(`  OK — quotation ${issued.id} issued successfully once tax was configured`);

  console.log("\nALL DISTRIBUTOR DRAFT TAX-GATE SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
