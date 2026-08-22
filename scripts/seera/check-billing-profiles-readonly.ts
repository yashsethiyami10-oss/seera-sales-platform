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
  const profiles = await db.seeraBillingProfile.findMany({ where: { ownerType: "PARTNER" } });
  console.log(`Total SeeraBillingProfile (ownerType=PARTNER) rows in production: ${profiles.length}`);
  for (const p of profiles) console.log(`  ownerId=${p.ownerId} legalName=${p.legalName} verificationStatus=${p.verificationStatus}`);
  const distPartners = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true } });
  console.log(`\nActive Distributor partners: ${distPartners.length}`);
  for (const d of distPartners) {
    const p = profiles.find(x => x.ownerId === d.id);
    console.log(`  ${d.legalName}: ${p ? `profile exists, status=${p.verificationStatus}` : "NO PROFILE"}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
