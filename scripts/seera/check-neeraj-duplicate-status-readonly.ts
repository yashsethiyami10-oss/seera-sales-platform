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
  const active = await db.user.findUnique({ where: { id: "cmswmy5je00079oa9nffc08wp" } });
  const dup = await db.user.findUnique({ where: { id: "cmsty3nvu000h814x14hbi540" } });
  console.log(`ACTIVE Neeraj: status=${active?.status} email=${active?.email}`);
  console.log(`DUPLICATE Neeraj: status=${dup?.status} email=${dup?.email}`);
  const roles = await db.userRoleAssignment.findMany({ where: { userId: "cmswmy5je00079oa9nffc08wp", status: "ACTIVE" }, include: { role: true } });
  console.log(`ACTIVE Neeraj roles: ${roles.map(r=>r.role.code).join(",")}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
