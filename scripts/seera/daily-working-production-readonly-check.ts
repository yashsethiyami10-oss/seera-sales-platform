import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY production inspection. No create/update/delete/upsert
// anywhere in this file. Guarded by authorizeDatabaseCommand({write:false}),
// which throws PRODUCTION_WRITE_PROHIBITED if anything here ever attempted a
// write against production. Purpose: identify whether the live "Confirm &
// end day" 500 is a schema/config/state mismatch specific to production, per
// the explicit read-only-production-inspection allowance for this task.

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

  console.log("\n=== 1. Do the Daily Working tables exist and respond? ===");
  try {
    const workSessions = await db.seeraWorkSession.count();
    console.log(`  seera_work_sessions: queryable, ${workSessions} total rows`);
  } catch (e) { console.log(`  seera_work_sessions: QUERY FAILED — ${e instanceof Error ? e.message : e}`); }
  try {
    const gpsSamples = await db.seeraGpsSample.count();
    console.log(`  seera_gps_samples: queryable, ${gpsSamples} total rows`);
  } catch (e) { console.log(`  seera_gps_samples: QUERY FAILED — ${e instanceof Error ? e.message : e}`); }
  try {
    const travelEstimates = await db.seeraTravelEstimate.count();
    console.log(`  seera_travel_estimates: queryable, ${travelEstimates} total rows`);
  } catch (e) { console.log(`  seera_travel_estimates: QUERY FAILED — ${e instanceof Error ? e.message : e}`); }
  try {
    const hqConfigs = await db.seeraHqConfiguration.count();
    console.log(`  seera_hq_configurations: queryable, ${hqConfigs} total rows (0 is fine — code degrades gracefully)`);
  } catch (e) { console.log(`  seera_hq_configurations: QUERY FAILED — ${e instanceof Error ? e.message : e}`); }

  console.log("\n=== 2. Ended work sessions vs. successful travel-estimate rows (does end-day's last step ever complete?) ===");
  const endedSessions = await db.seeraWorkSession.count({ where: { status: "ENDED" } });
  const travelEstimateCount = await db.seeraTravelEstimate.count();
  console.log(`  ENDED sessions: ${endedSessions}`);
  console.log(`  Travel estimate rows: ${travelEstimateCount}`);
  console.log(`  (A near-zero travel-estimate count despite many ended sessions would indicate recomputeSessionDistance is failing consistently)`);

  console.log("\n=== 3. Any currently ACTIVE Sales Manager sessions right now? ===");
  const activeManagerSessions = await db.seeraWorkSession.findMany({
    where: { status: "ACTIVE", employeeRole: "SALES_MANAGER" },
    select: { id: true, employeeId: true, startedAt: true, startLatitude: true, startLongitude: true },
    take: 5,
  });
  console.log(`  ${activeManagerSessions.length} active Sales Manager session(s) found (showing up to 5):`);
  for (const s of activeManagerSessions) console.log(`    session=${s.id} employee=${s.employeeId} startedAt=${s.startedAt.toISOString()} gps=${s.startLatitude ?? "none"},${s.startLongitude ?? "none"}`);

  console.log("\n=== 4. SALES_MANAGER role permission seed (does it include manager_field:operate?) ===");
  const role = await db.role.findFirst({ where: { code: "SALES_MANAGER" }, include: { permissions: { include: { permission: true } } } });
  if (!role) {
    console.log("  SALES_MANAGER role: NOT FOUND in production (would be a hard blocker for every manager action, not just end-day)");
  } else {
    const codes = role.permissions.map((p) => p.permission.code).sort();
    console.log(`  SALES_MANAGER role found (status=${role.status}), ${codes.length} permissions seeded`);
    console.log(`  Has manager_field:operate: ${codes.includes("manager_field:operate")}`);
  }

  console.log("\n=== 5. Most recently ENDED sessions — any with null outcome/endedAt (partial failure signature)? ===");
  const recentEnded = await db.seeraWorkSession.findMany({
    where: { status: "ENDED" },
    orderBy: { startedAt: "desc" },
    select: { id: true, employeeRole: true, endedAt: true, outcome: true, startedAt: true },
    take: 5,
  });
  for (const s of recentEnded) console.log(`    session=${s.id} role=${s.employeeRole} startedAt=${s.startedAt.toISOString()} endedAt=${s.endedAt?.toISOString() ?? "NULL"} outcome=${s.outcome ?? "NULL"}`);
}

main()
  .catch((error) => { console.error("SCRIPT-LEVEL FAILURE:", error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
