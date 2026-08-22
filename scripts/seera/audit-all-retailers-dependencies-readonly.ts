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
  const retailers = await db.seeraRetailer.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`TOTAL RETAILERS: ${retailers.length}\n`);
  const salespersonIds = [...new Set(retailers.map((r) => r.salespersonId).filter((x): x is string => Boolean(x)))];
  const distributorIds = [...new Set(retailers.map((r) => r.distributorId).filter((x): x is string => Boolean(x)))];
  const [salespeople, distributors] = await Promise.all([
    db.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, email: true } }),
    db.seeraPartner.findMany({ where: { id: { in: distributorIds } }, select: { id: true, legalName: true, tradeName: true } }),
  ]);
  const spMap = new Map(salespeople.map((s) => [s.id, s.name ?? s.email]));
  const distMap = new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  let totalOrders = 0, totalVisits = 0, totalPhotos = 0, totalDocs = 0, totalLedger = 0, zeroDepCount = 0;
  for (const r of retailers) {
    const [orderCount, visitCount, docCount, ledgerCount] = await Promise.all([
      db.seeraSalesOrder.count({ where: { retailerId: r.id } }),
      db.seeraVisit.count({ where: { retailerId: r.id } }),
      db.seeraCommercialDocument.count({ where: { buyerType: "RETAILER", buyerId: r.id } }),
      db.seeraFinancialEntry.count({ where: { OR: [{ debitPartyType: "RETAILER", debitPartyId: r.id }, { creditPartyType: "RETAILER", creditPartyId: r.id }] } }),
    ]);
    const photoCount = await db.seeraVisitPhoto.count({ where: { visit: { retailerId: r.id } } }).catch(() => 0);
    totalOrders += orderCount; totalVisits += visitCount; totalPhotos += photoCount; totalDocs += docCount; totalLedger += ledgerCount;
    const zeroDeps = orderCount === 0 && visitCount === 0 && docCount === 0 && ledgerCount === 0;
    if (zeroDeps) zeroDepCount++;
    console.log(JSON.stringify({
      id: r.id,
      code: r.code,
      businessName: r.businessName,
      mobile: r.mobile ?? r.normalizedMobile,
      executive: r.salespersonId ? (spMap.get(r.salespersonId) ?? r.salespersonId) : null,
      distributor: r.distributorId ? (distMap.get(r.distributorId) ?? r.distributorId) : null,
      beatId: r.beatId,
      territoryId: r.territoryId,
      lifecycle: r.lifecycle,
      orders: orderCount,
      visits: visitCount,
      photos: photoCount,
      documents: docCount,
      ledgerEntries: ledgerCount,
      createdAt: r.createdAt.toISOString(),
      notes: r.notes,
      zeroDependencies: zeroDeps,
    }));
  }
  console.log(`\nSUMMARY: total=${retailers.length} zeroDependencies=${zeroDepCount} withDependencies=${retailers.length - zeroDepCount}`);
  console.log(`Aggregate: orders=${totalOrders} visits=${totalVisits} photos=${totalPhotos} documents=${totalDocs} ledgerEntries=${totalLedger}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
