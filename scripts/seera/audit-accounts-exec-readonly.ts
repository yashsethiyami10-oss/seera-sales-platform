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
  const role = await db.role.findUniqueOrThrow({ where: { code: "ACCOUNTS_EXECUTIVE" } });
  const assignments = await db.userRoleAssignment.findMany({ where: { roleId: role.id, status: "ACTIVE" }, include: { user: true } });
  for (const a of assignments) {
    const u = a.user;
    console.log(`userId=${u.id} name=${u.name} phone=${u.phone ?? "NULL"} email=${u.normalizedEmail} status=${u.status} hasPasswordHash=${Boolean(u.passwordHash)}`);
    const otherRoles = await db.userRoleAssignment.findMany({ where: { userId: u.id, status: "ACTIVE" }, include: { role: true } });
    console.log(`  all active roles: ${otherRoles.map((r) => r.role.code).join(", ")}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
