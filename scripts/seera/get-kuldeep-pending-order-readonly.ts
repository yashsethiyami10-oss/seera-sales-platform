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
  console.log(`[GUARD] role=${target.role}`);
  const orders = await db.seeraSalesOrder.findMany({
    where: { sellerPartnerId: "cmsvy1mj0004s1154q0fc8urs", type: "RETAILER_ORDER", status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } },
    include: { lines: true },
    take: 3,
  });
  console.log(JSON.stringify(orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, lines: o.lines.map((l) => ({ id: l.id, sku: l.skuCodeSnapshot, ordered: l.orderedQuantity })) }))));
  const stockCount = await db.seeraInventoryMovement.count({ where: { partyType: "DISTRIBUTOR", partyId: "cmsvy1mj0004s1154q0fc8urs" } });
  console.log(`Kuldeep's total SeeraInventoryMovement rows: ${stockCount} (0 = never tracks stock)`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
