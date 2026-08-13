import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, idempotent fixtures for RUN 2B Sections 17/23-24 (multi-candidate / no-candidate
// Executive routing live proof). scripts/seera/seed-integrated-review.ts's 4 existing retailers all
// have a distributorId pre-assigned, so none of them can ever exercise the territory-auto-route
// logic in placeRetailerOrder (workflow-service.ts) — that logic only runs for a retailer with no
// distributor assigned yet. This script adds two more retailers, both unassigned, without touching
// or renumbering the existing 4:
//   - IV26-R-05: territoryNorth, which already has TWO active Distributors (distributor1,
//     distributor2 — both seeded by seed-integrated-review.ts) → placing an order here should
//     resolve routingOutcome=MULTIPLE_DISTRIBUTOR_CANDIDATES, never a random pick.
//   - IV26-R-06: a brand-new "Integrated East Territory" with zero Distributors mapped to it →
//     should resolve routingOutcome=NO_DISTRIBUTOR_MAPPING.
// Both are assigned to review-sales-executive-1 (the same executive already used by retailers 1-2),
// so review-sales-executive-1's real TEST login can place a real order against each via the
// existing field/operations "place-order" action (no visit/check-in prerequisite for that action).

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
const prefix = "IV26";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const territoryNorth = await db.seeraGeographyNode.findUniqueOrThrow({ where: { code: `${prefix}-T-NORTH` } });
  const beatNorth = await db.seeraGeographyNode.findFirst({ where: { level: "BEAT" }, orderBy: { createdAt: "asc" } });

  const territoryEast = await db.seeraGeographyNode.upsert({
    where: { code: `${prefix}-T-EAST` },
    update: {},
    create: { code: `${prefix}-T-EAST`, name: "Integrated East Territory", level: "TERRITORY" },
  });

  const multiCandidateRetailer = await db.seeraRetailer.upsert({
    where: { code: `${prefix}-R-05` },
    update: { lifecycle: "ACTIVE", distributorId: null, salespersonId: executive1.id, territoryId: territoryNorth.id },
    create: {
      code: `${prefix}-R-05`,
      businessName: "Integrated Multi-Candidate Retail",
      ownerName: "Review Retailer 5",
      mobile: "9100000005",
      normalizedMobile: "9100000005",
      address: { city: "Mumbai", market: "Integrated Market" },
      shopType: "GENERAL_TRADE",
      territoryId: territoryNorth.id,
      beatId: beatNorth?.id,
      distributorId: null,
      salespersonId: executive1.id,
      lifecycle: "ACTIVE",
      createdById: founder.id,
    },
  });

  const noCandidateRetailer = await db.seeraRetailer.upsert({
    where: { code: `${prefix}-R-06` },
    update: { lifecycle: "ACTIVE", distributorId: null, salespersonId: executive1.id, territoryId: territoryEast.id },
    create: {
      code: `${prefix}-R-06`,
      businessName: "Integrated No-Distributor Retail",
      ownerName: "Review Retailer 6",
      mobile: "9100000006",
      normalizedMobile: "9100000006",
      address: { city: "Kolkata", market: "Integrated East Market" },
      shopType: "GENERAL_TRADE",
      territoryId: territoryEast.id,
      distributorId: null,
      salespersonId: executive1.id,
      lifecycle: "ACTIVE",
      createdById: founder.id,
    },
  });

  console.log(
    JSON.stringify(
      {
        fingerprint: target.fingerprint,
        multiCandidateRetailer: { id: multiCandidateRetailer.id, code: multiCandidateRetailer.code, territory: "IV26-T-NORTH (2 active Distributors)" },
        noCandidateRetailer: { id: noCandidateRetailer.id, code: noCandidateRetailer.code, territory: "IV26-T-EAST (0 Distributors)" },
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
