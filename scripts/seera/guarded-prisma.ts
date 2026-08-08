import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

function readEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const separator = process.argv.indexOf("--");
const args = separator >= 0 ? process.argv.slice(separator + 1) : [];
if (!args.length) throw new Error("A Prisma command is required after --");

const root = path.resolve(import.meta.dirname, "..", "..");
const productionUrl = readEnv(path.join(root, ".env")).DATABASE_URL;
const testUrl = readEnv(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({
  intendedRole: "test",
  write: true,
  targetUrl: testUrl,
  productionUrl,
  testUrl,
});

console.log(`[SEERA DB GUARD] role=${target.role} host=${target.host} database=${target.database} fingerprint=${target.fingerprint}`);
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
