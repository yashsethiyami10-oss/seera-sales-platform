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
  const r2 = await db.seeraRetailer.findUniqueOrThrow({ where: { id: "cmt2ekmgg000vrz3zju3mcyb4" } });
  console.log(`sfgerge (conflict-test retailer) distributorId=${r2.distributorId} (must stay Kuldeep's, never silently overwritten to Somya)`);
  const history2 = await db.seeraStatusHistory.findMany({ where: { entityType: "SeeraSalesOrder", entityId: "cmt400lin000tw3a1os8ma5ps" } });
  console.log(`conflict order status history: ${JSON.stringify(history2.map((h) => ({ reason: h.reason })))}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
