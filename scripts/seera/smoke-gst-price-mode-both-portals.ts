import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createQuotationDraft, updateQuotationDraft, issueQuotation } from "../../lib/sales-distribution/quotation-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { createSku } from "../../lib/sales-distribution/workflow-service";

// TEST-only proof (Founder GST/price-mode correction): the same brand-derived price-mode math
// (MUV = GST-inclusive, every other brand = GST-exclusive/added-on-top) must hold for BOTH the
// Super Stockist portal AND the Distributor portal — explicit instruction not to assume S.S.
// behavior is enough. Issues a real Quotation as S.S. and a real GST Bill as Distributor, each with
// one MUV line and one Seera line, and asserts the resolved line math + priceMode on the actually
// ISSUED document (not just the draft snapshot).

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
function close(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) < eps;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}\n`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const ssOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ssMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ssOwner.id, active: true, partner: { type: "SUPER_STOCKIST" } }, select: { partnerId: true } });
  const ss = { id: ssMembership.partnerId };
  const distributor = await db.seeraPartner.findFirstOrThrow({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: ss.id, lifecycle: "ACTIVE" }, select: { id: true } });

  const distOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const distMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: distOwner.id, active: true, partner: { type: "DISTRIBUTOR" } }, select: { partnerId: true } });
  const distOwnerPartner = { id: distMembership.partnerId };
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { distributorId: distOwnerPartner.id }, select: { id: true } });

  const muvSku = await createSku(db, founder.id, { code: `PMODE-MUV-${suffix}`, productName: "Price Mode Test MUV Product", brand: "MUV", category: "TEST", packSize: 500, unitType: "ml", unitsPerCase: 1, mrp: 298, hsn: "34029090", taxRate: 18 });
  const seeraSku = await createSku(db, founder.id, { code: `PMODE-SEERA-${suffix}`, productName: "Price Mode Test Seera Product", brand: "Seera", category: "TEST", packSize: 180, unitType: "g", unitsPerCase: 40, mrp: 298, hsn: "34021190", taxRate: 18 });

  console.log("=== S.S. PORTAL: Quotation issued with MUV (inclusive) + Seera (exclusive) lines ===");
  const quote = await createQuotationDraft(db, ssOwner.id, {
    issuerType: "SUPER_STOCKIST",
    issuerId: ss.id,
    buyerType: "DISTRIBUTOR",
    buyerId: distributor.id,
    sourcePortal: "super-stockist",
    lines: [
      { skuId: muvSku.id, quantity: 1, rate: 298 },
      { skuId: seeraSku.id, quantity: 1, rate: 252.54 },
    ],
    idempotencyKey: `pmode-ss-quote-${suffix}`,
  });
  const issuedQuote = await issueQuotation(db, ssOwner.id, quote.id);
  assert(issuedQuote.status === "ISSUED", `expected ISSUED, got ${issuedQuote.status}`);
  const quoteLines = issuedQuote.lineSnapshot as unknown as { skuCodeSnapshot: string; priceMode: string; taxableValue: number; taxAmount: number; lineTotal: number }[];
  const muvLine = quoteLines.find((l) => l.skuCodeSnapshot === muvSku.code)!;
  const seeraLine = quoteLines.find((l) => l.skuCodeSnapshot === seeraSku.code)!;
  assert(muvLine.priceMode === "GST_INCLUSIVE", `expected MUV line GST_INCLUSIVE, got ${muvLine.priceMode}`);
  assert(close(muvLine.lineTotal, 298), `expected MUV line total unchanged at ₹298, got ₹${muvLine.lineTotal}`);
  assert(close(muvLine.taxableValue, 252.54, 0.05), `expected MUV taxable ≈₹252.54 (extracted), got ₹${muvLine.taxableValue}`);
  assert(seeraLine.priceMode === "GST_EXCLUSIVE", `expected Seera line GST_EXCLUSIVE, got ${seeraLine.priceMode}`);
  assert(close(seeraLine.taxableValue, 252.54, 0.02), `expected Seera taxable to stay at base ₹252.54, got ₹${seeraLine.taxableValue}`);
  assert(close(seeraLine.lineTotal, 298.0, 0.02), `expected Seera final ≈₹298.00 (base+GST on top), got ₹${seeraLine.lineTotal}`);
  console.log(`  OK — MUV: taxable=₹${muvLine.taxableValue.toFixed(2)} total=₹${muvLine.lineTotal.toFixed(2)} (${muvLine.priceMode})`);
  console.log(`  OK — Seera: taxable=₹${seeraLine.taxableValue.toFixed(2)} total=₹${seeraLine.lineTotal.toFixed(2)} (${seeraLine.priceMode})`);

  console.log("\n=== DISTRIBUTOR PORTAL: GST Bill issued with MUV (inclusive) + Seera (exclusive) lines ===");
  const bill = await createBillingDraft(db, distOwner.id, {
    type: "TAX_INVOICE",
    issuerType: "DISTRIBUTOR",
    issuerId: distOwnerPartner.id,
    buyerType: "RETAILER",
    buyerId: retailer.id,
    sourcePortal: "distributor",
    lines: [
      { skuId: muvSku.id, quantity: 1, rate: 298 },
      { skuId: seeraSku.id, quantity: 1, rate: 252.54 },
    ],
    idempotencyKey: `pmode-dist-bill-${suffix}`,
  });
  const issuedBill = await issueBillingDraft(db, distOwner.id, bill.id);
  assert(issuedBill.status === "ISSUED", `expected ISSUED, got ${issuedBill.status}`);
  const billLines = issuedBill.lineSnapshot as unknown as { skuCodeSnapshot: string; priceMode: string; taxableValue: number; taxAmount: number; lineTotal: number }[];
  const muvBillLine = billLines.find((l) => l.skuCodeSnapshot === muvSku.code)!;
  const seeraBillLine = billLines.find((l) => l.skuCodeSnapshot === seeraSku.code)!;
  assert(muvBillLine.priceMode === "GST_INCLUSIVE", `expected MUV bill line GST_INCLUSIVE, got ${muvBillLine.priceMode}`);
  assert(close(muvBillLine.lineTotal, 298), `expected MUV bill line total unchanged at ₹298, got ₹${muvBillLine.lineTotal}`);
  assert(seeraBillLine.priceMode === "GST_EXCLUSIVE", `expected Seera bill line GST_EXCLUSIVE, got ${seeraBillLine.priceMode}`);
  assert(close(seeraBillLine.lineTotal, 298.0, 0.02), `expected Seera bill final ≈₹298.00, got ₹${seeraBillLine.lineTotal}`);
  console.log(`  OK — MUV: taxable=₹${muvBillLine.taxableValue.toFixed(2)} total=₹${muvBillLine.lineTotal.toFixed(2)} (${muvBillLine.priceMode})`);
  console.log(`  OK — Seera: taxable=₹${seeraBillLine.taxableValue.toFixed(2)} total=₹${seeraBillLine.lineTotal.toFixed(2)} (${seeraBillLine.priceMode})`);

  console.log("\nALL GST PRICE-MODE (BOTH PORTALS) SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
