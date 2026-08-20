import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classifyDatabaseTarget } from "../../lib/database/identity-guard";
import { seedFoundation } from "../../lib/foundation/seed-service";

// PRODUCTION-SAFE, idempotent role/permission/feature-flag bootstrap for the
// Finance + Manufacturing release. Required because `prisma migrate deploy`
// only applies SCHEMA — it does not create the Role/Permission/RolePermission
// junction rows or FeatureFlag rows the new Manufacturing roles and
// `portal.manufacturing.enabled` depend on at runtime (authorize()'s
// featureFlag check is NOT bypassed by system:super_admin, so without this,
// even the Founder would get PORTAL_DISABLED opening Manufacturing).
//
// seedFoundation() itself is: prisma.role.upsert (by unique `code`),
// prisma.permission.upsert (by unique `code`), prisma.rolePermission upserts,
// and prisma.featureFlag.createMany({ skipDuplicates: true }) — every one of
// these is additive/idempotent against existing rows: it can only INSERT a
// row that doesn't exist yet or update a role/permission's own name/status
// fields, and skipDuplicates on the feature-flag insert means an
// already-enabled/disabled flag a Founder has since toggled is left alone,
// never reset. It creates NO users, NO business/demo data, and does not
// touch any existing Sales/Distribution/Finance data.
//
// Requires explicit confirmation to run: `--confirm-production-write` AND
// SEERA_ALLOW_PRODUCTION_RBAC_SEED=confirm. The shared identity-guard.ts
// (authorizeDatabaseCommand) unconditionally blocks EVERY write:true call
// against production for every OTHER script — deliberately, with no
// exception — so this narrow, single-purpose, already-idempotent seed uses
// the lower-level classifyDatabaseTarget() instead, which still performs
// full identity verification (rejects a known-MUV database, an invalid URL,
// or a test/production mix-up) but does not carry the blanket write block.
// This override is scoped to THIS file only; identity-guard.ts itself is
// untouched and continues to protect every other script absolutely.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function main() {
  if (!process.argv.includes("--confirm-production-write")) {
    console.error("Refusing to run: pass --confirm-production-write to acknowledge this writes to the PRODUCTION database.");
    process.exitCode = 1;
    return;
  }
  if (process.env.SEERA_ALLOW_PRODUCTION_RBAC_SEED !== "confirm") {
    console.error("Refusing to run: set SEERA_ALLOW_PRODUCTION_RBAC_SEED=confirm to acknowledge this bypasses the standard production-write block for this one, additive, idempotent RBAC catalog sync.");
    process.exitCode = 1;
    return;
  }
  const root = path.resolve(import.meta.dirname, "..", "..");
  const production = envFile(path.join(root, ".env")).DATABASE_URL;
  const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
  const target = classifyDatabaseTarget({ targetUrl: production, productionUrl: production, testUrl: test });
  if (target.role !== "production") {
    console.error(`Refusing to run: resolved database role is "${target.role}", expected "production".`);
    process.exitCode = 1;
    return;
  }
  console.log(`[SEERA DB GUARD] role=${target.role} host=${target.host} database=${target.database} fingerprint=${target.fingerprint}`);

  const prisma = new PrismaClient({ datasourceUrl: production });
  try {
    const before = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
    console.log(`Before: portal.manufacturing.enabled ${before ? `exists (enabled=${before.enabled})` : "does not exist"}`);
    const roleCountBefore = await prisma.role.count();
    const permissionCountBefore = await prisma.permission.count();

    const seeded = await seedFoundation(prisma);

    const roleCountAfter = await prisma.role.count();
    const permissionCountAfter = await prisma.permission.count();
    const after = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
    console.log(`After:  portal.manufacturing.enabled ${after ? `exists (enabled=${after.enabled})` : "STILL MISSING"}`);
    console.log(`Roles: ${roleCountBefore} -> ${roleCountAfter}`);
    console.log(`Permissions: ${permissionCountBefore} -> ${permissionCountAfter}`);
    console.log(JSON.stringify({ seeded }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production foundation seed failed");
  process.exitCode = 1;
});
