import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";

// TEST-only reproduction of the live production "Confirm & end day" failure
// for Sales Manager Daily Working. Exercises the real service layer
// (endFieldDay in lib/sales-distribution/workflow-service.ts) exactly as
// app/api/manager/operations/route.ts calls it — same function, same
// arguments shape, same DB. Captures HTTP-equivalent error detail (Prisma
// code, FoundationError code, or raw error) and DB state before/after.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  console.log(`\nManager: ${manager.id} (${manager.normalizedEmail})`);

  let session = await db.seeraWorkSession.findFirst({
    where: { employeeId: manager.id, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  });

  if (!session) {
    console.log("\n=== No active session — starting one via startFieldDay (real service call) ===");
    session = await startFieldDay(db, manager.id, {
      employeeRole: "SALES_MANAGER",
      workingType: "RETAILING",
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 12,
      remarks: "Repro script start-day",
    }) as typeof session;
    console.log(`  Started session ${session!.id}, status=${session!.status}`);
  } else {
    console.log(`\n=== Reusing existing active session ${session.id} (started ${session.startedAt.toISOString()}) ===`);
  }

  console.log("\n=== DB state BEFORE end-day ===");
  const before = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session!.id } });
  console.log(JSON.stringify({ status: before.status, endedAt: before.endedAt, outcome: before.outcome, remarks: before.remarks, endLatitude: before.endLatitude?.toString(), endLongitude: before.endLongitude?.toString() }, null, 2));

  console.log("\n=== Calling endFieldDay (exact same call shape as app/api/manager/operations/route.ts, action=end-day) ===");
  const gpsSamplesBefore = await db.seeraGpsSample.count({ where: { workSessionId: session!.id } });
  const travelEstimateBefore = await db.seeraTravelEstimate.findFirst({ where: { workSessionId: session!.id } });
  try {
    const result = await endFieldDay(db, manager.id, session!.id, {
      latitude: 28.6145,
      longitude: 77.2100,
      accuracy: 15,
      outcome: "COMPLETED",
      remarks: "Repro script: confirm and end day",
    });
    console.log("  RESULT (no throw):", JSON.stringify(result));
  } catch (error) {
    console.log("\n!!! endFieldDay THREW !!!");
    if (error && typeof error === "object") {
      console.log("  name:", (error as { name?: string }).name);
      console.log("  message:", (error as { message?: string }).message);
      console.log("  code (FoundationError or Prisma):", (error as { code?: string }).code);
      console.log("  meta (Prisma):", JSON.stringify((error as { meta?: unknown }).meta));
      console.log("  clientVersion (Prisma):", (error as { clientVersion?: string }).clientVersion);
      console.log("  stack:\n", (error as { stack?: string }).stack);
    } else {
      console.log("  raw error:", error);
    }
  }

  console.log("\n=== DB state AFTER end-day attempt ===");
  const after = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session!.id } });
  console.log(JSON.stringify({ status: after.status, endedAt: after.endedAt, outcome: after.outcome, remarks: after.remarks, endLatitude: after.endLatitude?.toString(), endLongitude: after.endLongitude?.toString(), returnedToHq: after.returnedToHq }, null, 2));
  const gpsSamplesAfter = await db.seeraGpsSample.count({ where: { workSessionId: session!.id } });
  const travelEstimateAfter = await db.seeraTravelEstimate.findFirst({ where: { workSessionId: session!.id } });
  console.log(`\nGPS samples: ${gpsSamplesBefore} -> ${gpsSamplesAfter}`);
  console.log(`Travel estimate before: ${travelEstimateBefore ? travelEstimateBefore.distanceKm.toString() + "km" : "none"}`);
  console.log(`Travel estimate after:  ${travelEstimateAfter ? travelEstimateAfter.distanceKm.toString() + "km" : "none"}`);
}

main()
  .catch((error) => { console.error("SCRIPT-LEVEL FAILURE:", error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
