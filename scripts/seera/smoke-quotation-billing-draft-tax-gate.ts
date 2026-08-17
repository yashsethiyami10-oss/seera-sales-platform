import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createQuotationDraft, updateQuotationDraft, issueQuotation } from "../../lib/sales-distribution/quotation-service";
import { createBillingDraft, updateBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { createSku } from "../../lib/sales-distribution/workflow-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only proof for the production P0: "Super Stockist -> Quotation -> Save Draft" and
// "-> GST Billing -> Save Draft" were not working at all (zero SeeraCommercialDocument rows exist
// in production). Root cause: buildLineSnapshots() unconditionally threw TAX_CONFIGURATION_REQUIRED
// for any SKU lacking a governed taxRate+HSN — and essentially every production SKU currently lacks
// one — so not even a DRAFT could ever be created. Fix: drafts no longer enforce tax config
// (enforceTax:false); the still-strict gate moved to assertLinesTaxConfigured, enforced once at
// issueQuotation/issueBillingDraft, so an ISSUED document still can never carry a silent zero-tax
// line. This proves both halves: draft succeeds with an unconfigured SKU, issue correctly refuses
// until it's configured, then issue succeeds once it is.

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
  const ssOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ssMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ssOwner.id, active: true, partner: { type: "SUPER_STOCKIST" } }, select: { partnerId: true } });
  const ss = { id: ssMembership.partnerId };
  const distributor = await db.seeraPartner.findFirstOrThrow({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id, lifecycle: "ACTIVE" }, select: { id: true } });

  // A fresh SKU with NO taxRate/hsn — matches production's real current state exactly.
  const sku = await createSku(db, founder.id, {
    code: `TAXGATE-${suffix}`,
    productName: `Tax Gate Test Product ${suffix}`,
    category: "TEST",
    packSize: 500,
    unitType: "g",
    unitsPerCase: 1,
    mrp: 100,
  });
  assert(sku.taxRate == null && !sku.hsn, "Fixture SKU must start with no tax config, matching production reality");

  console.log("[1] Quotation Save Draft succeeds with an unconfigured SKU (previously threw TAX_CONFIGURATION_REQUIRED)");
  const quotation = await createQuotationDraft(db, ssOwner.id, {
    issuerType: "SUPER_STOCKIST",
    issuerId: ss.id,
    buyerType: "DISTRIBUTOR",
    buyerId: distributor.id,
    sourcePortal: "super-stockist",
    lines: [{ skuId: sku.id, quantity: 2, rate: 100 }],
    idempotencyKey: `taxgate-quote-${suffix}`,
  });
  assert(quotation.status === "DRAFT", "Quotation must save as DRAFT");
  console.log(`  OK — quotation ${quotation.id} saved as DRAFT`);

  console.log("\n[2] Quotation draft can be reopened/edited (still unconfigured)");
  const reQuoted = await updateQuotationDraft(db, ssOwner.id, quotation.id, { lines: [{ skuId: sku.id, quantity: 3, rate: 100 }] });
  assert(Number(reQuoted.grandTotal) === 300, `Expected grandTotal 300, got ${reQuoted.grandTotal}`);
  console.log("  OK — edit persisted (grandTotal recalculated)");

  console.log("\n[3] Issuing the quotation is correctly BLOCKED until tax is configured");
  try {
    await issueQuotation(db, ssOwner.id, quotation.id);
    throw new Error("ASSERTION FAILED: expected TAX_CONFIGURATION_REQUIRED but issue succeeded");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "TAX_CONFIGURATION_REQUIRED", `Expected TAX_CONFIGURATION_REQUIRED, got ${err}`);
    assert(err.message.includes(sku.code), `Error message must name the offending SKU (${sku.code}): "${err.message}"`);
    console.log(`  OK (rejected as expected: ${err.code} — names "${sku.code}")`);
  }

  console.log("\n[4] Billing draft (GST Billing / Tax Invoice) also succeeds with an unconfigured SKU");
  const bill = await createBillingDraft(db, ssOwner.id, {
    type: "TAX_INVOICE",
    issuerType: "SUPER_STOCKIST",
    issuerId: ss.id,
    buyerType: "DISTRIBUTOR",
    buyerId: distributor.id,
    sourcePortal: "super-stockist",
    lines: [{ skuId: sku.id, quantity: 1, rate: 100 }],
    idempotencyKey: `taxgate-bill-${suffix}`,
  });
  assert(bill.status === "DRAFT", "Bill must save as DRAFT");
  console.log(`  OK — bill ${bill.id} saved as DRAFT`);

  console.log("\n[5] Bill draft edit persists");
  const reBilled = await updateBillingDraft(db, ssOwner.id, bill.id, { lines: [{ skuId: sku.id, quantity: 4, rate: 100 }] });
  assert(Number(reBilled.grandTotal) === 400, `Expected grandTotal 400, got ${reBilled.grandTotal}`);
  console.log("  OK — edit persisted");

  console.log("\n[6] Issuing the bill (Tax Invoice, ledger-affecting) is correctly BLOCKED until tax is configured");
  try {
    await issueBillingDraft(db, ssOwner.id, bill.id);
    throw new Error("ASSERTION FAILED: expected TAX_CONFIGURATION_REQUIRED but issue succeeded");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "TAX_CONFIGURATION_REQUIRED", `Expected TAX_CONFIGURATION_REQUIRED, got ${err}`);
    console.log(`  OK (rejected as expected: ${err.code})`);
  }

  console.log("\n[7] Once Founder/Admin configures the SKU's GST rate + HSN, issue succeeds after a redraft");
  await db.seeraSku.update({ where: { id: sku.id }, data: { taxRate: 18, hsn: "34022090" } });
  const reQuoted2 = await updateQuotationDraft(db, ssOwner.id, quotation.id, { lines: [{ skuId: sku.id, quantity: 3, rate: 100 }] });
  assert(reQuoted2.status === "DRAFT", "Still a draft after redraft");
  const issued = await issueQuotation(db, ssOwner.id, quotation.id);
  assert(issued.status === "ISSUED", `Expected ISSUED, got ${issued.status}`);
  console.log(`  OK — quotation ${issued.id} issued successfully once tax was configured`);

  console.log("\nALL QUOTATION/BILLING DRAFT TAX-GATE SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
