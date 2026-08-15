import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Confirms whether the Manufacturing role/permission/
// feature-flag seed has landed in production yet.

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
  const flag = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
  console.log(`portal.manufacturing.enabled: ${flag ? `EXISTS (enabled=${flag.enabled})` : "MISSING"}`);
  const roles = await prisma.role.findMany({ where: { code: { in: ["MANUFACTURING_MANAGER", "PRODUCTION_SUPERVISOR", "STORE_EXECUTIVE", "QC_USER", "PRODUCTION_OPERATOR"] } } });
  console.log(`Manufacturing roles present: ${roles.length} / 5 ${roles.length ? `(${roles.map((r) => r.code).join(", ")})` : ""}`);
  const permCount = await prisma.permission.count({ where: { code: { startsWith: "mfg_" } } });
  console.log(`mfg_* permissions present: ${permCount}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
