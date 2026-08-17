import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createCompanyOrder, createDistributorReplenishment, placeRetailerOrder, createSku, createPriceVersion } from "../../lib/sales-distribution/workflow-service";
import { deriveInclusiveTax, deriveExclusiveTax, taxSplit, buildLineSnapshots } from "../../lib/sales-distribution/document-lines";

// STAGE 1E smoke test — GST-inclusive taxTotal derivation (RUN 2B resume Section 12).
//  T1. Real Seera SKUs now carry governed tax config (Founder decision, Pre-Launch Pass 0A:
//      HSN 3402, GST 18%, frozen for the current 9-SKU range) — a real Company Order must produce a
//      real, correctly-derived taxTotal, not a hardcoded 0.
//  T2. Dormant-fix activation with a synthetic taxed fixture SKU: same proof, isolated from the real
//      catalog so the exact ₹118 textbook numbers stay stable regardless of catalog changes.
//  T3. Founder's own worked examples via buildLineSnapshots/taxSplit — the exact function real
//      Quotation/GST Billing issuance uses — proving intra-state CGST+SGST and inter-state IGST
//      both derive correctly for the MUV/GST-inclusive path (T3a-c, ₹31,600 gross @ 18%), AND
//      (Founder correction, this turn) that Seera/Yuva/Shine Plus resolve GST-EXCLUSIVE instead —
//      GST added on top of the supplied base rate, never extracted from it (T3d, ₹252.54 base @ 18%).
// Safe to re-run: fresh idempotency keys/SKU code per run.

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
function close(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });

  // ============= TEST 1: real Seera SKU now has governed tax (Founder decision) =============
  const realSeeraSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  assert(!!realSeeraSku.hsn, `expected the frozen Founder tax master HSN on the real Seera catalog, got hsn=${realSeeraSku.hsn}`);
  assert(Number(realSeeraSku.taxRate) === 18, `expected the frozen Founder tax master (GST 18%) on the real Seera catalog, got taxRate=${realSeeraSku.taxRate}`);
  const realOrder = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s1e-real-${suffix}`, lines: [{ skuId: realSeeraSku.id, quantity: 1 }] });
  assert(Number(realOrder.taxTotal) > 0, `expected a real, non-zero derived taxTotal now that the real SKU has governed tax config, got ${realOrder.taxTotal}`);
  const realGross = Number(realOrder.total);
  const realExpectedTax = deriveInclusiveTax(realGross, 18).taxAmount;
  assert(close(Number(realOrder.taxTotal), realExpectedTax), `expected taxTotal to be the inclusive-derived tax on the real gross (~₹${realExpectedTax.toFixed(2)}), got ₹${realOrder.taxTotal}`);
  console.log(`[T1] OK — real Company Order for SEERA-CAKE-BLUE: gross total unchanged (₹${realGross}), taxTotal now correctly derived (₹${Number(realOrder.taxTotal).toFixed(2)}) instead of hardcoded 0`);

  // ============= TEST 2: dormant-fix activation with a governed taxRate =============
  const taxedSku = await db.seeraSku.upsert({
    where: { code: `STAGE1E-TAXED-${suffix}` },
    update: {},
    create: { code: `STAGE1E-TAXED-${suffix}`, productName: "Stage 1E GST Test SKU (NOT a real product)", brand: "Seera", category: "TEST_FIXTURE", packSize: 1, unitType: "PCS", unitsPerCase: 1, mrp: 118, hsn: "340111", taxRate: 18, status: "ACTIVE", createdById: founder.id },
  });
  await createPriceVersion(db, founder.id, { skuId: taxedSku.id, tier: "COMPANY_TO_SS", amount: 118, effectiveFrom: new Date("2026-01-01") });
  await createPriceVersion(db, founder.id, { skuId: taxedSku.id, tier: "SS_TO_DISTRIBUTOR", amount: 118, effectiveFrom: new Date("2026-01-01") });
  await createPriceVersion(db, founder.id, { skuId: taxedSku.id, tier: "DISTRIBUTOR_TO_RETAILER", amount: 118, effectiveFrom: new Date("2026-01-01") });

  // 118 gross @ 18% GST-inclusive -> taxable=100, tax=18 (the textbook example from the Founder prompt)
  const expectedTaxPerUnit = deriveInclusiveTax(118, 18).taxAmount;
  assert(close(expectedTaxPerUnit, 18), `sanity check on deriveInclusiveTax itself failed, expected ~18, got ${expectedTaxPerUnit}`);

  const companyOrder = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s1e-co-${suffix}`, lines: [{ skuId: taxedSku.id, quantity: 3 }] });
  assert(close(Number(companyOrder.total), 354), `expected gross total to stay exactly 118*3=354 (never taxable+tax again), got ${companyOrder.total}`);
  assert(close(Number(companyOrder.taxTotal), expectedTaxPerUnit * 3), `expected Company Order taxTotal to be real derived tax (~${(expectedTaxPerUnit * 3).toFixed(2)}), got ${companyOrder.taxTotal}`);
  console.log(`[T2a] OK — Company Order with a governed taxRate: gross total unchanged (₹${companyOrder.total}), taxTotal now correctly derived (₹${Number(companyOrder.taxTotal).toFixed(2)}) instead of hardcoded 0`);

  const distReplen = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `s1e-do-${suffix}`, lines: [{ skuId: taxedSku.id, quantity: 2 }] });
  assert(close(Number(distReplen.total), 236), `expected gross total to stay exactly 118*2=236, got ${distReplen.total}`);
  assert(close(Number(distReplen.taxTotal), expectedTaxPerUnit * 2), `expected Distributor Replenishment taxTotal to be real derived tax (~${(expectedTaxPerUnit * 2).toFixed(2)}), got ${distReplen.taxTotal}`);
  console.log(`[T2b] OK — Distributor Replenishment with a governed taxRate: gross total unchanged (₹${distReplen.total}), taxTotal correctly derived (₹${Number(distReplen.taxTotal).toFixed(2)})`);

  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: { not: null } } });
  const retailerOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId! },
    { retailerId: retailer.id, idempotencyKey: `s1e-ro-${suffix}`, lines: [{ skuId: taxedSku.id, quantity: 1, rate: 118 }] },
  );
  assert(close(Number(retailerOrder.total), 118), `expected gross total to stay exactly 118, got ${retailerOrder.total}`);
  assert(close(Number(retailerOrder.taxTotal), expectedTaxPerUnit), `expected Retailer Order taxTotal to be real derived tax (~${expectedTaxPerUnit.toFixed(2)}), got ${retailerOrder.taxTotal}`);
  console.log(`[T2c] OK — Retailer Order with a governed taxRate + client-submitted rate: gross total unchanged (₹${retailerOrder.total}), taxTotal correctly derived (₹${Number(retailerOrder.taxTotal).toFixed(2)})`);

  // ============= TEST 3: Founder's own worked example (₹31,600 gross, 18%, MUV) =============
  // Exercises the exact function real Quotation/Tax Invoice issuance calls (buildLineSnapshots),
  // not a re-implementation — proves the document-issuance path, not just the bare formula.
  // Founder correction (this turn): price mode is now brand-derived — MUV stays GST-inclusive
  // (this worked example), every other brand (Seera/Yuva/Shine Plus) is GST-exclusive (T3d below).
  const t3Sku = await db.seeraSku.upsert({
    where: { code: `STAGE1E-31600-${suffix}` },
    update: {},
    create: { code: `STAGE1E-31600-${suffix}`, productName: "Stage 1E ₹31,600 worked example SKU (NOT a real product)", brand: "MUV", category: "TEST_FIXTURE", packSize: 1, unitType: "PCS", unitsPerCase: 1, mrp: 31600, hsn: "3402", taxRate: 18, status: "ACTIVE", createdById: founder.id },
  });
  const [snap] = await buildLineSnapshots(db, [{ skuId: t3Sku.id, quantity: 1, rate: 31600 }], { enforceTax: false });
  assert(snap.priceMode === "GST_INCLUSIVE", `expected MUV SKU to resolve GST_INCLUSIVE price mode, got ${snap.priceMode}`);
  assert(close(snap.taxableValue, 26779.66, 0.05), `expected taxable ≈ ₹26,779.66, got ₹${snap.taxableValue.toFixed(2)}`);
  assert(close(snap.taxAmount, 4820.34, 0.05), `expected embedded GST ≈ ₹4,820.34, got ₹${snap.taxAmount.toFixed(2)}`);
  assert(close(snap.lineTotal, 31600), `expected line total to remain exactly the gross ₹31,600 (never added on top), got ₹${snap.lineTotal}`);
  console.log(`[T3a] OK — MUV ₹31,600 gross @ 18% inclusive: taxable=₹${snap.taxableValue.toFixed(2)}, GST=₹${snap.taxAmount.toFixed(2)}, gross unchanged=₹${snap.lineTotal}`);

  // ============= TEST 3d: Founder correction — Seera/Yuva/Shine Plus are GST-EXCLUSIVE =============
  // ₹252.54 base @ 18% exclusive -> GST added ON TOP -> final ≈ ₹298.00 (matches the same worked
  // total as the MUV ₹298-inclusive example, by design — both land near ₹298, one by extraction,
  // one by addition, proving neither path silently doubles or drops GST).
  const seeraExclusiveSku = await db.seeraSku.upsert({
    where: { code: `STAGE1E-25254-${suffix}` },
    update: {},
    create: { code: `STAGE1E-25254-${suffix}`, productName: "Stage 1E ₹252.54 base worked example SKU (NOT a real product)", brand: "Seera", category: "TEST_FIXTURE", packSize: 180, unitType: "g", unitsPerCase: 40, mrp: 298, hsn: "34021190", taxRate: 18, status: "ACTIVE", createdById: founder.id },
  });
  const [exclSnap] = await buildLineSnapshots(db, [{ skuId: seeraExclusiveSku.id, quantity: 1, rate: 252.54 }], { enforceTax: false });
  assert(exclSnap.priceMode === "GST_EXCLUSIVE", `expected Seera SKU to resolve GST_EXCLUSIVE price mode, got ${exclSnap.priceMode}`);
  assert(close(exclSnap.taxableValue, 252.54, 0.01), `expected taxable to stay exactly the supplied base ₹252.54 (never extracted from it), got ₹${exclSnap.taxableValue.toFixed(2)}`);
  assert(close(exclSnap.taxAmount, 45.46, 0.01), `expected GST added on top ≈ ₹45.46 (252.54*18%), got ₹${exclSnap.taxAmount.toFixed(2)}`);
  assert(close(exclSnap.lineTotal, 298.0, 0.02), `expected final gross ≈ ₹298.00 (base + GST on top, never left at the bare base), got ₹${exclSnap.lineTotal.toFixed(2)}`);
  assert(!close(exclSnap.lineTotal, 252.54, 1), "sanity: must not silently stay at the bare base with no GST added");
  console.log(`[T3d] OK — Seera ₹252.54 base @ 18% exclusive: taxable=₹${exclSnap.taxableValue.toFixed(2)}, GST=₹${exclSnap.taxAmount.toFixed(2)}, final=₹${exclSnap.lineTotal.toFixed(2)} (GST added on top, not extracted)`);
  const rawExclusive = deriveExclusiveTax(252.54, 18);
  assert(close(rawExclusive.taxAmount, exclSnap.taxAmount, 0.001), "sanity: deriveExclusiveTax and buildLineSnapshots must agree exactly");

  const sameStateSplit = taxSplit("09ABCDE1234F1Z5", "09XYZAB5678C1Z2", snap.taxAmount);
  assert(close(sameStateSplit.cgst, 2410.17, 0.05), `expected same-state CGST ≈ ₹2,410.17, got ₹${sameStateSplit.cgst.toFixed(2)}`);
  assert(close(sameStateSplit.sgst, 2410.17, 0.05), `expected same-state SGST ≈ ₹2,410.17, got ₹${sameStateSplit.sgst.toFixed(2)}`);
  assert(sameStateSplit.igst === 0, `expected same-state IGST = 0, got ${sameStateSplit.igst}`);
  console.log(`[T3b] OK — same-state (both GSTIN state code 09): CGST=₹${sameStateSplit.cgst.toFixed(2)}, SGST=₹${sameStateSplit.sgst.toFixed(2)}, IGST=₹0, sum=₹${(sameStateSplit.cgst + sameStateSplit.sgst).toFixed(2)} matches embedded GST`);

  const interStateSplit = taxSplit("09ABCDE1234F1Z5", "27XYZAB5678C1Z2", snap.taxAmount);
  assert(interStateSplit.cgst === 0 && interStateSplit.sgst === 0, `expected inter-state CGST/SGST = 0, got cgst=${interStateSplit.cgst} sgst=${interStateSplit.sgst}`);
  assert(close(interStateSplit.igst, 4820.34, 0.05), `expected inter-state IGST ≈ ₹4,820.34, got ₹${interStateSplit.igst.toFixed(2)}`);
  console.log(`[T3c] OK — inter-state (issuer 09, buyer 27): CGST=₹0, SGST=₹0, IGST=₹${interStateSplit.igst.toFixed(2)} matches embedded GST`);

  console.log("\nALL STAGE 1E GST TAX-TOTAL SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
