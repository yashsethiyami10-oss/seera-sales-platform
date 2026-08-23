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
async function main() {
  console.log(`[GUARD] role=${target.role} (READ-ONLY)`);
  const codes = ["SEERA-POWDER-1KG", "SEERA-SHINEPLUS-POWDER-1KG", "SEERA-SHINEPLUS-POWDER-3KG", "SEERA-SHINEPLUS-POWDER-5KG", "SEERA-CAKE-BLUE"];
  const skus = await db.seeraSku.findMany({ where: { code: { in: codes } } });
  for (const sku of skus) {
    const prices = await db.seeraPriceVersion.findMany({ where: { skuId: sku.id }, orderBy: [{ tier: "asc" }, { effectiveFrom: "desc" }] });
    console.log(JSON.stringify({
      code: sku.code, mrp: sku.mrp.toString(), packSize: sku.packSize.toString(), unitType: sku.unitType, unitsPerCase: sku.unitsPerCase,
      prices: prices.map((p) => ({ tier: p.tier, amount: p.amount.toString(), status: p.status, effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10) })),
    }));
  }
  // Historical orders for these SKUs prior to today's changes — what quantity/rate/total did REAL
  // pre-existing orders actually use? This tells us definitively what "quantity: 1" meant in
  // practice before any of today's changes.
  const priorLines = await db.seeraOrderLine.findMany({ where: { skuCodeSnapshot: { in: codes } }, orderBy: { id: "asc" }, take: 20 });
  console.log("\nPRIOR ORDER LINES:");
  for (const l of priorLines) console.log(JSON.stringify({ skuCodeSnapshot: l.skuCodeSnapshot, orderedQuantity: l.orderedQuantity.toString(), priceSnapshot: l.priceSnapshot.toString(), lineTotal: l.lineTotal.toString(), packSnapshot: l.packSnapshot }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
