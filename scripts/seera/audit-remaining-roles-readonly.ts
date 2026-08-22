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
  for (const code of ["ACCOUNTS_EXECUTIVE", "SALES_HEAD", "RETAILER_USER", "DISTRIBUTOR_DELIVERY_USER"]) {
    const role = await db.role.findUnique({ where: { code } });
    if (!role) { console.log(`${code}: NOT IN CATALOG`); continue; }
    const count = await db.userRoleAssignment.count({ where: { roleId: role.id, status: "ACTIVE" } });
    console.log(`${code}: ${count} active`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
