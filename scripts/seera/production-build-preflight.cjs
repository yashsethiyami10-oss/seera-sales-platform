"use strict";

const { spawnSync } = require("node:child_process");

// ---------------------------------------------------------------------------------------------
// Netlify database-identity gate. Netlify stores DATABASE_URL as a secret that nobody can read
// back, so the only reliable place to prove WHICH database a deploy will use is the build itself.
// - Production builds must point at the confirmed Seera production Neon endpoint, or the build
//   fails and nothing is published.
// - Deploy previews / branch deploys must NOT point at production (previews use TEST).
// Only the Neon endpoint id (e.g. "ep-spring-butterfly-azr53vdl") is ever printed — never the
// password, user or full connection string. No database connection is made here.
// ---------------------------------------------------------------------------------------------
const SEERA_PRODUCTION_ENDPOINT = "ep-spring-butterfly-azr53vdl";
const SEERA_PRODUCTION_DATABASE = "neondb";

function endpointOf(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    const endpoint = url.hostname.split(".")[0].replace(/-pooler$/, "");
    return { endpoint, database: url.pathname.replace(/^\//, "") };
  } catch {
    return null;
  }
}

function netlifyDatabaseGate(env) {
  if (env.NETLIFY !== "true") return { ok: true, skipped: true };
  const context = env.CONTEXT || "unknown";
  const identity = endpointOf(env.DATABASE_URL);
  if (!identity) return { ok: false, message: `[SEERA PREFLIGHT] ${context}: DATABASE_URL is missing or not a PostgreSQL URL` };
  const isProduction = identity.endpoint === SEERA_PRODUCTION_ENDPOINT && identity.database === SEERA_PRODUCTION_DATABASE;
  if (context === "production") {
    return isProduction
      ? { ok: true, message: `[SEERA PREFLIGHT] production database verified: ${identity.endpoint}/${identity.database}` }
      : { ok: false, message: `[SEERA PREFLIGHT] production build refused: DATABASE_URL endpoint ${identity.endpoint}/${identity.database} is not the Seera production database` };
  }
  return isProduction
    ? { ok: false, message: `[SEERA PREFLIGHT] ${context} build refused: previews must not use the production database (${identity.endpoint})` }
    : { ok: true, message: `[SEERA PREFLIGHT] ${context} database: ${identity.endpoint}/${identity.database} (not production)` };
}

// ---------------------------------------------------------------------------------------------
// Additive schema step for Netlify builds. Netlify keeps DATABASE_URL secret and never runs
// `prisma migrate deploy` (only Vercel production does, below), so new tables shipped with a
// release never reached the database. This applies ONLY the migration files listed here, and only
// after the identity gate above has passed. Every listed file must consist solely of
// `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` statements (enforced by
// additiveStatementsOnly + the netlify-database-preflight test), so running it on every build is a
// no-op once the tables exist and can never alter or drop existing data. `prisma db execute` runs
// the SQL as-is (no advisory lock, works through the Neon pooler) and records nothing in
// _prisma_migrations, so a later full `migrate deploy` still applies and records these files —
// they are idempotent. A failure is logged loudly but does not block the deploy: the features
// that need these tables already return a clear "not set up yet" message instead of crashing.
// ---------------------------------------------------------------------------------------------
const ADDITIVE_MIGRATIONS = [
  "20261110090000_seera_company_library",
  "20261110090000_seera_partner_kyc_documents",
];

function additiveStatementsOnly(sql) {
  const statements = String(sql)
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return statements.length > 0 && statements.every((x) => /^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS /i.test(x));
}

function applyAdditiveMigrations(env) {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..", "..");
  for (const name of ADDITIVE_MIGRATIONS) {
    const file = path.join(root, "prisma", "migrations", name, "migration.sql");
    if (!additiveStatementsOnly(fs.readFileSync(file, "utf8"))) {
      console.error(`[SEERA PREFLIGHT] skipped ${name}: not purely additive (IF NOT EXISTS) SQL`);
      continue;
    }
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["prisma", "db", "execute", "--file", file, "--schema", path.join(root, "prisma", "schema.prisma")],
      { stdio: "inherit", env },
    );
    if (result.status === 0) console.log(`[SEERA PREFLIGHT] additive schema applied (idempotent): ${name}`);
    else console.error(`[SEERA PREFLIGHT] WARNING additive schema step failed for ${name} (exit ${result.status}); deploy continues`);
  }
}

module.exports = { netlifyDatabaseGate, endpointOf, SEERA_PRODUCTION_ENDPOINT, ADDITIVE_MIGRATIONS, additiveStatementsOnly };

if (require.main === module) {
  const gate = netlifyDatabaseGate(process.env);
  if (gate.message) (gate.ok ? console.log : console.error)(gate.message);
  if (!gate.ok) process.exit(1);
  if (process.env.NETLIFY === "true") applyAdditiveMigrations(process.env);

  const isVercelProduction =
    process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

  if (!isVercelProduction) {
    process.exit(0);
  }

  // Production deploys must apply the repository's immutable Prisma migration history
  // before Prisma Client is generated and Next.js is built. This is intentionally
  // unavailable to local/preview builds.
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    { stdio: "inherit" },
  );

  process.exit(result.status ?? 1);
}
