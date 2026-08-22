import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard.ts";

function envFile(file: string) { const values: Record<string, string> = {}; for (const line of readFileSync(file, "utf8").split(/\r?\n/)) { const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line); if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); } return values; }
const worktreeRoot = path.resolve(import.meta.dirname, "..", "..");
const root = existsSync(path.join(worktreeRoot, ".env")) ? worktreeRoot : path.resolve(worktreeRoot, "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const testUrl = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl });
const db = new PrismaClient({ datasourceUrl: production });
async function main() {
  const people = await db.user.findMany({ where: { OR: [{ name: { contains: "Neeraj", mode: "insensitive" } }, { name: { contains: "Manoj", mode: "insensitive" } }] }, select: { id: true, name: true, email: true, status: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { name: true } } } } } });
  const geographies = await db.seeraGeographyNode.findMany({ where: { OR: [{ name: { equals: "Jhansi", mode: "insensitive" } }, { name: { equals: "Bhilwara", mode: "insensitive" } }] }, select: { id: true, code: true, name: true, level: true, parentId: true, status: true } });
  console.log(JSON.stringify({ people: people.map((person) => ({ ...person, email: person.email.replace(/(^.).*(@.*$)/, "$1***$2"), roles: person.roleAssignments.map((assignment) => assignment.role.name), roleAssignments: undefined })), geographies }, null, 2));
}
main().finally(() => db.$disconnect());
