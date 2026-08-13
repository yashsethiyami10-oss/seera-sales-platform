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
const testEnv = readEnv(path.join(root, ".env.test"));
const testUrl = testEnv.TEST_DATABASE_URL;
// Neon's pooled endpoint (TEST_DATABASE_URL) does not support the session-level
// advisory locks Prisma's migration engine takes out for `migrate`/`db push` —
// it closes the connection immediately (P1017). Neon's direct/unpooled endpoint
// (TEST_DIRECT_DATABASE_URL) does support them and is what schema-mutating
// commands must run against; the pooled endpoint remains correct for every
// other guarded command (generate, studio, seed, db pull) which only issue
// ordinary queries. Fingerprint authorization below is still checked against
// the pooled TEST url either way, so this never widens what host/database is
// considered a valid TEST target.
const isSchemaMutatingCommand = ["migrate", "db"].includes(args[0]);
const directUrl = testEnv.TEST_DIRECT_DATABASE_URL;
if (isSchemaMutatingCommand && !directUrl) throw new Error("TEST_DIRECT_DATABASE_URL is required in .env.test for migrate/db commands");
const effectiveTestUrl = isSchemaMutatingCommand ? directUrl! : testUrl;
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
  env: { ...process.env, DATABASE_URL: effectiveTestUrl, TEST_DATABASE_URL: testUrl },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
