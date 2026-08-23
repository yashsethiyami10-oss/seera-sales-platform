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
  console.log(`[GUARD] role=${target.role} (READ-ONLY)`);
  const partners = await db.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] } }, select: { id: true, legalName: true, tradeName: true, type: true, territoryIds: true, lifecycle: true, createdAt: true } });
  const partyUsers = await db.seeraPartyUser.findMany({ where: { partnerId: { in: partners.map((p) => p.id) }, active: true }, select: { partnerId: true, userId: true, accessRole: true } });
  const users = await db.user.findMany({ where: { id: { in: partyUsers.map((pu) => pu.userId) } }, select: { id: true, name: true, email: true, normalizedEmail: true } });
  const userById = new Map(users.map((u) => [u.id, u]));
  console.log("\n=== PARTNER -> LOGGED-IN OWNER LINKAGE ===");
  for (const p of partners) {
    const links = partyUsers.filter((pu) => pu.partnerId === p.id).map((pu) => ({ ...userById.get(pu.userId), accessRole: pu.accessRole }));
    console.log(JSON.stringify({ id: p.id, legalName: p.legalName, tradeName: p.tradeName, type: p.type, territoryIds: p.territoryIds, lifecycle: p.lifecycle, createdAt: p.createdAt.toISOString(), linkedUsers: links }));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
