import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

function readEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function main() {
const root = path.resolve(import.meta.dirname, "..", "..");
const productionUrl = readEnv(path.join(root, ".env")).DATABASE_URL;
const testUrl = readEnv(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({
  intendedRole: "test",
  write: false,
  targetUrl: testUrl,
  productionUrl,
  testUrl,
});
console.log(`[SEERA DB GUARD] role=${target.role} host=${target.host} database=${target.database} fingerprint=${target.fingerprint}`);

const expected = [
  "_prisma_migrations", "app_settings", "audit_logs", "auth_accounts", "auth_sessions",
  "auth_verification_tokens", "feature_flags", "idempotency_keys", "notification_deliveries",
  "notifications", "outbox_events", "permissions", "role_permissions", "roles", "stored_files",
  "user_role_assignments", "users",
];
const forbidden = [
  "Retailer", "Distributor", "SuperStockist", "Beat", "SalesVisit", "CommercialOrder", "OrderItem",
  "FulfilmentEvent", "Ledger", "Payment", "BillingProfile", "ExpenseClaim", "PartnerLifecycleEvent",
  "Product", "Category", "Customer", "Coupon", "Review", "Shipment",
].map((name) => name.toLowerCase());

const prisma = new PrismaClient({ datasourceUrl: testUrl });
try {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  const names = tables.map((row) => row.table_name);
  const unexpected = names.filter((name) => !expected.includes(name));
  const missing = expected.filter((name) => !names.includes(name));
  const muvLeakage = names.filter((name) => forbidden.some((token) => name.toLowerCase().includes(token)));
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`;
  const constraints = await prisma.$queryRaw<Array<{ constraint_type: string; count: bigint }>>`
    SELECT constraint_type, COUNT(*)::bigint AS count FROM information_schema.table_constraints
    WHERE table_schema = 'public' GROUP BY constraint_type ORDER BY constraint_type`;
  const indexes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM pg_indexes WHERE schemaname = 'public'`;
  const rowCounts: Record<string, number> = {};
  for (const name of names.filter((name) => name !== "_prisma_migrations")) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error("Unsafe table identifier returned by catalog");
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${name}"`);
    rowCounts[name] = Number(rows[0]?.count ?? 0n);
  }
  const unexpectedData = Object.entries(rowCounts).filter(([, count]) => count !== 0);
  const result = {
    target,
    tables: names,
    missing,
    unexpected,
    muvLeakage,
    migrations: migrations.map((row) => ({
      name: row.migration_name,
      applied: Boolean(row.finished_at) && !row.rolled_back_at,
    })),
    constraints: Object.fromEntries(constraints.map((row) => [row.constraint_type, Number(row.count)])),
    indexes: Number(indexes[0]?.count ?? 0n),
    rowCounts,
    unexpectedData,
  };
  console.log(JSON.stringify(result, null, 2));
  if (missing.length || unexpected.length || muvLeakage.length || unexpectedData.length) process.exitCode = 1;
  if (result.migrations.length !== 1 || !result.migrations[0]?.applied) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Test database verification failed");
  process.exitCode = 1;
});
