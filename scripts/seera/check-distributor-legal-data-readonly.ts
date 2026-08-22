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
  const distributors = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, orderBy: { legalName: "asc" } });
  for (const d of distributors) {
    console.log(`\n${d.legalName} (${d.code})`);
    console.log(`  gstin=${d.gstin ?? "NULL"} pan=${d.pan ?? "NULL"}`);
    console.log(`  addresses=${JSON.stringify(d.addresses)}`);
    console.log(`  primaryContact=${JSON.stringify(d.primaryContact)}`);
  }
  const ss = await db.seeraPartner.findMany({ where: { type: "SUPER_STOCKIST", lifecycle: "ACTIVE" } });
  for (const s of ss) {
    console.log(`\n[S.S.] ${s.legalName} (${s.code})`);
    console.log(`  gstin=${s.gstin ?? "NULL"} pan=${s.pan ?? "NULL"}`);
    console.log(`  addresses=${JSON.stringify(s.addresses)}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
