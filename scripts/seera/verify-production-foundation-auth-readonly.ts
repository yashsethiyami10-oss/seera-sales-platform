import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY production foundation + auth verification (PRODUCTION FOUNDATION VERIFICATION
// pass). Answers: is production DB reachable, is the Prisma migration state clean, is the
// foundation RBAC catalog seeded, does a real Founder/Super-Admin user exist with a usable login
// credential, and is the session table healthy. NO writes — every statement below is a SELECT.

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

const runtime = new URL(production);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

const maskEmail = (e: string | null | undefined) => {
  if (!e) return "(none)";
  const [local, domain] = e.split("@");
  if (!domain) return `${e.slice(0, 2)}***`;
  return `${local!.slice(0, 2)}***@${domain}`;
};

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} host=${target.host} database=${target.database} fingerprint=${target.fingerprint} write=false (READ-ONLY)`);

  // 1. Connectivity
  const ping = await db.$queryRawUnsafe<{ one: number }[]>("SELECT 1 as one");
  console.log(`\n1. DB connectivity: ${ping[0]?.one === 1 ? "OK (SELECT 1)" : "FAILED"}`);

  // 2. Migration state
  console.log("\n2. Prisma migration state (_prisma_migrations):");
  const applied = await db.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC`,
  );
  const appliedNames = new Set(applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
  const notFinished = applied.filter((m) => !m.finished_at || m.rolled_back_at);
  const localMigrations = readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const pending = localMigrations.filter((m) => !appliedNames.has(m));
  const extra = [...appliedNames].filter((m) => !localMigrations.includes(m));
  console.log(`   local migration folders: ${localMigrations.length}`);
  console.log(`   applied & finished in prod: ${appliedNames.size}`);
  console.log(`   NOT finished / rolled back: ${notFinished.length}${notFinished.length ? " -> " + notFinished.map((m) => m.migration_name).join(", ") : ""}`);
  console.log(`   pending (local, not yet in prod): ${pending.length}${pending.length ? " -> " + pending.join(", ") : ""}`);
  console.log(`   in prod but not in local tree: ${extra.length}${extra.length ? " -> " + extra.join(", ") : ""}`);
  console.log(`   latest applied: ${applied[applied.length - 1]?.migration_name ?? "(none)"}`);

  // 3. Foundation RBAC catalog
  console.log("\n3. Foundation RBAC catalog:");
  const [roleCount, permCount, flagCount, founderRole] = await Promise.all([
    db.role.count(),
    db.permission.count(),
    db.featureFlag.count(),
    db.role.findUnique({ where: { code: "FOUNDER_SUPER_ADMIN" }, include: { _count: { select: { permissions: true } } } }),
  ]);
  console.log(`   roles: ${roleCount}   permissions: ${permCount}   featureFlags: ${flagCount}`);
  console.log(`   FOUNDER_SUPER_ADMIN role: ${founderRole ? `present (isSystem=${founderRole.isSystem}, ${founderRole._count.permissions} permission grants)` : "MISSING"}`);
  const flags = await db.featureFlag.findMany({ select: { key: true, enabled: true }, orderBy: { key: "asc" } });
  console.log(`   feature flags: ${flags.map((f) => `${f.key}=${f.enabled}`).join(", ") || "(none)"}`);

  // 4. Founder / Super Admin USER
  console.log("\n4. Founder / Super-Admin user(s):");
  const founders = await db.user.findMany({
    where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "FOUNDER_SUPER_ADMIN" } } } },
    select: { id: true, email: true, name: true, status: true, passwordHash: true, phone: true, authorizationVersion: true, createdAt: true, lastLoginAt: true },
  });
  if (founders.length === 0) {
    console.log("   *** NO user holds an ACTIVE FOUNDER_SUPER_ADMIN assignment ***");
  }
  for (const f of founders) {
    console.log(
      `   - ${maskEmail(f.email)} | name="${f.name ?? ""}" | status=${f.status} | passwordHash=${f.passwordHash ? "SET (bcrypt)" : "NOT SET"} | phone=${f.phone ? "set" : "none"} | authVersion=${f.authorizationVersion} | created=${f.createdAt.toISOString().slice(0, 10)} | lastLogin=${f.lastLoginAt ? f.lastLoginAt.toISOString() : "never"}`,
    );
  }

  // Any ACTIVE super_admin-permission holder via any role (broader safety net).
  const superAdminGrant = await db.role.findMany({
    where: { permissions: { some: { permission: { code: "system:super_admin" } } } },
    select: { code: true, _count: { select: { assignments: { where: { status: "ACTIVE" } } } } },
  });
  console.log(`   roles granting system:super_admin: ${superAdminGrant.map((r) => `${r.code}(${r._count.assignments} active holders)`).join(", ")}`);

  // 5. Session infrastructure
  console.log("\n5. Session table health:");
  const now = new Date();
  const [totalSessions, liveSessions] = await Promise.all([
    db.session.count(),
    db.session.count({ where: { revokedAt: null, expires: { gt: now } } }),
  ]);
  console.log(`   sessions total=${totalSessions}   currently live (not revoked, not expired)=${liveSessions}`);

  // 6. User population snapshot (no PII beyond counts)
  const [totalUsers, activeUsers, withPw] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { passwordHash: { not: null } } }),
  ]);
  console.log(`\n6. Users: total=${totalUsers}  active=${activeUsers}  with password set=${withPw}`);

  console.log("\n=== VERDICT ===");
  const okDb = ping[0]?.one === 1;
  const okMigrations = notFinished.length === 0 && pending.length === 0 && extra.length === 0;
  const okCatalog = Boolean(founderRole) && roleCount > 0 && permCount > 0;
  const okFounder = founders.some((f) => f.status === "ACTIVE" && f.passwordHash);
  console.log(`   DB connectivity ......... ${okDb ? "PASS" : "FAIL"}`);
  console.log(`   migrations in sync ...... ${okMigrations ? "PASS" : "REVIEW (see section 2)"}`);
  console.log(`   RBAC catalog seeded .... ${okCatalog ? "PASS" : "FAIL"}`);
  console.log(`   Founder login-ready .... ${okFounder ? "PASS (ACTIVE user with bcrypt password)" : "FAIL — no login-ready Founder"}`);
}

main()
  .catch((e) => {
    console.error("VERIFICATION ERROR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
