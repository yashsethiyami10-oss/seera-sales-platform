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
  const events = await db.outboxEvent.findMany({
    where: { channel: "WHATSAPP", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, eventType: true, status: true, payload: true, createdAt: true },
  });
  console.log(`Recent (last 15min) WHATSAPP outbox events: ${events.length}`);
  for (const e of events) console.log(`  ${e.createdAt.toISOString()} type=${e.eventType} status=${e.status} payload=${JSON.stringify(e.payload).slice(0, 150)}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
