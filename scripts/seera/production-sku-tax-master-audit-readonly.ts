import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// READ-ONLY production audit (Section B of the directive): for every active/live SKU, report
// brand, current GST rate, current HSN, current configured price(s) per tier, and classify against
// the authoritative canonical rules:
//   - MUV: GST 18%, PRICE MODE = GST INCLUDED (rate is the final gross figure).
//   - Seera / Yuva / Shine Plus: rates are BASE/GST-EXCLUSIVE; GST (if configured) is additive.
// Specifically checks whether the prior blanket bulkConfigureCanonicalSkuGst action (18% inclusive,
// HSN "34021190") already wrongly touched any non-MUV SKU. No writes.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: envFile(path.join(root, ".env.test")).TEST_DATABASE_URL });
const runtime = new URL(production);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

// Canonical Company->S.S. base rates from the Founder directive (GST-exclusive for non-MUV).
const CANONICAL_BASE_RATES: Record<string, number> = {
  "SEERA-CAKE-BLUE": 252.54,
  "SEERA-CAKE-WHITE": 252.54,
  "SEERA-POWDER-1KG": 1165.26,
  "SEERA-SHINEPLUS-POWDER-1KG": 953.39,
  "SEERA-SHINEPLUS-POWDER-3KG": 1144.06,
  "SEERA-SHINEPLUS-POWDER-5KG": 1144.06,
  "SEERA-YUVA-CAKE-BLUE": 252.54,
};

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} write=false (READ-ONLY)`);

  const brands = await db.seeraSku.groupBy({ by: ["brand"], _count: { _all: true } });
  console.log("\n=== Distinct brand values in production ===");
  for (const b of brands) console.log(`  "${b.brand}" — ${b._count._all} SKU(s)`);

  const skus = await db.seeraSku.findMany({
    where: { status: { not: "DISCONTINUED" } },
    include: { prices: { where: { status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } } },
    orderBy: [{ brand: "asc" }, { code: "asc" }],
  });

  console.log(`\n=== Full SKU tax/price audit (${skus.length} active/draft SKUs) ===`);
  for (const s of skus) {
    const isMuv = /^muv$/i.test(s.brand) || /^MUV-/.test(s.code);
    const taxRate = s.taxRate != null ? Number(s.taxRate) : null;
    const companyToSs = s.prices.find((p) => p.tier === "COMPANY_TO_SS");
    const ssToDist = s.prices.find((p) => p.tier === "SS_TO_DISTRIBUTOR");
    const distToRetailer = s.prices.find((p) => p.tier === "DISTRIBUTOR_TO_RETAILER");
    const canonical = CANONICAL_BASE_RATES[s.code];

    let classification: string;
    if (isMuv) {
      classification = taxRate === 18 ? "CORRECT (MUV, 18%)" : taxRate == null ? "MISSING (MUV, no GST configured)" : `REVIEW (MUV, GST=${taxRate}% not 18%)`;
    } else {
      // Non-MUV: flag as INCORRECT if it was set to exactly 18% + HSN "34021190" (the blanket
      // bulk action's signature) AND its Company->S.S. price does not already match the canonical
      // GST-exclusive base rate (i.e., there's no evidence it was deliberately, correctly configured).
      const looksLikeBlanketBulkConfig = taxRate === 18 && s.hsn === "34021190";
      classification = taxRate == null ? "PENDING (non-MUV, no GST configured — correct to leave pending, not invent)" : looksLikeBlanketBulkConfig ? "SUSPECT — matches blanket-bulk-action signature (18% + HSN 34021190), verify against real GST master" : `CONFIGURED (non-MUV, GST=${taxRate}%, HSN=${s.hsn})`;
    }

    console.log(`\n  ${s.code} (${s.productName}) brand="${s.brand}" status=${s.status}`);
    console.log(`    taxRate=${taxRate ?? "null"} hsn=${s.hsn ?? "null"} -> ${classification}`);
    console.log(`    COMPANY_TO_SS=${companyToSs ? Number(companyToSs.amount).toFixed(2) : "none"}  SS_TO_DISTRIBUTOR=${ssToDist ? Number(ssToDist.amount).toFixed(2) : "none"}  DISTRIBUTOR_TO_RETAILER=${distToRetailer ? Number(distToRetailer.amount).toFixed(2) : "none"}`);
    if (canonical != null) {
      const actual = companyToSs ? Number(companyToSs.amount) : null;
      const matches = actual != null && Math.abs(actual - canonical) < 0.02;
      console.log(`    CANONICAL COMPANY_TO_SS base rate = ${canonical.toFixed(2)} -> ${matches ? "MATCHES" : `MISMATCH (actual=${actual?.toFixed(2) ?? "none"})`}`);
    }
  }
}

main().finally(() => db.$disconnect());
