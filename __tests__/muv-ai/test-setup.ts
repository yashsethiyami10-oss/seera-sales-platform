import { vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Isolated test database. Finance's immutability triggers block UPDATE
// *and* DELETE for every client, so fiscal years/journals/ledger entries
// an integration test posts can never be reclaimed — running the suite
// against the application's own database meant this accumulated forever,
// until the shared pool (years 2100-9999) was exhausted (confirmed at
// year 9997 during the Phase 2 Governance Verification pass). See
// docs/enterprise-phase2/FISCAL_YEAR_TEST_POOL_REMEDIATION.md for that
// history — TEST_DATABASE_URL below is its successor: an explicitly
// configured, independently verified separate database/branch, rather
// than one derived by guessing at DATABASE_URL's naming convention (the
// previous /muv -> /muv_test substitution broke outright the first time
// the application database's name or host changed — e.g. after a move to
// a differently-named Neon database — because the assumption was never
// verified, just assumed).
//
// Resolution order for TEST_DATABASE_URL: an ambient process.env value
// (so a terminal override, or a future CI secret, always wins) takes
// precedence over .env.local's value. Never falls back to DATABASE_URL,
// and never derives one from it — a missing/invalid/colliding value is a
// hard failure, not a guess.
//
// DATABASE_URL itself is still read directly from .env (not Prisma's own
// auto-dotenv-on-import, which only fires once @prisma/client is first
// imported — after this setup file already ran) so the comparison below
// is guaranteed to run before any test file's own `@/lib/prisma` import
// resolves.
function readEnvVar(filePath: string, name: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}

function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const fromEnvLocal = readEnvVar(path.resolve(process.cwd(), ".env.local"), "TEST_DATABASE_URL");
  if (fromEnvLocal) return fromEnvLocal;

  throw new Error(
    "test-setup.ts: TEST_DATABASE_URL is not set (checked process.env, then .env.local). " +
      "Tests refuse to run without an explicitly configured, isolated test database. See .env.example."
  );
}

function readApplicationDatabaseUrl(): string {
  const value = readEnvVar(path.resolve(process.cwd(), ".env"), "DATABASE_URL");
  if (!value) {
    throw new Error("test-setup.ts: could not find DATABASE_URL in .env");
  }
  return value;
}

/** Never logs `url` — callers only see which label failed to parse. */
function parseDatabaseTarget(url: string, label: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`test-setup.ts: ${label} is not a valid URL — refusing to run.`);
  }
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const applicationDatabaseUrl = readApplicationDatabaseUrl();

if (testDatabaseUrl === applicationDatabaseUrl) {
  throw new Error(
    "test-setup.ts: TEST_DATABASE_URL is identical to DATABASE_URL — refusing to run tests against the application database."
  );
}

const testTarget = parseDatabaseTarget(testDatabaseUrl, "TEST_DATABASE_URL");
const applicationTarget = parseDatabaseTarget(applicationDatabaseUrl, "DATABASE_URL");

if (testTarget.hostname === applicationTarget.hostname) {
  throw new Error(
    "test-setup.ts: TEST_DATABASE_URL resolves to the same database endpoint as DATABASE_URL — refusing: this looks like the application/production database."
  );
}

process.env.DATABASE_URL = testDatabaseUrl;

/**
 * Global Vitest setup (referenced by vitest.config.ts's `setupFiles`) —
 * this is the reliable place to register a mock that must apply before
 * every test file's own imports resolve, rather than relying on import
 * -order side effects inside a regular helper module.
 *
 * `next/headers`'s `headers()` only works inside a real Next.js request;
 * every Server Action under test needs a stand-in. `__currentTestIp` is
 * mutated per-test via `setTestIp()` (test-helpers.ts) so rate-limit state
 * (an in-memory Map shared across the whole process — lib/rate-limit.ts)
 * never leaks between unrelated test cases.
 */
export const testIpState = { current: "203.0.113.1" };

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", testIpState.current]]),
}));

/**
 * `next-auth` (v5 beta) resolves `next/server` in a way that only works
 * inside Next's own build pipeline — under plain Vitest/Node, importing
 * the real `@/lib/auth` (and therefore the real `next-auth` package)
 * throws `Cannot find module 'next/server'` before any test code even
 * runs, for every file that transitively imports it (directly, or via
 * `lib/rbac.ts` / `actions/experience.ts`). Mocked globally here to a
 * default anonymous session so every other test file loads cleanly;
 * `diagnostics.test.ts` registers its own `vi.mock("@/lib/auth", ...)`
 * locally to control the role per test case, which Vitest resolves in
 * that file's favor over this default.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
