import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// READ-ONLY production diagnostic: inspects the actual Sales Executive
// user(s) and their most recent SeeraWorkSession rows, GPS samples, and
// travel estimates, looking for anomalous data (bad employeeRole, orphaned
// rows, stuck ACTIVE sessions) that could explain the End Day P0
// (Error ID de02b1a5-0a95-47d2-8642-3886d65bb6f1) without guessing from
// code inspection alone. No writes.

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

  const executives = await db.user.findMany({
    where: { roleAssignments: { some: { role: { code: "SALES_EXECUTIVE" }, status: "ACTIVE" } } },
    select: { id: true, name: true, email: true, normalizedEmail: true },
  });
  console.log(`\n=== Active Sales Executive users: ${executives.length} ===`);
  for (const e of executives) console.log(`  ${e.id}  ${e.name ?? "(no name)"}  ${e.email}`);

  for (const exec of executives) {
    console.log(`\n=== Recent SeeraWorkSession rows for ${exec.name ?? exec.email} (${exec.id}) ===`);
    const sessions = await db.seeraWorkSession.findMany({
      where: { employeeId: exec.id },
      orderBy: { startedAt: "desc" },
      take: 5,
    });
    if (!sessions.length) { console.log("  (none)"); continue; }
    for (const s of sessions) {
      console.log(`  session ${s.id}`);
      console.log(`    employeeRole=${JSON.stringify(s.employeeRole)} workingType=${JSON.stringify(s.workingType)} status=${s.status}`);
      console.log(`    workingDistributorId=${s.workingDistributorId ?? "null"}`);
      console.log(`    startedAt=${s.startedAt.toISOString()} endedAt=${s.endedAt?.toISOString() ?? "null"}`);
      console.log(`    startLat/Lng=${s.startLatitude?.toString() ?? "null"}/${s.startLongitude?.toString() ?? "null"} endLat/Lng=${s.endLatitude?.toString() ?? "null"}/${s.endLongitude?.toString() ?? "null"}`);
      console.log(`    hqId=${s.hqId ?? "null"} startInsideGeofence=${s.startInsideGeofence} returnedToHq=${s.returnedToHq}`);
      console.log(`    outcome=${s.outcome ?? "null"} remarks=${s.remarks ?? "null"}`);
      const gpsCount = await db.seeraGpsSample.count({ where: { workSessionId: s.id } });
      const travelEstimate = await db.seeraTravelEstimate.findFirst({ where: { workSessionId: s.id } });
      console.log(`    gpsSamples=${gpsCount} travelEstimate=${travelEstimate ? travelEstimate.distanceKm.toString() + "km" : "none"}`);
      const visits = await db.seeraVisit.count({ where: { workSessionId: s.id } });
      console.log(`    visits=${visits}`);
    }
  }

  console.log("\n=== SeeraHqConfiguration (active) ===");
  const hqs = await db.seeraHqConfiguration.findMany({ where: { status: "ACTIVE" } });
  console.log(`  count=${hqs.length}`);
  for (const h of hqs) console.log(`  ${h.id} ${h.name} lat=${h.latitude.toString()} lng=${h.longitude.toString()} radius=${h.radiusMeters}m effectiveFrom=${h.effectiveFrom.toISOString()} effectiveTo=${h.effectiveTo?.toISOString() ?? "null"}`);

  console.log("\n=== Stuck ACTIVE sessions older than 24h (any employee) ===");
  const stuck = await db.seeraWorkSession.findMany({
    where: { status: "ACTIVE", startedAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    select: { id: true, employeeId: true, employeeRole: true, startedAt: true },
  });
  console.log(`  count=${stuck.length}`);
  for (const s of stuck) console.log(`  ${s.id} employeeId=${s.employeeId} role=${s.employeeRole} startedAt=${s.startedAt.toISOString()}`);
}

main().finally(() => db.$disconnect());
