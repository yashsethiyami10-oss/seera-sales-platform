import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only. Seeds the governed "standard field" TA/DA policy (₹2/km, ₹150/day — the Founder's
// initial rates from the Sales Executive Founder-UAT remediation) and one test HQ configuration,
// so the GPS-derived travel/geofence architecture (lib/sales-distribution/field-travel-service.ts)
// has real governed data to compute against instead of only its code-level fallback defaults.
// Idempotent: safe to re-run.

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
const target = authorizeDatabaseCommand({
  intendedRole: "test",
  write: true,
  targetUrl: test,
  productionUrl: production,
  testUrl: test,
});
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);

  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  const existingPolicy = await db.seeraTravelPolicy.findFirst({
    where: { vehicleType: "STANDARD_FIELD", territoryId: null },
    orderBy: { effectiveFrom: "desc" },
  });
  if (existingPolicy) {
    console.log(`Standard field travel policy already exists: ${existingPolicy.id} (₹${existingPolicy.ratePerKm}/km, ₹${existingPolicy.dailyAllowance}/day)`);
  } else {
    const policy = await db.seeraTravelPolicy.create({
      data: {
        vehicleType: "STANDARD_FIELD",
        ratePerKm: "2.00",
        dailyAllowance: "150.00",
        eligibility: { note: "Standard field working day — Founder decision, Sales Executive Founder-UAT remediation" },
        territoryId: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        approvedById: founder.id,
      },
    });
    console.log(`Created standard field travel policy: ${policy.id} (₹2/km, ₹150/day)`);
  }

  const existingHq = await db.seeraHqConfiguration.findFirst({ where: { name: "IV26-HQ-TEST" } });
  if (existingHq) {
    console.log(`Test HQ configuration already exists: ${existingHq.id}`);
  } else {
    // Arbitrary TEST coordinates (not a real address) purely so the geofence inside/outside logic
    // (evaluateHqGeofence) has something real to evaluate against in TEST verification.
    const hq = await db.seeraHqConfiguration.create({
      data: {
        name: "IV26-HQ-TEST",
        latitude: "28.6139000",
        longitude: "77.2090000",
        radiusMeters: 500,
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdById: founder.id,
      },
    });
    console.log(`Created test HQ configuration: ${hq.id}`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
