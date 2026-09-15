// P0 bug bash — P0-1 verification: confirms that a failed photo upload (Cloudinary not configured
// locally) left exactly ONE visit, ONE order, and did NOT create any duplicate/orphan rows. Read
// only, TEST DB only.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const production = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

async function main() {
  const visitId = process.argv[2];
  if (!visitId) throw new Error("Usage: smoke-p0-photo-state-check.ts <visitId>");
  const visit = await db.seeraVisit.findUnique({ where: { id: visitId }, include: { orders: true, photos: true } });
  console.log("Visit:", visit ? { id: visit.id, retailerId: visit.retailerId, checkedInAt: visit.checkedInAt, checkedOutAt: visit.checkedOutAt } : null);
  console.log("Orders on this visit:", visit?.orders.length ?? 0, visit?.orders.map((o) => ({ id: o.id, total: o.total, status: o.status })));
  console.log("Photos on this visit:", visit?.photos.length ?? 0);
  if (visit) {
    const allVisitsForRetailerToday = await db.seeraVisit.findMany({
      where: { retailerId: visit.retailerId, checkedInAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    console.log("Total visits for this retailer today (duplicate check):", allVisitsForRetailerToday.length);
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
