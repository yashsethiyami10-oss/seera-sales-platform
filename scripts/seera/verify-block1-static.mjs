import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const guard = await import(pathToFileURL(path.join(root, "lib/database/identity-guard.ts")));
const results = [];

function check(name, run) {
  run();
  results.push({ name, status: "PASS" });
}

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
}

function envValue(file, key) {
  const line = read(file)
    .split(/\r?\n/)
    .filter((candidate) => new RegExp(`^\\s*${key}\\s*=`).test(candidate))
    .at(-1);
  return line?.split("=", 2)[1]?.trim().replace(/^['"]|['"]$/g, "");
}

function expectCode(run, expected) {
  assert.throws(run, (error) => error?.code === expected);
}

check("package identity and blocked hooks", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "seera-sales-distribution-os");
  assert.match(pkg.scripts.postinstall, /pre-phase-1-postinstall/);
  for (const key of ["db:migrate", "db:push", "db:deploy", "db:studio", "db:seed"]) {
    assert.match(pkg.scripts[key], /blocked-database-command/);
  }
});

check("real production/test environment isolation", () => {
  assert.equal(existsSync(path.join(root, ".env")), true);
  assert.equal(existsSync(path.join(root, ".env.test")), true);
  const identities = guard.validateDatabaseIsolation({
    productionUrl: envValue(".env", "DATABASE_URL"),
    testUrl: envValue(".env.test", "TEST_DATABASE_URL"),
  });
  assert.notEqual(identities.production.fingerprint, identities.test.fingerprint);
  assert.equal(JSON.stringify(identities).includes("@"), false);
});

check("MUV hosts rejected", () => {
  for (const host of [
    "ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech",
    "ep-falling-heart-azsxzcob-pooler.c-3.ap-southeast-1.aws.neon.tech",
  ]) {
    expectCode(() => guard.inspectDatabaseUrl(`postgresql://user:secret@${host}/neondb`, "test"), "KNOWN_MUV_DATABASE");
  }
});

check("production/test equality rejected", () => {
  const url = "postgresql://user:secret@seera-main.example.test/seera";
  expectCode(() => guard.validateDatabaseIsolation({ productionUrl: url, testUrl: url }), "DATABASE_URLS_EQUAL");
});

check("test fallback and production identity reuse rejected", () => {
  const production = "postgresql://user:secret@seera-main.example.test/seera";
  expectCode(() => guard.validateDatabaseIsolation({ productionUrl: production }), "TEST_DATABASE_FALLBACK");
  expectCode(
    () => guard.validateDatabaseIsolation({
      productionUrl: production,
      testUrl: "postgresql://other:other@seera-main.example.test/seera?sslmode=require",
    }),
    "TEST_POINTS_TO_PRODUCTION",
  );
});

check("active migration path is Seera-only", () => {
  const active = walk(path.join(root, "prisma/migrations")).filter((file) => path.basename(file) !== ".gitkeep");
  const sql = active.filter((file) => path.basename(file) === "migration.sql");
  assert.equal(sql.length, 8);
  assert.equal(sql.some((file) => /001_seera_foundation/.test(file)), true);
  const authorized = [
    /001_seera_foundation/,
    /002_user_disabled_status/,
    /003_phase_2_5_sales_distribution/,
    /004_partner_user_scope/,
    /005_company_order_states/,
    /006_active_work_session_constraint/,
    /007_phase_2_3_operational_records/,
    /008_user_ui_language/,
  ];
  assert.equal(sql.every((file) => authorized.some((pattern) => pattern.test(file))), true);
  for (const file of sql) {
    const content = readFileSync(file, "utf8");
    for (const forbidden of ["Retailer", "Distributor", "SuperStockist", "CommercialOrder", "Payment", "Product"]) {
      assert.doesNotMatch(content, new RegExp(`CREATE TABLE \\"${forbidden}`, "i"));
    }
  }
});

check("migration archive manifest complete", () => {
  const archive = path.join(root, "docs/seera/pre-phase-1/reference/muv-migrations");
  const lines = read("docs/seera/pre-phase-1/reference/MUV_MIGRATION_MANIFEST.sha256").trim().split(/\r?\n/);
  assert.equal(lines.length, 60);
  assert.equal(walk(archive).length, 60);
  for (const line of lines) {
    const match = /^([A-Fa-f0-9]{64})\s{2}(.+)$/.exec(line);
    assert.ok(match);
    const file = path.join(archive, match[2].replaceAll("/", path.sep));
    assert.equal(existsSync(file), true);
    assert.equal(sha256(file), match[1].toUpperCase());
  }
});

check("copied Prisma-writing scripts are archived and seed is blocked", () => {
  assert.equal(existsSync(path.join(root, "prisma/seed.ts")), false);
  const archive = path.join(root, "reference/muv-db-scripts");
  const lines = read("reference/MUV_DB_SCRIPT_ARCHIVE_MANIFEST.sha256").trim().split(/\r?\n/);
  assert.equal(lines.length, 24);
  assert.equal(walk(archive).length, 24);
  for (const line of lines) {
    const match = /^([A-Fa-f0-9]{64})\s{2}(.+)$/.exec(line);
    assert.ok(match);
    const file = path.join(archive, match[2].replaceAll("/", path.sep));
    assert.equal(existsSync(file), true);
    assert.equal(sha256(file), match[1].toUpperCase());
  }
  assert.match(JSON.parse(read("package.json")).prisma.seed, /blocked-database-command/);
});

check("clean Phase 1 schema boundary", () => {
  const schema = read("prisma/schema.prisma");
  const required = ["User", "Account", "Session", "VerificationToken", "Role", "Permission", "RolePermission", "UserRoleAssignment", "AuditLog", "AppSetting", "FeatureFlag", "IdempotencyKey", "OutboxEvent", "StoredFile", "Notification", "NotificationDelivery"];
  for (const model of required) assert.match(schema, new RegExp(`^model ${model} \\{`, "m"));
  assert.doesNotMatch(schema, /^enum Role \{/m);
  const forbidden = ["Retailer", "Distributor", "SuperStockist", "Beat", "SalesVisit", "CommercialOrder", "Ledger", "Payment", "BillingProfile", "CommercialDocument", "ExpenseClaim", "PartnerLifecycleEvent"];
  for (const model of forbidden) assert.doesNotMatch(schema, new RegExp(`^model ${model} \\{`, "m"));
  assert.equal(schema.includes("organizationKey"), false);
  assert.equal(schema.includes("MUV"), false);
});

check("MUV route archive and fail-closed portal boundary", () => {
  assert.equal(walk(path.join(root, "reference/muv-app")).length, 225);
  assert.equal(walk(path.join(root, "app")).some((file) => file.includes(`${path.sep}(storefront)${path.sep}`)), false);
  assert.match(read("middleware.ts"), /AUTHENTICATION_REQUIRED/);
  assert.match(read("app/portal/[portal]/page.tsx"), /resolveRequestIdentity/);
  assert.match(read("app/portal/[portal]/page.tsx"), /authorize/);
});

check("no absolute runtime dependency on MUV repository", () => {
  const files = [
    ...walk(path.join(root, "app")),
    ...walk(path.join(root, "lib/database")),
    ...walk(path.join(root, "lib/foundation")),
    path.join(root, "middleware.ts"),
    path.join(root, "instrumentation.ts"),
  ];
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /muv-platform-deployment-package|C:\\Users\\KE\\muv-platform/i);
});

check("current MUV read-only baseline is secret-free and internally identified", () => {
  const manifestPath = path.join(root, "docs/seera/reference/MUV_READ_ONLY_BASELINE_CURRENT.sha256");
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
  assert.equal(lines.length, 1119);
  assert.equal(sha256(manifestPath), "FA7A044CB89DCAC007F7F1FDD3C921924F6480752A49D6270474FBC60749D95C");
  for (const line of lines) {
    assert.match(line, /^[A-F0-9]{64}\s{2}.+$/);
    assert.doesNotMatch(line, /(^|\/)\.env($|\.)|credential|private[_-]?key/i);
  }
});

for (const result of results) console.log(`${result.status} ${result.name}`);
console.log(`PASS ${results.length}/${results.length} static checks; no database connection opened`);
