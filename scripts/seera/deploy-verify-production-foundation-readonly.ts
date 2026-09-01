import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Confirms whether the Manufacturing role/permission/
// feature-flag seed has landed in production, and reports exactly which
// grants exist per role for audit purposes.

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

const MFG_ROLES = ["MANUFACTURING_MANAGER", "PRODUCTION_SUPERVISOR", "STORE_EXECUTIVE", "QC_USER", "PRODUCTION_OPERATOR"];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  const flag = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
  console.log(`portal.manufacturing.enabled: ${flag ? `EXISTS (enabled=${flag.enabled})` : "MISSING"}`);

  const roles = await prisma.role.findMany({ where: { code: { in: MFG_ROLES } }, include: { permissions: { include: { permission: true } } } });
  console.log(`\nManufacturing roles present: ${roles.length} / 5`);
  for (const code of MFG_ROLES) {
    const role = roles.find((r) => r.code === code);
    console.log(`  ${code}: ${role ? `present, ${role.permissions.length} permission grant(s)` : "MISSING"}`);
  }

  const permCount = await prisma.permission.count({ where: { code: { startsWith: "mfg_" } } });
  const portalMfgPerm = await prisma.permission.findUnique({ where: { code: "portal:manufacturing" } });
  console.log(`\nmfg_* permissions present: ${permCount} / 23`);
  console.log(`portal:manufacturing permission present: ${!!portalMfgPerm}`);
  console.log(`Total (mfg_* + portal:manufacturing): ${permCount + (portalMfgPerm ? 1 : 0)} / 24`);

  // Confirm no EXISTING role's grants were altered — spot-check Founder and one Sales role.
  const founder = await prisma.role.findUnique({ where: { code: "FOUNDER_SUPER_ADMIN" }, include: { permissions: true } });
  const salesManager = await prisma.role.findUnique({ where: { code: "SALES_MANAGER" }, include: { permissions: true } });
  console.log(`\nFounder permission count (sanity, should be full catalog): ${founder?.permissions.length}`);
  console.log(`Sales Manager permission count (sanity, unrelated to this migration): ${salesManager?.permissions.length}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
