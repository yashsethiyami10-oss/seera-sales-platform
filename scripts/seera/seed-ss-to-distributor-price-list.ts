import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, idempotent seed for the governed SS_TO_DISTRIBUTOR Seera price list — RUN 2B resume
// Stage 1F. This closes the gap the RUN 2B final report flagged honestly: no SS_TO_DISTRIBUTOR price
// existed for any real Seera SKU, so a real-catalog Distributor replenishment order could never be
// placed (createDistributorReplenishment throws PRICE_UNAVAILABLE by design — no invented rate).
//
// Founder pricing rule (Stage 1 Section 15):
//  - Detergent cakes (Blue/White/Yuva): FIXED ₹315 per governed commercial pack, SAME free-piece
//    scheme as Company->S.S. (Blue 1pc, White 1pc, Yuva 2pcs free).
//  - Powders + Bartan tubs: CURRENT S.S. (Company->S.S.) base rate + 8% markup.
//
// "Do NOT permanently code rate*1.08 inside normal workflow logic. Use editable pricing policy" —
// satisfied by SeeraPriceVersion.marginType/marginValue (already in schema, previously unused):
// this script COMPUTES the derived amount from the live Company->S.S. rate at seed time and stores
// it as a normal materialized price (matching how every other price this codebase reads works —
// createDistributorReplenishment always reads `.amount` directly, never a live formula), while
// marginType/marginValue record the POLICY that produced it, so a future Founder/Admin pricing UI
// can show "computed as base + 8%" and let the Founder change 8 -> another number without touching
// this script's logic. Re-running this script after a Company->S.S. rate change recomputes the
// derived S.S.->Distributor rate from the NEW base, matching "current S.S. base rate + 8%" (current,
// not frozen). Historical order/quotation/invoice snapshots are never touched by a re-run — this only
// writes a NEW active SeeraPriceVersion row (or updates the one at the same effectiveFrom), exactly
// like every other price-list seed in this codebase.

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
const CAKE_FIXED_RATE = 315;
const POWDER_BARTAN_MARKUP_PCT = 8;

// Same 3 cake SKUs as Company->S.S. — fixed rate, same scheme.
const CAKE_CODES = ["SEERA-CAKE-BLUE", "SEERA-CAKE-WHITE", "SEERA-YUVA-CAKE-BLUE"] as const;
const CAKE_SCHEMES: Array<{ code: string; name: string; freeQuantity: number }> = [
  { code: "SEERA-CAKE-BLUE", name: "1 pc Free per Box (S.S.->Distributor)", freeQuantity: 1 },
  { code: "SEERA-CAKE-WHITE", name: "1 pc Free per Box (S.S.->Distributor)", freeQuantity: 1 },
  { code: "SEERA-YUVA-CAKE-BLUE", name: "2 pcs Free per Box (S.S.->Distributor)", freeQuantity: 2 },
];

// Powder + Bartan SKUs — base (Company->S.S.) rate + 8% markup, computed live from the current
// active COMPANY_TO_SS price, never hardcoded.
const MARKUP_CODES = ["SEERA-POWDER-1KG", "SEERA-SHINEPLUS-POWDER-1KG", "SEERA-SHINEPLUS-POWDER-3KG", "SEERA-SHINEPLUS-POWDER-5KG", "SEERA-BARTAN-300G", "SEERA-BARTAN-500G"] as const;

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  let priceCreated = 0,
    priceUpdated = 0,
    schemeCreated = 0,
    schemeUnchanged = 0,
    skipped = 0;

  async function upsertSsToDistributorPrice(code: string, amount: number, marginType: "FIXED" | "PERCENTAGE", marginValue: number) {
    const sku = await db.seeraSku.findUnique({ where: { code } });
    if (!sku) {
      console.warn(`[SKIP] Seera SKU not found: ${code}`);
      skipped++;
      return;
    }
    const existing = await db.seeraPriceVersion.findUnique({
      where: { skuId_tier_effectiveFrom: { skuId: sku.id, tier: "SS_TO_DISTRIBUTOR", effectiveFrom: EFFECTIVE_FROM } },
    });
    if (existing) {
      await db.seeraPriceVersion.update({ where: { id: existing.id }, data: { amount, marginType, marginValue, mrpSnapshot: sku.mrp, status: "ACTIVE" } });
      priceUpdated++;
    } else {
      await db.seeraPriceVersion.create({
        data: { skuId: sku.id, tier: "SS_TO_DISTRIBUTOR", amount, marginType, marginValue, mrpSnapshot: sku.mrp, effectiveFrom: EFFECTIVE_FROM, status: "ACTIVE", createdById: founder.id },
      });
      priceCreated++;
    }
  }

  for (const code of CAKE_CODES) await upsertSsToDistributorPrice(code, CAKE_FIXED_RATE, "FIXED", CAKE_FIXED_RATE);

  for (const code of MARKUP_CODES) {
    const sku = await db.seeraSku.findUnique({ where: { code } });
    if (!sku) {
      console.warn(`[SKIP] Seera SKU not found: ${code}`);
      skipped++;
      continue;
    }
    const now = new Date();
    const basePrice = await db.seeraPriceVersion.findFirst({
      where: { skuId: sku.id, tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!basePrice) {
      console.warn(`[SKIP] No active COMPANY_TO_SS base price for ${code} — cannot derive markup`);
      skipped++;
      continue;
    }
    const derivedAmount = Math.round(Number(basePrice.amount) * (1 + POWDER_BARTAN_MARKUP_PCT / 100) * 100) / 100;
    await upsertSsToDistributorPrice(code, derivedAmount, "PERCENTAGE", POWDER_BARTAN_MARKUP_PCT);
  }

  for (const scheme of CAKE_SCHEMES) {
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
        eligibilityType: "SS_TO_DISTRIBUTOR_DISPLAY_ONLY",
        freeQuantity: scheme.freeQuantity,
        applicability: { scope: "SS_TO_DISTRIBUTOR", appliesToOrderTotal: false, reason: "Display-only — no governed application mechanism wired in this codebase (matches the Company->S.S. scheme treatment, Stage 1 Section 15)." },
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
        cakes: { codes: CAKE_CODES, fixedRate: CAKE_FIXED_RATE },
        powderBartan: { codes: MARKUP_CODES, markupPct: POWDER_BARTAN_MARKUP_PCT, note: "amount derived live from current active COMPANY_TO_SS rate at seed time" },
        prices: { created: priceCreated, updated: priceUpdated },
        schemes: { created: schemeCreated, unchanged: schemeUnchanged },
        skipped,
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
