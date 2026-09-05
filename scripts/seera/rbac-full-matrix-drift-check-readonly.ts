import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { PHASE_1_ROLES, ROLE_PERMISSION_MATRIX } from "../../lib/foundation/rbac-catalog";

// Final Integration mission, Part J — STRICTLY READ-ONLY. The declarative catalog
// (lib/foundation/rbac-catalog.ts, ROLE_PERMISSION_MATRIX) is source-controlled and reviewed in
// every PR, but authorize() (lib/foundation/authorization-service.ts) never reads that constant at
// runtime — it reads the actual Role/RolePermission rows in the database, which are only ever
// populated by a seed/sync step run against that constant. If a role's permission set was ever
// edited in this file without the matching sync being re-run in production (or vice versa — a
// manual DB grant that was never reflected back into the file), the two silently drift apart and
// every existing RBAC test (which all authorize *against the live DB*, correctly) would keep
// passing while quietly testing the wrong intended policy. This is the one check nothing else in
// this session covers: a full, unabridged diff of EVERY role's ENTIRE permission set (not just the
// handful of permissions a specific prior migration touched, unlike
// verify-post-rbac-sync-production-readonly.ts's targeted spot-checks) against the catalog.
// Read-only: only Prisma `findMany`/`findUnique` reads below, no writes anywhere in this file.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const prisma = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)\n`);
  console.log("Full RBAC matrix drift check — every role's DB-held permission set vs. rbac-catalog.ts\n");

  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
  const dbRoleCodes = new Set(roles.map((r) => r.code));
  const catalogRoleCodes = new Set(PHASE_1_ROLES.map(([code]) => code));

  let anyDrift = false;

  console.log("=== Roles present in one place but not the other ===");
  const missingInDb = [...catalogRoleCodes].filter((c) => !dbRoleCodes.has(c));
  const extraInDb = [...dbRoleCodes].filter((c) => !catalogRoleCodes.has(c));
  if (missingInDb.length) { anyDrift = true; console.log(`  MISSING FROM DB (catalog declares, DB has no such Role row): ${missingInDb.join(", ")}`); }
  if (extraInDb.length) { anyDrift = true; console.log(`  EXTRA IN DB (not in catalog — orphaned or manually added): ${extraInDb.join(", ")}`); }
  if (!missingInDb.length && !extraInDb.length) console.log("  none — role sets match exactly");

  console.log("\n=== Per-role permission diff ===");
  for (const [code] of PHASE_1_ROLES) {
    const dbRole = roles.find((r) => r.code === code);
    if (!dbRole) continue; // already reported above
    const dbPerms = new Set(dbRole.permissions.map((p) => p.permission.code));
    const catalogPerms = new Set(ROLE_PERMISSION_MATRIX[code]);
    const missing = [...catalogPerms].filter((p) => !dbPerms.has(p)); // catalog says role should have it, DB doesn't grant it -> under-privileged, a real functional bug
    const extra = [...dbPerms].filter((p) => !catalogPerms.has(p)); // DB grants it, catalog doesn't declare it -> over-privileged, a real security drift
    if (missing.length || extra.length) {
      anyDrift = true;
      console.log(`  [${code}] DRIFT`);
      if (missing.length) console.log(`      missing (catalog expects, DB lacks): ${missing.join(", ")}`);
      if (extra.length) console.log(`      extra (DB grants, catalog doesn't declare): ${extra.join(", ")}`);
    } else {
      console.log(`  [${code}] in sync (${dbPerms.size} permissions)`);
    }
  }

  console.log("\n=== Permission catalog completeness ===");
  const dbPermissions = await prisma.permission.count();
  const { PHASE_1_PERMISSIONS } = await import("../../lib/foundation/rbac-catalog");
  console.log(`  DB permission rows: ${dbPermissions}, catalog declares: ${PHASE_1_PERMISSIONS.length}`);
  if (dbPermissions !== PHASE_1_PERMISSIONS.length) { anyDrift = true; console.log("  MISMATCH — a permission was added/removed in one place but not the other"); }

  console.log(`\n\nOVERALL: ${anyDrift ? "DRIFT DETECTED — see above" : "NO DRIFT — production DB RBAC exactly matches rbac-catalog.ts for every declared role"}`);
  if (anyDrift) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
