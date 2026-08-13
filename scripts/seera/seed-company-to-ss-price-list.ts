import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, idempotent (upsert-by-[skuId,tier,effectiveFrom]) seed for the governed Company→Super
// Stockist price list — RUN 2B Sections 2-8. All rates below come verbatim from the Founder's RUN
// 2B prompt (Seera) and the Founder-supplied MUV rate-list image (MUV, "S.S. PRICE" column only —
// never MRP/Distribution/Retail price). Every rate is GST-inclusive per Founder Section 4: the
// stored `amount` IS the final gross commercial rate; no GST is added on top anywhere this price
// feeds an order (see createCompanyOrder in workflow-service.ts, which already sets taxTotal: 0 for
// COMPANY_REPLENISHMENT orders and uses price.amount directly as the line total).
//
// Nothing here invents a price, a tax rate, or an HSN code. Seera SKUs stay hsn=null/taxRate=null
// (as before) because the Founder's RUN 2B prompt did not supply either for these 9 products — see
// RUN 2B final report Section 26 for why that gap is reported honestly rather than filled with an
// invented rate.
//
// See lib/sales-distribution/company-order-catalog.ts for the commercial-order-unit (Box/Bag/kg)
// and scheme-note overrides this script also seeds display metadata for.

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

const EFFECTIVE_FROM = new Date("2026-01-01");

// Seera: code -> { packSize, unitType, unitsPerCase, rate } — pack corrections come from Founder
// RUN 2B Section 5/6 (these 9 SKUs previously had placeholder packSize=1/unitType=PCS for 3 of them
// per seed-product-catalog.ts's own comment: "no Founder-approved... pack size yet"). mrp is left
// untouched (still the intentional mrp=1 non-commercial placeholder) — no retail MRP was supplied
// this pass, only the Company→S.S. wholesale rate.
const SEERA_RATES: Array<{ code: string; packSize: number; unitType: string; unitsPerCase: number; rate: number }> = [
  { code: "SEERA-CAKE-BLUE", packSize: 180, unitType: "g", unitsPerCase: 40, rate: 298 },
  { code: "SEERA-CAKE-WHITE", packSize: 150, unitType: "g", unitsPerCase: 40, rate: 298 },
  { code: "SEERA-YUVA-CAKE-BLUE", packSize: 170, unitType: "g", unitsPerCase: 40, rate: 298 },
  { code: "SEERA-POWDER-1KG", packSize: 1, unitType: "kg", unitsPerCase: 1, rate: 56.5 },
  { code: "SEERA-SHINEPLUS-POWDER-1KG", packSize: 1, unitType: "kg", unitsPerCase: 1, rate: 46 },
  { code: "SEERA-SHINEPLUS-POWDER-3KG", packSize: 3, unitType: "kg", unitsPerCase: 10, rate: 1380 },
  { code: "SEERA-SHINEPLUS-POWDER-5KG", packSize: 5, unitType: "kg", unitsPerCase: 6, rate: 1380 },
  { code: "SEERA-BARTAN-300G", packSize: 300, unitType: "g", unitsPerCase: 36, rate: 540 },
  { code: "SEERA-BARTAN-500G", packSize: 500, unitType: "g", unitsPerCase: 24, rate: 504 },
];

const SEERA_SCHEMES: Array<{ code: string; name: string; freeQuantity: number }> = [
  { code: "SEERA-CAKE-BLUE", name: "1 pc Free per Box", freeQuantity: 1 },
  { code: "SEERA-CAKE-WHITE", name: "1 pc Free per Box", freeQuantity: 1 },
  { code: "SEERA-YUVA-CAKE-BLUE", name: "2 pcs Free per Box", freeQuantity: 2 },
];

// MUV: canonical proposedSkuCode -> S.S. PRICE (GST-inclusive), sourced from the Founder-supplied
// rate-list image. Mapped 1:1 against PRODUCTION_CATALOG_MANIFEST.json's approved codes — no
// duplicate SKU created for any name variance. MUV-BP-STD-1000 (Black Phenyl 1L) is intentionally
// excluded (DRAFT/no MRP — see company-order-catalog.ts MUV_BLACK_PHENYL_EXCLUDED_NOTE).
const MUV_RATES: Record<string, number> = {
  "MUV-LD-IR-1000": 116.25,
  "MUV-LD-IR-5000": 524.25,
  "MUV-LD-CW-1000": 116.25,
  "MUV-LD-CW-5000": 524.25,
  "MUV-LD-LG-1000": 116.25,
  "MUV-LD-LG-5000": 524.25,
  "MUV-TC-STD-500": 60.0,
  "MUV-TC-STD-5000": 300.0,
  "MUV-DG-STD-500": 63.75,
  "MUV-DG-STD-1000": 116.25,
  "MUV-DG-STD-5000": 524.25,
  "MUV-BC-STD-500": 48.75,
  "MUV-GC-STD-500": 67.5,
  "MUV-FC-VM-1000": 112.5,
  "MUV-FC-VM-5000": 411.75,
  "MUV-FC-CWK-1000": 112.5,
  "MUV-FC-CWK-5000": 411.75,
  "MUV-CW-STD-500": 52.5,
  "MUV-CW-STD-5000": 412.5,
  // "Phenyl" (unqualified) resolved to White Phenyl — see company-order-catalog.ts MUV_PHENYL_ALIAS_NOTE.
  "MUV-WP-STD-1000": 45.0,
  "MUV-WP-STD-5000": 202.5,
  "MUV-BL-STD-500": 37.5,
  "MUV-HW-LS-250": 60.0,
  "MUV-HW-LS-500": 71.25,
  "MUV-HW-SB-500": 71.25,
  "MUV-HW-OF-500": 71.25,
  "MUV-HW-OF-5000": 543.75,
  "MUV-HW-CB-250": 60.0,
  "MUV-HW-CB-500": 71.25,
  "MUV-HW-CB-5000": 543.75,
  "MUV-BW-CV-250": 77.0,
  "MUV-BW-CV-950": 252.0,
  "MUV-BW-VO-250": 77.0,
  "MUV-BW-VO-950": 252.0,
  "MUV-BW-MF-250": 77.0,
  "MUV-BW-MF-950": 252.0,
};

const MUV_SCHEME_NOTE = "Additional 2.5% Scheme on Each Buy";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  let priceCreated = 0,
    priceUnchanged = 0,
    packUpdated = 0,
    schemeCreated = 0,
    schemeUnchanged = 0,
    skipped = 0;

  for (const item of SEERA_RATES) {
    const sku = await db.seeraSku.findUnique({ where: { code: item.code } });
    if (!sku) {
      console.warn(`[SKIP] Seera SKU not found: ${item.code}`);
      skipped++;
      continue;
    }
    // packSize/unitType are NOT written here — seed-product-catalog.ts is the durable owner of those
    // two fields (it re-runs after every guarded test suite's DB truncation; writing them here too
    // would just be overwritten back on the next restore cycle, which is exactly the bug this
    // comment now documents rather than repeats). unitsPerCase (the Box/Bag conversion multiplier)
    // is COMPANY_TO_SS-specific commercial context, so it stays owned here.
    await db.seeraSku.update({
      where: { id: sku.id },
      data: { unitsPerCase: item.unitsPerCase },
    });
    packUpdated++;

    const existingPrice = await db.seeraPriceVersion.findUnique({
      where: { skuId_tier_effectiveFrom: { skuId: sku.id, tier: "COMPANY_TO_SS", effectiveFrom: EFFECTIVE_FROM } },
    });
    if (existingPrice) {
      await db.seeraPriceVersion.update({ where: { id: existingPrice.id }, data: { amount: item.rate, mrpSnapshot: sku.mrp, status: "ACTIVE" } });
      priceUnchanged++;
    } else {
      await db.seeraPriceVersion.create({
        data: { skuId: sku.id, tier: "COMPANY_TO_SS", amount: item.rate, mrpSnapshot: sku.mrp, effectiveFrom: EFFECTIVE_FROM, status: "ACTIVE", createdById: founder.id },
      });
      priceCreated++;
    }
  }

  for (const scheme of SEERA_SCHEMES) {
    const sku = await db.seeraSku.findUnique({ where: { code: scheme.code } });
    if (!sku) continue;
    const existing = await db.seeraScheme.findFirst({ where: { skuId: sku.id, name: scheme.name } });
    if (existing) {
      schemeUnchanged++;
      continue;
    }
    await db.seeraScheme.create({
      data: {
        name: scheme.name,
        skuId: sku.id,
        eligibilityType: "COMPANY_TO_SS_DISPLAY_ONLY",
        freeQuantity: scheme.freeQuantity,
        applicability: { scope: "COMPANY_TO_SS", appliesToOrderTotal: false, reason: "Display-only — no governed application mechanism wired in this codebase (RUN 2B Section 8)." },
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: new Date("2027-01-01"),
        status: "ACTIVE",
        createdById: founder.id,
      },
    });
    schemeCreated++;
  }

  for (const [code, rate] of Object.entries(MUV_RATES)) {
    const sku = await db.seeraSku.findUnique({ where: { code } });
    if (!sku) {
      console.warn(`[SKIP] MUV SKU not found in catalog: ${code}`);
      skipped++;
      continue;
    }
    const existingPrice = await db.seeraPriceVersion.findUnique({
      where: { skuId_tier_effectiveFrom: { skuId: sku.id, tier: "COMPANY_TO_SS", effectiveFrom: EFFECTIVE_FROM } },
    });
    if (existingPrice) {
      await db.seeraPriceVersion.update({ where: { id: existingPrice.id }, data: { amount: rate, mrpSnapshot: sku.mrp, status: "ACTIVE" } });
      priceUnchanged++;
    } else {
      await db.seeraPriceVersion.create({
        data: { skuId: sku.id, tier: "COMPANY_TO_SS", amount: rate, mrpSnapshot: sku.mrp, effectiveFrom: EFFECTIVE_FROM, status: "ACTIVE", createdById: founder.id },
      });
      priceCreated++;
    }
  }

  const muvSchemeExisting = await db.seeraScheme.findFirst({ where: { skuId: null, name: MUV_SCHEME_NOTE } });
  if (muvSchemeExisting) schemeUnchanged++;
  else {
    await db.seeraScheme.create({
      data: {
        name: MUV_SCHEME_NOTE,
        skuId: null,
        eligibilityType: "COMPANY_TO_SS_DISPLAY_ONLY",
        discountPercent: 2.5,
        applicability: { scope: "MUV_COMPANY_TO_SS_PRICE_LIST", appliesToOrderTotal: false, reason: "Display-only — application mechanism (deduction vs credit-note vs rebate) not governed by existing commercial policy (RUN 2B Section 8)." },
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: new Date("2027-01-01"),
        status: "ACTIVE",
        createdById: founder.id,
      },
    });
    schemeCreated++;
  }

  console.log(
    JSON.stringify(
      {
        fingerprint: target.fingerprint,
        seera: { skus: SEERA_RATES.length, packUpdated },
        muv: { requested: Object.keys(MUV_RATES).length },
        prices: { created: priceCreated, updated: priceUnchanged },
        schemes: { created: schemeCreated, unchanged: schemeUnchanged },
        skipped,
        excluded: ["MUV-BP-STD-1000 (Black Phenyl 1L) — DRAFT/no approved MRP, intentionally not priced"],
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
