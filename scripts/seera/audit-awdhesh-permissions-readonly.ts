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
  const awdhesh = await db.user.findFirst({
    where: { name: { contains: "awdhesh", mode: "insensitive" } },
    include: { roleAssignments: { where: { status: "ACTIVE" }, include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!awdhesh) { console.log("Awdhesh not found"); return; }
  console.log(`User: ${awdhesh.name} (${awdhesh.id}) status=${awdhesh.status}`);
  for (const ra of awdhesh.roleAssignments) {
    console.log(`\nRole: ${ra.role.code} (${ra.role.status}) — ${ra.role.permissions.length} permission grants`);
    const codes = ra.role.permissions.map((p) => p.permission.code).sort();
    console.log(codes.join(", "));
    console.log(`\nHas network:manage: ${codes.includes("network:manage")}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
