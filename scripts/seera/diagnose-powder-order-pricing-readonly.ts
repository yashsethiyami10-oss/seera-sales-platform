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
  const orders = await db.seeraSalesOrder.findMany({ where: { orderNumber: { in: ["CO-A971B51E66BFDB", "CO-CC292F12A58777"] } }, include: { lines: true } });
  for (const o of orders) {
    console.log(JSON.stringify({ orderNumber: o.orderNumber, subtotal: o.subtotal, taxTotal: o.taxTotal, total: o.total, lines: o.lines.map((l) => ({ skuCodeSnapshot: l.skuCodeSnapshot, orderedQuantity: l.orderedQuantity, priceSnapshot: l.priceSnapshot, lineTotal: l.lineTotal })) }));
  }
  const sku = await db.seeraSku.findFirst({ where: { code: "SEERA-POWDER-1KG" } });
  console.log("\nSKU:", JSON.stringify({ id: sku?.id, code: sku?.code, unitsPerCase: sku?.unitsPerCase, taxRate: sku?.taxRate?.toString() }));
  const prices = await db.seeraPriceVersion.findMany({ where: { skuId: sku?.id, tier: "COMPANY_TO_SS" }, orderBy: { effectiveFrom: "desc" } });
  console.log("\nPRICE VERSIONS:", JSON.stringify(prices.map((p) => ({ amount: p.amount.toString(), status: p.status, effectiveFrom: p.effectiveFrom.toISOString(), effectiveTo: p.effectiveTo?.toISOString() ?? null }))));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
