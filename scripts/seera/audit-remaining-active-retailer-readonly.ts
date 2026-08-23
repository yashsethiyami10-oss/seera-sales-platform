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
  const retailers = await db.seeraRetailer.findMany({ where: { lifecycle: { not: "INACTIVE" } } });
  for (const r of retailers) {
    const [orders, visits, documents, ledger] = await Promise.all([
      db.seeraSalesOrder.count({ where: { retailerId: r.id } }),
      db.seeraVisit.count({ where: { retailerId: r.id } }),
      db.seeraCommercialDocument.count({ where: { buyerType: "RETAILER", buyerId: r.id } }),
      db.seeraFinancialEntry.count({ where: { OR: [{ debitPartyType: "RETAILER", debitPartyId: r.id }, { creditPartyType: "RETAILER", creditPartyId: r.id }] } }),
    ]);
    console.log(JSON.stringify({ id: r.id, code: r.code, businessName: r.businessName, salespersonId: r.salespersonId, source: r.source, notes: r.notes, createdAt: r.createdAt.toISOString(), lifecycle: r.lifecycle, orders, visits, documents, ledger }));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
