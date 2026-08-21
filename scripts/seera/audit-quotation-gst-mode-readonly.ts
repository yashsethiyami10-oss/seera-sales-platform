import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Confirms which SKU brands exist in production and what priceMode recent
// quotations actually stored, to verify whether the brand-gated GST_EXCLUSIVE path in
// document-lines.ts's priceModeForBrand is live for real Distributor/S.S. quotations.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const brands = await db.seeraSku.groupBy({ by: ["brand"], _count: { _all: true } });
  console.log("\n== SKU BRANDS IN PRODUCTION ==");
  for (const b of brands) console.log(`  brand=${JSON.stringify(b.brand)} count=${b._count._all}`);

  const skuSample = await db.seeraSku.findMany({ select: { code: true, brand: true, taxRate: true, hsn: true }, take: 10 });
  console.log("\n== SAMPLE SKUS (tax config) ==");
  for (const s of skuSample) console.log(`  code=${s.code} brand=${s.brand} taxRate=${s.taxRate?.toString() ?? null} hsn=${s.hsn ?? null}`);

  const quotations = await db.seeraCommercialDocument.findMany({
    where: { type: "QUOTATION_DOCUMENT" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, documentNumber: true, status: true, createdAt: true, lineSnapshot: true, grandTotal: true },
  });
  console.log(`\n== RECENT QUOTATIONS (${quotations.length}) ==`);
  for (const q of quotations) {
    const lines = Array.isArray(q.lineSnapshot) ? (q.lineSnapshot as any[]) : [];
    const modes = lines.map((l) => l?.priceMode).join(",");
    console.log(`  id=${q.id} number=${q.documentNumber} status=${q.status} createdAt=${q.createdAt.toISOString()} grandTotal=${q.grandTotal?.toString()} lineModes=[${modes}]`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
