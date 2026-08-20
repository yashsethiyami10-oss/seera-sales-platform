import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Checks whether a real Manoj Vijayvargiya user account already exists in
// production before any territory-assignment work — no fabricated user identity.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const prisma = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  const byName = await prisma.user.findMany({
    where: { OR: [{ name: { contains: "Manoj", mode: "insensitive" } }, { name: { contains: "Vijayvargiya", mode: "insensitive" } }] },
    select: { id: true, name: true, email: true, status: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { code: true, name: true } } } } },
  });
  console.log(`Users matching "Manoj"/"Vijayvargiya": ${byName.length}`);
  for (const u of byName) console.log(`  ${u.id} | ${u.name} | ${u.email} | status=${u.status} | roles=${u.roleAssignments.map((r) => r.role.code).join(",")}`);

  const bhilwaraGeo = await prisma.seeraGeographyNode.findMany({ where: { name: { contains: "Bhilwara", mode: "insensitive" } } });
  console.log(`\nExisting geography nodes matching "Bhilwara": ${bhilwaraGeo.length}`);
  for (const g of bhilwaraGeo) console.log(`  ${g.id} | ${g.name} | level=${g.level} | status=${g.status} | parentId=${g.parentId ?? "-"}`);

  const territoryCount = await prisma.seeraGeographyNode.count({ where: { level: "TERRITORY" } });
  const beatCount = await prisma.seeraGeographyNode.count({ where: { level: "BEAT" } });
  console.log(`\nTotal TERRITORY nodes in production: ${territoryCount}`);
  console.log(`Total BEAT nodes in production: ${beatCount}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
