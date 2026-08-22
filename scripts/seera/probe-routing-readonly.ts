import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Probes why RETAILER_ORDER.sellerPartnerId is null for most production orders.

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
  const nullSellerOrders = await db.seeraSalesOrder.findMany({ where: { type: "RETAILER_ORDER", sellerPartnerId: null }, select: { retailerId: true }, take: 30 });
  const retailerIds = [...new Set(nullSellerOrders.map((o) => o.retailerId).filter(Boolean))] as string[];
  const retailers = await db.seeraRetailer.findMany({ where: { id: { in: retailerIds } }, select: { id: true, businessName: true, distributorId: true, marketId: true } });
  console.log(`\n== RETAILERS BEHIND NULL-SELLER ORDERS (${retailers.length}) ==`);
  for (const r of retailers) console.log(`  id=${r.id} name=${r.businessName} distributorId=${r.distributorId ?? "NULL"} marketId=${r.marketId ?? "NULL"}`);

  const allRetailers = await db.seeraRetailer.count();
  const retailersWithDistributor = await db.seeraRetailer.count({ where: { distributorId: { not: null } } });
  console.log(`\nTotal retailers: ${allRetailers}, with distributorId set: ${retailersWithDistributor}`);

  const activeDistributors = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true, territoryIds: true } });
  console.log(`\n== ACTIVE DISTRIBUTOR PARTNERS (${activeDistributors.length}) ==`);
  for (const d of activeDistributors) console.log(`  id=${d.id} name=${d.legalName} territoryIds=${JSON.stringify(d.territoryIds)}`);

  const marketIds = [...new Set(retailers.map((r) => r.marketId).filter(Boolean))] as string[];
  console.log(`\nSample retailer marketIds: ${JSON.stringify(marketIds.slice(0, 5))}`);
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
