import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard.ts";

// Aggregate-only, read-only production audit. It intentionally prints no employee identity or
// coordinate values and performs no reconstruction/write of historical travel or claims.
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const worktreeRoot = path.resolve(import.meta.dirname, "..", "..");
const root = existsSync(path.join(worktreeRoot, ".env")) ? worktreeRoot : path.resolve(worktreeRoot, "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const testUrl = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl });
const runtime = new URL(production);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} write=false (READ-ONLY)`);
  const sessions = await db.seeraWorkSession.findMany({
    select: {
      id: true, status: true, startLatitude: true, startLongitude: true,
      endLatitude: true, endLongitude: true,
      visits: { select: { checkInLatitude: true, checkInLongitude: true } },
      gpsSamples: { select: { accuracy: true, trackingStatus: true } },
    },
  });
  const reconstructable = sessions.filter((s) => s.gpsSamples.length >= 2);
  const visits = sessions.flatMap((s) => s.visits);
  const samples = sessions.flatMap((s) => s.gpsSamples);
  const claimsByStatus = await db.seeraTaClaim.groupBy({ by: ["status"], _count: { _all: true } });
  const output = {
    sessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "ACTIVE").length,
    sessionsWithStartCoordinates: sessions.filter((s) => s.startLatitude != null && s.startLongitude != null).length,
    sessionsWithEndCoordinates: sessions.filter((s) => s.endLatitude != null && s.endLongitude != null).length,
    daysReconstructableFromAtLeastTwoSamples: reconstructable.length,
    visits: visits.length,
    visitsWithCheckInCoordinates: visits.filter((v) => v.checkInLatitude != null && v.checkInLongitude != null).length,
    gpsSamples: samples.length,
    gpsSamplesWithPoorAccuracy: samples.filter((s) => s.accuracy != null && Number(s.accuracy) > 150).length,
    gpsSamplesMarkedNonOk: samples.filter((s) => s.trackingStatus !== "OK").length,
    travelEstimates: await db.seeraTravelEstimate.count(),
    travelPolicies: await db.seeraTravelPolicy.count(),
    taClaims: Object.fromEntries(claimsByStatus.map((row) => [row.status, row._count._all])),
  };
  console.log(JSON.stringify(output, null, 2));
}

main().finally(() => db.$disconnect());
