import { createHash } from "node:crypto";
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

type NamedCount = { name: string; count: bigint };
type Migration = { migration_name: string; checksum: string };
type SchemaRow = { table_name: string; column_name: string; data_type: string; is_nullable: string };

const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const testEnv = envFile(path.join(root, ".env.test"));
const pooled = testEnv.TEST_DATABASE_URL;
const sourceUrl = testEnv.TEST_DIRECT_DATABASE_URL;
const restoreUrl = testEnv.TEST_RESTORE_DATABASE_URL;

if (!restoreUrl?.trim()) throw new Error("TEST_RESTORE_DATABASE_URL_MISSING");
if (!sourceUrl?.trim()) throw new Error("TEST_DIRECT_DATABASE_URL_MISSING");

const isolated = validateDatabaseIsolation({ productionUrl: production, testUrl: pooled });
const source = inspectDatabaseUrl(sourceUrl, "test");
const restore = inspectDatabaseUrl(restoreUrl, "test");

if (source.host.includes("-pooler") || restore.host.includes("-pooler")) throw new Error("DIRECT_ENDPOINT_REQUIRED");
if (source.database !== isolated.test.database) throw new Error("SOURCE_DATABASE_MISMATCH");
if (restore.database !== source.database) throw new Error("RESTORE_DATABASE_MISMATCH");
if (restore.fingerprint === source.fingerprint || restore.fingerprint === isolated.test.fingerprint) throw new Error("RESTORE_NOT_ISOLATED");
if (restore.fingerprint === isolated.production.fingerprint) throw new Error("RESTORE_POINTS_TO_PRODUCTION");

const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const restoreDb = new PrismaClient({ datasources: { db: { url: restoreUrl } } });
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

async function snapshot(db: PrismaClient) {
  const schema = await db.$queryRaw<SchemaRow[]>`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`;
  const migrations = await db.$queryRaw<Migration[]>`
    SELECT migration_name, checksum
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  const counts = await db.$queryRaw<NamedCount[]>`
    SELECT 'users' AS name, count(*) AS count FROM users
    UNION ALL SELECT 'retailers', count(*) FROM seera_retailers
    UNION ALL SELECT 'orders', count(*) FROM seera_sales_orders
    UNION ALL SELECT 'order_lines', count(*) FROM seera_order_lines
    UNION ALL SELECT 'stock_movements', count(*) FROM seera_inventory_movements
    UNION ALL SELECT 'documents', count(*) FROM seera_commercial_documents
    UNION ALL SELECT 'financial_entries', count(*) FROM seera_financial_entries
    UNION ALL SELECT 'partners', count(*) FROM seera_partners
    ORDER BY name`;
  const foreignKeys = await db.$queryRaw<{ total: bigint; validated: bigint }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE convalidated) AS validated
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'`;
  return {
    schemaHash: sha(schema),
    schemaColumns: schema.length,
    migrationHash: sha(migrations),
    migrations: migrations.map((row) => row.migration_name),
    counts: Object.fromEntries(counts.map((row) => [row.name, Number(row.count)])),
    foreignKeys: { total: Number(foreignKeys[0]?.total ?? 0), validated: Number(foreignKeys[0]?.validated ?? 0) },
  };
}

async function main() {
  const drillStarted = Date.now();
  const sourceStarted = Date.now();
  await sourceDb.$queryRaw`SELECT 1`;
  const sourceProbeMs = Date.now() - sourceStarted;
  const restoreStarted = Date.now();
  await restoreDb.$queryRaw`SELECT 1`;
  await restoreDb.$queryRaw`SELECT now()`;
  const restoreProbeMs = Date.now() - restoreStarted;
  const sourceSnapshot = await snapshot(sourceDb);
  const restoreSnapshot = await snapshot(restoreDb);
  const schemaMatches = sourceSnapshot.schemaHash === restoreSnapshot.schemaHash;
  const migrationsMatch = sourceSnapshot.migrationHash === restoreSnapshot.migrationHash;
  const dataCountsMatch = JSON.stringify(sourceSnapshot.counts) === JSON.stringify(restoreSnapshot.counts);
  const foreignKeysValid = restoreSnapshot.foreignKeys.total > 0 && restoreSnapshot.foreignKeys.total === restoreSnapshot.foreignKeys.validated;
  if (!schemaMatches || !migrationsMatch || !dataCountsMatch || !foreignKeysValid) throw new Error("RESTORE_VERIFICATION_MISMATCH");
  console.log(JSON.stringify({
    status: "PASS",
    identity: {
      variableExists: true,
      directUnpooled: true,
      seeraDatabaseMatches: true,
      distinctFromProduction: true,
      distinctFromSourceTest: true,
      notKnownMuv: true,
      sourceFingerprint: source.fingerprint,
      restoreFingerprint: restore.fingerprint,
    },
    connectivity: { sourceProbeMs, restoreProbeMs },
    verification: {
      schemaMatches,
      schemaColumns: restoreSnapshot.schemaColumns,
      migrationsMatch,
      migrationCount: restoreSnapshot.migrations.length,
      latestMigration: restoreSnapshot.migrations.at(-1),
      representativeCounts: restoreSnapshot.counts,
      dataCountsMatch,
      foreignKeys: restoreSnapshot.foreignKeys,
      foreignKeysValid,
    },
    measuredValidationMs: Date.now() - drillStarted,
    rpo: "ZERO_AT_BRANCH_CHECKPOINT",
  }));
}

main().finally(async () => {
  const started = Date.now();
  await Promise.all([sourceDb.$disconnect(), restoreDb.$disconnect()]);
  console.log(JSON.stringify({ disconnectMs: Date.now() - started }));
});
