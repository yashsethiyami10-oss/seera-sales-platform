import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { inspectDatabaseUrl, validateDatabaseIsolation } from "../../lib/database/identity-guard";

function envFile(file: string) {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test"));
const isolated = validateDatabaseIsolation({ productionUrl: production, testUrl: test.TEST_DATABASE_URL });
const direct = inspectDatabaseUrl(test.TEST_DIRECT_DATABASE_URL, "test");
if (direct.projectIdentifier !== isolated.test.projectIdentifier || direct.database !== isolated.test.database) throw new Error("DIRECT_TEST_IDENTITY_MISMATCH");

const db = new PrismaClient({ datasources: { db: { url: test.TEST_DIRECT_DATABASE_URL } } });
async function main() {
  const rows = await db.$queryRaw<Array<{ state: string | null; wait_event_type: string | null; wait_event: string | null; count: bigint; oldest_query_seconds: number | null; oldest_transaction_seconds: number | null }>>`
    SELECT state, wait_event_type, wait_event, COUNT(*)::bigint AS count,
      MAX(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)))::float8 AS oldest_query_seconds,
      MAX(EXTRACT(EPOCH FROM (clock_timestamp() - xact_start)))::float8 AS oldest_transaction_seconds
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    GROUP BY state, wait_event_type, wait_event
    ORDER BY count DESC
  `;
  console.log(JSON.stringify({ fingerprint: isolated.test.fingerprint, connections: rows.map(row => ({ ...row, count: Number(row.count) })) }));
}
main().finally(async () => db.$disconnect());
