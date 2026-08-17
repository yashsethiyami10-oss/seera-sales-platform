import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// READ-ONLY production diagnostic. Checks whether the tables the End Day
// workflow depends on (seera_gps_samples, seera_hq_configurations,
// seera_travel_estimates, seera_work_sessions) actually exist in PRODUCTION,
// and which migrations Prisma believes have been applied there. No writes.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: envFile(path.join(root, ".env.test")).TEST_DATABASE_URL });
const runtime = new URL(production);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} write=false (READ-ONLY)`);

  const tables = ["seera_work_sessions", "seera_gps_samples", "seera_hq_configurations", "seera_travel_estimates", "seera_sku", "seera_partners"];
  console.log("\n=== Table existence check (information_schema) ===");
  for (const t of tables) {
    const rows = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) as exists`,
      t,
    );
    console.log(`  ${t}: ${rows[0]?.exists ? "EXISTS" : "MISSING"}`);
  }

  console.log("\n=== Applied migrations (most recent 15) ===");
  const migrations = await db.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 15`,
  );
  for (const m of migrations) {
    console.log(`  ${m.migration_name} — finished=${m.finished_at?.toISOString() ?? "NOT FINISHED"} rolledBack=${m.rolled_back_at ? m.rolled_back_at.toISOString() : "no"}`);
  }

  console.log("\n=== Checking specifically for the two suspect migrations ===");
  const suspects = ["20260808123756_phase_6_9_governed_operations", "20260813212136_seera_finance_os_backfill"];
  for (const name of suspects) {
    const found = migrations.find((m) => m.migration_name === name);
    console.log(`  ${name}: ${found ? `applied, finished=${found.finished_at?.toISOString() ?? "NOT FINISHED"}` : "NOT IN _prisma_migrations TABLE"}`);
  }
}

main().finally(() => db.$disconnect());
