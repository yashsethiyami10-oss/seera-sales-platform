import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });
async function main() {
  console.log(`[GUARD] role=${target.role}`);
  const neeraj = await db.user.findFirst({ where: { email: "neerajrawatseera@gmail.com" } });
  if (!neeraj) throw new Error("Neeraj not found");
  const plans = await db.seeraJourneyPlan.findMany({ where: { employeeId: neeraj.id, status: "PUBLISHED" }, orderBy: { effectiveFrom: "asc" } });
  console.log(`Found ${plans.length} PUBLISHED plans for Neeraj`);
  for (const plan of plans) {
    const [geography, beat, territory] = await Promise.all([
      db.seeraGeographyNode.findUnique({ where: { id: plan.geographyId } }),
      plan.beatId ? db.seeraGeographyNode.findUnique({ where: { id: plan.beatId } }) : null,
      plan.territoryId ? db.seeraGeographyNode.findUnique({ where: { id: plan.territoryId } }) : null,
    ]);
    const retailerCount = await db.seeraRetailer.count({
      where: {
        salespersonId: plan.employeeId,
        lifecycle: "ACTIVE",
        OR: [
          ...(plan.beatId ? [{ beatId: plan.beatId }] : []),
          { marketId: plan.geographyId },
          ...(plan.territoryId ? [{ territoryId: plan.territoryId }] : []),
        ],
      },
    });
    const classification = retailerCount > 0 ? "RESOLVABLE" : plan.beatId || plan.territoryId ? "EMPTY_BY_DATA" : "AMBIGUOUS_NO_BEAT_OR_TERRITORY";
    console.log(JSON.stringify({
      planId: plan.id,
      date: plan.effectiveFrom.toISOString().slice(0, 10),
      dayOfWeek: plan.dayOfWeek,
      status: plan.status,
      geography: geography?.name ?? null,
      geographyLevel: geography?.level ?? null,
      beat: beat?.name ?? null,
      territory: territory?.name ?? null,
      distributor: plan.distributorNameSnapshot,
      retailerResolutionSource: "beatId/territoryId (corrected)",
      resolvedRetailerCount: retailerCount,
      classification,
    }, null, 2));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
