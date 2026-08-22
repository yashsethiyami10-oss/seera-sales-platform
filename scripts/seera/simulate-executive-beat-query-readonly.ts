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
  const now = new Date();
  console.log(`server now = ${now.toISOString()}`);
  const windowEnd = new Date(now.getTime() + 6 * 86_400_000);
  const plans = await db.seeraJourneyPlan.findMany({
    where: {
      employeeId: "cmswmy5je00079oa9nffc08wp",
      status: "PUBLISHED",
      dayOfWeek: { in: [0, 1, 2, 3, 4, 5, 6] },
      effectiveFrom: { lte: windowEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  console.log(`plans matched by the FIXED "week" query: ${plans.length}`);
  for (const p of plans) console.log(`  id=${p.id} dayOfWeek=${p.dayOfWeek} effectiveFrom=${p.effectiveFrom.toISOString()} status=${p.status}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
