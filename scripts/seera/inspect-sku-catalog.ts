import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });
async function main() {
  console.log("fingerprint", target.fingerprint);
  const skus = await db.seeraSku.findMany({ orderBy: [{ brand: "asc" }, { productName: "asc" }] });
  console.log("TOTAL SKUS:", skus.length);
  for (const s of skus) console.log(s.status, "|", s.brand, "|", s.category, "|", s.code, "|", s.productName, "| mrp=", s.mrp.toString());
}
main().finally(() => db.$disconnect());
