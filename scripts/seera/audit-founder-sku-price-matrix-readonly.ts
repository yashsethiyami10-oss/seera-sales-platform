import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

const TIERS = ["COMPANY_TO_SS", "SS_TO_DISTRIBUTOR", "DISTRIBUTOR_TO_RETAILER"] as const;

async function printSku(sku: { id: string; code: string; productName: string; brand: string; category: string; status: string; mrp: unknown; taxRate: unknown; hsn: string | null }) {
  console.log(`\n--- ${sku.code} :: ${sku.productName} (${sku.brand}) ---`);
  console.log(`  id=${sku.id} category=${sku.category} status=${sku.status} mrp=${sku.mrp} taxRate=${sku.taxRate} hsn=${sku.hsn ?? "NULL"}`);
  for (const tier of TIERS) {
    const rows = await db.seeraPriceVersion.findMany({ where: { skuId: sku.id, tier, status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" } });
    if (!rows.length) { console.log(`  ${tier}: NONE`); continue; }
    for (const r of rows) console.log(`  ${tier}: amount=${r.amount} marginType=${r.marginType ?? "NULL"} marginValue=${r.marginValue ?? "NULL"} effectiveFrom=${r.effectiveFrom.toISOString()} effectiveTo=${r.effectiveTo?.toISOString() ?? "null"}`);
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const exactCodes = ["SEERA-CAKE-BLUE", "SEERA-CAKE-WHITE", "SEERA-POWDER-1KG", "SEERA-YUVA-CAKE-BLUE", "SEERA-SHINEPLUS-POWDER-1KG"];
  console.log(`\n=== EXACT-CODE LOOKUP ===`);
  for (const code of exactCodes) {
    const sku = await db.seeraSku.findUnique({ where: { code } });
    if (sku) await printSku(sku);
    else console.log(`\n--- ${code}: NOT FOUND BY EXACT CODE ---`);
  }

  console.log(`\n=== FUZZY MATCH FOR YUVA CAKE (if exact code missed) ===`);
  const yuva = await db.seeraSku.findMany({ where: { AND: [{ productName: { contains: "Yuva", mode: "insensitive" } }, { productName: { contains: "Cake", mode: "insensitive" } }] } });
  for (const sku of yuva) await printSku(sku);
  if (!yuva.length) console.log("  no candidates found");

  console.log(`\n=== FUZZY MATCH FOR SHINE PLUS POWDER (if exact code missed) ===`);
  const shine = await db.seeraSku.findMany({ where: { AND: [{ productName: { contains: "Shine", mode: "insensitive" } }, { productName: { contains: "Powder", mode: "insensitive" } }] } });
  for (const sku of shine) await printSku(sku);
  if (!shine.length) console.log("  no candidates found");

  console.log(`\n=== 2 REAL ACTIVE MUV SKUS ===`);
  const muv = await db.seeraSku.findMany({ where: { brand: "MUV", status: "ACTIVE" }, take: 2 });
  for (const sku of muv) await printSku(sku);

  console.log(`\n=== BRAND CENSUS (ACTIVE SKUs) ===`);
  const grouped = await db.seeraSku.groupBy({ by: ["brand"], where: { status: "ACTIVE" }, _count: { _all: true } });
  for (const g of grouped) {
    const ids = (await db.seeraSku.findMany({ where: { brand: g.brand, status: "ACTIVE" }, select: { id: true } })).map((s) => s.id);
    const priced = await db.seeraPriceVersion.findMany({ where: { skuId: { in: ids }, status: "ACTIVE" }, distinct: ["skuId"], select: { skuId: true } });
    console.log(`  ${g.brand}: ${g._count._all} active SKUs, ${priced.length} have >=1 active price version, ${g._count._all - priced.length} have ZERO`);
  }
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
