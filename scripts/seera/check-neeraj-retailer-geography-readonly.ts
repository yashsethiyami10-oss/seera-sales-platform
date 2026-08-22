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
  const neeraj = await db.user.findFirst({ where: { email: "neerajrawatseera@gmail.com" } });
  if (!neeraj) throw new Error("not found");
  const retailers = await db.seeraRetailer.findMany({ where: { salespersonId: neeraj.id, lifecycle: "ACTIVE" }, select: { id: true, businessName: true, beatId: true, territoryId: true, marketId: true, distributorId: true } });
  console.log(`Neeraj active retailers: ${retailers.length}`);
  for (const r of retailers) console.log(JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
