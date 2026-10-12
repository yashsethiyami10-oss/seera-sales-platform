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

module.exports = { netlifyDatabaseGate, endpointOf, SEERA_PRODUCTION_ENDPOINT };

if (require.main === module) {
  const gate = netlifyDatabaseGate(process.env);
  if (gate.message) (gate.ok ? console.log : console.error)(gate.message);
  if (!gate.ok) process.exit(1);

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
