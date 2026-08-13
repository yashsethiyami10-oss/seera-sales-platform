import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, idempotent (upsert-by-code) seed for the Sales Executive product selector's two
// brand families — see SEERA-SALES-EXECUTIVE-CLOSURE-PASS-#2 section 6/7/8.
//
// SEERA: the 9 Founder-approved product NAMES for this review pass still have no Founder-approved
// retail MRP — inventing one would be worse than leaving it visibly blank, so these seed with
// mrp=1 (an obvious, non-commercial placeholder — never shown to the Executive; see
// OperationalWorkspace.tsx's catalog query comment) and NO SS_TO_DISTRIBUTOR/DISTRIBUTOR_TO_RETAILER
// price version at all, so the Executive-facing Rate field starts empty and the Executive must type
// a real rate. Pack sizes (packSize/unitType below) ARE now Founder-approved for all 9 — RUN 2B
// Section 5/6 supplied the real pack for the 3 Cake variants that previously had no source and
// seeded as a packSize=1/unitType=PCS placeholder; see scripts/seera/seed-company-to-ss-price-list.ts
// for the governed Company→S.S. rate that goes with each pack (not seeded here — this file owns
// catalog/pack identity, that one owns commercial pricing).
//
// MUV: uses the actual Founder-approved catalog manifest already checked into this repo at
// PRODUCTION_CATALOG_MANIFEST.json (36 SKU rows ready to import, 20 unique product names) —
// read-only, no MUV project files are touched. Two rows are intentionally excluded, matching the
// manifest's own resolved decisions: Black Phenyl 500ml (removed per Founder instruction) and
// Black Phenyl 1L (deferred — no MRP source exists yet). That's a real 36 vs. the Founder's stated
// "37 variants" — see this script's console summary, and the closure-pass final report, for that
// exact 1-variant gap; nothing was invented to close it.

const root = path.resolve(import.meta.dirname, "..", "..");
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

// Pack sizes for the 3 Cake SKUs were corrected from an earlier packSize=1/unitType=PCS
// placeholder (see the file-level comment above) to the real Founder-supplied pack info
// (RUN 2B Section 5/6: "180g × 40 pcs / Box" etc.) — this is now the durable source of truth for
// these fields, since this script re-runs after every guarded test suite's DB truncation and would
// otherwise silently revert scripts/seera/seed-company-to-ss-price-list.ts's corrections. unitsPerCase
// (the Box/Bag multiplier) is governed separately by that price-list script, not here, since it is
// specific to the COMPANY_TO_SS commercial context rather than a general SKU property.
//
// Tax master (Founder decision, Pre-Launch Pass 0A, frozen): all 9 current Seera SKUs are washing/
// cleaning preparations under HSN 3402 at GST 18% — governed data on the SKU row (taxRate/hsn),
// never hardcoded into document math. This is what closes the TAX_CONFIGURATION_REQUIRED gate
// (document-lines.ts assertTaxConfigured) for these SKUs; the inclusive-tax formula itself
// (deriveInclusiveTax/taxSplit) was already correct and needed no change.
const SEERA_HSN = "3402";
const SEERA_GST_RATE = 18;
const SEERA_PRODUCTS: Array<{ name: string; packSize: number; unitType: string; code: string }> = [
  { name: "Seera Detergent Cake Blue", packSize: 180, unitType: "g", code: "SEERA-CAKE-BLUE" },
  { name: "Seera Detergent Cake White", packSize: 150, unitType: "g", code: "SEERA-CAKE-WHITE" },
  { name: "Seera Detergent Powder 1 kg", packSize: 1, unitType: "kg", code: "SEERA-POWDER-1KG" },
  { name: "Yuva Detergent Cake Blue", packSize: 170, unitType: "g", code: "SEERA-YUVA-CAKE-BLUE" },
  { name: "Shine Plus Detergent Powder 1 kg", packSize: 1, unitType: "kg", code: "SEERA-SHINEPLUS-POWDER-1KG" },
  { name: "Shine Plus Detergent Powder 3 kg", packSize: 3, unitType: "kg", code: "SEERA-SHINEPLUS-POWDER-3KG" },
  { name: "Shine Plus Detergent Powder 5 kg", packSize: 5, unitType: "kg", code: "SEERA-SHINEPLUS-POWDER-5KG" },
  { name: "Seera Bartan Tub 300 g", packSize: 300, unitType: "g", code: "SEERA-BARTAN-300G" },
  { name: "Seera Bartan Tub 500 g", packSize: 500, unitType: "g", code: "SEERA-BARTAN-500G" },
];

function parsePackSize(raw: string): { value: number; unit: string } {
  const match = /^([\d.]+)\s*(ml|L|kg|g)$/i.exec(raw.trim());
  if (!match) throw new Error(`Unparseable MUV pack size: ${raw}`);
  return { value: Number(match[1]), unit: match[2] };
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  let seeraCreated = 0,
    seeraUpdated = 0;
  for (const item of SEERA_PRODUCTS) {
    const before = await db.seeraSku.findUnique({ where: { code: item.code } });
    await db.seeraSku.upsert({
      where: { code: item.code },
      update: { productName: item.name, packSize: item.packSize, unitType: item.unitType, status: "ACTIVE", hsn: SEERA_HSN, taxRate: SEERA_GST_RATE },
      create: {
        code: item.code,
        productName: item.name,
        brand: "Seera",
        category: "PERSONAL_CARE",
        packSize: item.packSize,
        unitType: item.unitType,
        unitsPerCase: 1,
        mrp: 1,
        status: "ACTIVE",
        hsn: SEERA_HSN,
        taxRate: SEERA_GST_RATE,
        createdById: founder.id,
      },
    });
    if (before) seeraUpdated++;
    else seeraCreated++;
  }

  const manifest = JSON.parse(readFileSync(path.join(root, "PRODUCTION_CATALOG_MANIFEST.json"), "utf8")) as {
    skus: Array<{
      productName: string;
      packSize: string;
      mrp: number;
      sellingPrice: number;
      category: string;
      proposedSkuCode: string;
      conflictOrMissingNote: string;
    }>;
  };
  // Eligibility per the manifest's own statusPolicy: "a SKU still cannot be inserted at all while
  // sellingPrice is null" — checking for the literal phrase "Ready to import" undercounts, since 2
  // of the 36 truly-ready rows (both White Phenyl variants) say "RESOLVED" instead of that exact
  // phrase despite having a verified mrp+sellingPrice. REMOVED/DRAFT rows (both Black Phenyl rows)
  // are correctly excluded because they have no sellingPrice at all.
  const readyRows = manifest.skus.filter((row) => row.sellingPrice != null && row.mrp != null && !/REMOVED|DRAFT/i.test(row.conflictOrMissingNote));

  let muvCreated = 0,
    muvUpdated = 0;
  for (const row of readyRows) {
    const { value, unit } = parsePackSize(row.packSize);
    const before = await db.seeraSku.findUnique({ where: { code: row.proposedSkuCode } });
    const sku = await db.seeraSku.upsert({
      where: { code: row.proposedSkuCode },
      update: { productName: row.productName, packSize: value, unitType: unit, mrp: row.mrp, status: "ACTIVE" },
      create: {
        code: row.proposedSkuCode,
        productName: row.productName,
        brand: "MUV",
        category: row.category,
        packSize: value,
        unitType: unit,
        unitsPerCase: 1,
        mrp: row.mrp,
        status: "ACTIVE",
        createdById: founder.id,
      },
    });
    if (before) muvUpdated++;
    else muvCreated++;
    const existingPrice = await db.seeraPriceVersion.findFirst({
      where: { skuId: sku.id, tier: "DISTRIBUTOR_TO_RETAILER", effectiveFrom: new Date("2026-01-01") },
    });
    if (!existingPrice)
      await db.seeraPriceVersion.create({
        data: {
          skuId: sku.id,
          tier: "DISTRIBUTOR_TO_RETAILER",
          amount: row.sellingPrice,
          mrpSnapshot: row.mrp,
          effectiveFrom: new Date("2026-01-01"),
          status: "ACTIVE",
          createdById: founder.id,
        },
      });
  }

  console.log(
    JSON.stringify(
      {
        fingerprint: target.fingerprint,
        seera: { created: seeraCreated, updated: seeraUpdated, total: SEERA_PRODUCTS.length },
        muv: { created: muvCreated, updated: muvUpdated, total: readyRows.length, uniqueProducts: new Set(readyRows.map((r) => r.productName)).size },
        muvMismatchNote: "Founder stated 20 products / 37 variants. Approved manifest has 20 product families and 38 raw SKU rows, but MUV Black Phenyl has zero importable variants (500ml removed per Founder instruction, 1L deferred — no MRP source exists). Actual importable: 19 products / 36 variants. Not invented to close the gap — see closure-pass final report.",
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
