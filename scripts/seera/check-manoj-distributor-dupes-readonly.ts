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
  const mobiles = ["8058695861","7220949404","9549429700","7357984199","8955091257","9983320194","8209511537"];
  const partners = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR" } });
  for (const m of mobiles) {
    const match = partners.filter((p) => {
      const c = p.primaryContact as { mobile?: string } | null;
      return c?.mobile?.replace(/\D/g,"") === m;
    });
    console.log(`mobile ${m}: ${match.length} match(es)`, match.map(x=>`${x.legalName} (${x.code}, lifecycle=${x.lifecycle})`));
  }
  const names = ["padmavati","sumit kirana","amit","kgn","asha enterprises","vijay manawat","masuda"];
  for (const n of names) {
    const match = partners.filter((p) => p.legalName.toLowerCase().includes(n) || (p.tradeName??"").toLowerCase().includes(n));
    if (match.length) console.log(`name~"${n}":`, match.map(x=>`${x.legalName} (${x.code})`));
  }
  // Find Neeraj's & Manoj's user + territory assignment for context
  const manoj = await db.user.findFirst({ where: { email: "manojvijay@seera.local" } });
  console.log("Manoj user:", manoj?.id, manoj?.name);
  if (manoj) {
    const assignments = await db.seeraTerritoryAssignment.findMany({ where: { userId: manoj.id, status: "ACTIVE" } });
    console.log("Manoj territory assignments:", JSON.stringify(assignments));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
