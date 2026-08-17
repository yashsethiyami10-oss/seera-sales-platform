import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { commercialLineInputSchema } from "../../lib/sales-distribution/document-lines";
import { deriveInclusiveTax, taxSplit } from "../../lib/sales-distribution/document-lines";
import { createQuotationDraft, updateQuotationDraft, issueQuotation } from "../../lib/sales-distribution/quotation-service";
import { createSku, bulkConfigureCanonicalSkuGst } from "../../lib/sales-distribution/workflow-service";
import { FoundationError } from "../../lib/foundation/errors";
import { z } from "zod";

// TEST-only proof for THREE things reported in the same directive:
//  1. The actual client-reported bug — "lines.0.taxRate: Expected number, received null" — proven
//     against the REAL shared zod schema (commercialLineInputSchema), not just the service layer
//     underneath it (which smoke-quotation-billing-draft-tax-gate.ts already proved separately —
//     that gap in test methodology is exactly why this schema-layer bug was missed the first time).
//  2. The ₹298-inclusive-GST-at-18% worked example (298 -> taxable ~252.54, GST ~45.46, final
//     298.00 — never 351.64).
//  3. bulkConfigureCanonicalSkuGst end-to-end: creates an unconfigured SKU, proves it's excluded
//     from issuance, runs the bulk action, proves it's now configured and issuable, and that an
//     already-configured SKU is left untouched by a second run (idempotent).

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
function close(a: number, b: number, eps = 0.01) {
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

  console.log("[1] The REAL client payload shape (explicit taxRate: null, not omitted) parses through the shared zod schema");
  const clientPayload = { skuId: "whatever-id", quantity: 2, rate: 298, discountPct: 0, taxRate: null };
  const parsed = commercialLineInputSchema.parse(clientPayload);
  assert(parsed.taxRate === null, "Parsed taxRate must remain null, not coerced");
  console.log("  OK — commercialLineInputSchema.parse() accepts an explicit null (this is the exact schema every quotation/billing draft action now shares)");

  console.log("\n[1b] Sanity: the OLD (buggy) shape would have rejected this — confirming the fix is real, not a no-op");
  const oldBuggySchema = z.object({ skuId: z.string(), quantity: z.number().positive(), rate: z.number().nonnegative(), discountPct: z.number().min(0).max(100).optional(), taxRate: z.number().min(0).max(100).optional() });
  const oldResult = oldBuggySchema.safeParse(clientPayload);
  assert(!oldResult.success, "The old .optional()-only shape was expected to reject an explicit null — if it now accepts it, this proof is meaningless");
  console.log(`  OK — confirmed the old shape genuinely rejects null ("${oldResult.success ? "" : oldResult.error.issues[0]?.message}"), so the fix is a real behavior change`);

  console.log("\n[2] Inclusive GST math: ₹298 gross at 18% -> taxable ~252.54, GST ~45.46, final 298.00 (never 351.64)");
  const { taxableValue, taxAmount } = deriveInclusiveTax(298, 18);
  assert(close(taxableValue, 252.54, 0.01), `Expected taxable ~252.54, got ${taxableValue.toFixed(2)}`);
  assert(close(taxAmount, 45.46, 0.01), `Expected GST ~45.46, got ${taxAmount.toFixed(2)}`);
  const final = taxableValue + taxAmount;
  assert(close(final, 298, 0.001), `Expected final 298.00, got ${final.toFixed(2)}`);
  assert(!close(final, 351.64, 1), "Sanity: must NOT match the incorrect 298+18% figure");
  console.log(`  OK — taxable=${taxableValue.toFixed(2)}, GST=${taxAmount.toFixed(2)}, final=${final.toFixed(2)}`);
  const split = taxSplit("27AAAAA0000A1Z5", "27BBBBB0000B1Z5", taxAmount);
  assert(close(split.cgst, taxAmount / 2, 0.01) && close(split.sgst, taxAmount / 2, 0.01) && split.igst === 0, "Same-state must split CGST+SGST evenly, zero IGST");
  console.log(`  OK — same-state split: CGST=${split.cgst.toFixed(2)}, SGST=${split.sgst.toFixed(2)}, IGST=${split.igst}`);

  console.log("\n[3] bulkConfigureCanonicalSkuGst: unconfigured SKU excluded from issuance beforehand");
  const freshSku = await createSku(db, founder.id, { code: `GST-BULK-${suffix}`, productName: `GST Bulk Test ${suffix}`, category: "TEST", packSize: 500, unitType: "g", unitsPerCase: 1, mrp: 298 });
  assert(freshSku.taxRate == null && !freshSku.hsn, "Fixture SKU must start unconfigured");
  const draft = await createQuotationDraft(db, ssOwner.id, { issuerType: "SUPER_STOCKIST", issuerId: ss.id, buyerType: "DISTRIBUTOR", buyerId: distributor.id, sourcePortal: "super-stockist", lines: [{ skuId: freshSku.id, quantity: 1, rate: 298 }], idempotencyKey: `gst-bulk-quote-${suffix}` });
  try {
    await issueQuotation(db, ssOwner.id, draft.id);
    throw new Error("ASSERTION FAILED: expected TAX_CONFIGURATION_REQUIRED before bulk config");
  } catch (err) {
    assert(err instanceof FoundationError && err.code === "TAX_CONFIGURATION_REQUIRED" && err.message.includes(freshSku.code), `Expected TAX_CONFIGURATION_REQUIRED naming ${freshSku.code}, got ${err}`);
    console.log(`  OK — correctly blocked pre-configuration, names "${freshSku.code}"`);
  }

  console.log("\n[4] Bulk action configures it (18% inclusive, frozen HSN) and issuance now succeeds");
  const bulkResult = await bulkConfigureCanonicalSkuGst(db, founder.id);
  assert(bulkResult.skus.some((s) => s.code === freshSku.code), `Expected ${freshSku.code} in the bulk-configured list`);
  const reloaded = await db.seeraSku.findUniqueOrThrow({ where: { id: freshSku.id } });
  assert(Number(reloaded.taxRate) === 18, `Expected taxRate 18, got ${reloaded.taxRate}`);
  assert(!!reloaded.hsn, "Expected hsn to be set");
  await updateQuotationDraft(db, ssOwner.id, draft.id, { lines: [{ skuId: freshSku.id, quantity: 1, rate: 298 }] });
  const issued = await issueQuotation(db, ssOwner.id, draft.id);
  assert(issued.status === "ISSUED", `Expected ISSUED, got ${issued.status}`);
  const issuedLines = issued.lineSnapshot as unknown as { taxRate: number }[];
  assert(Number(issuedLines[0]!.taxRate) === 18, "Issued line must carry the resolved 18% rate, no manual per-document GST selection required");
  console.log(`  OK — ${freshSku.code} now configured, quotation ${issued.id} issued with GST auto-resolved from canonical SKU config`);

  console.log("\n[5] Idempotent: a second bulk run does not touch already-configured SKUs");
  const before = await db.seeraSku.count({ where: { status: "ACTIVE", taxRate: { not: null }, hsn: { not: null } } });
  const secondRun = await bulkConfigureCanonicalSkuGst(db, founder.id);
  assert(!secondRun.skus.some((s) => s.code === freshSku.code), `${freshSku.code} must not be reconfigured on a second run`);
  const after = await db.seeraSku.count({ where: { status: "ACTIVE", taxRate: { not: null }, hsn: { not: null } } });
  assert(after === before, `Configured-SKU count must be unchanged by the idempotent rerun — before=${before}, after=${after}`);
  console.log(`  OK — second run configured ${secondRun.configured} new SKUs (only genuinely still-unconfigured ones), left ${before} already-configured SKUs untouched`);

  console.log("\nALL GST GOVERNANCE + SCHEMA-FIX SMOKE CHECKS PASSED");
}
main().finally(() => db.$disconnect());
