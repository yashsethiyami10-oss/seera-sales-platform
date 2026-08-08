import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateDatabaseIsolation } from "@/lib/database/identity-guard";

const root = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function envValue(file: string, key: string): string | undefined {
  const line = read(file)
    .split(/\r?\n/)
    .filter((candidate) => new RegExp(`^\\s*${key}\\s*=`).test(candidate))
    .at(-1);
  return line?.split("=", 2)[1]?.trim().replace(/^['"]|['"]$/g, "");
}

describe("Phase 1 Block 1 static safety", () => {
  it("uses the independent Seera package identity", () => {
    const packageJson = JSON.parse(read("package.json")) as { name: string; scripts: Record<string, string> };
    expect(packageJson.name).toBe("seera-sales-distribution-os");
    expect(packageJson.scripts.postinstall).toContain("pre-phase-1-postinstall.cjs");
    for (const script of ["db:migrate", "db:push", "db:deploy", "db:studio", "db:seed"]) {
      expect(packageJson.scripts[script]).toContain("blocked-database-command.cjs");
    }
  });

  it("keeps exact active environment files isolated without exposing their credentials", () => {
    expect(existsSync(path.join(root, ".env"))).toBe(true);
    expect(existsSync(path.join(root, ".env.test"))).toBe(true);
    const result = validateDatabaseIsolation({
      productionUrl: envValue(".env", "DATABASE_URL"),
      testUrl: envValue(".env.test", "TEST_DATABASE_URL"),
    });
    expect(result.production.fingerprint).not.toBe(result.test.fingerprint);
  });

  it("has only the eight explicitly approved Seera migrations in the active path", () => {
    const active = walk(path.join(root, "prisma", "migrations")).filter((file) => path.basename(file) !== ".gitkeep");
    const migrationSql = active.filter((file) => path.basename(file) === "migration.sql");
    expect(migrationSql).toHaveLength(8);
    expect(migrationSql.some((file) => file.includes("001_seera_foundation"))).toBe(true);
    expect(migrationSql.some((file) => file.includes("002_user_disabled_status"))).toBe(true);
    const approved = [/001_seera_foundation/, /002_user_disabled_status/, /003_phase_2_5_sales_distribution/, /004_partner_user_scope/, /005_company_order_states/, /006_active_work_session_constraint/, /007_phase_2_3_operational_records/, /008_user_ui_language/];
    expect(active.every((file) => approved.some((pattern) => pattern.test(file)) || path.basename(file) === "migration_lock.toml")).toBe(true);
  });

  it("verifies every archived migration against the SHA-256 manifest", () => {
    const archive = path.join(root, "docs", "seera", "pre-phase-1", "reference", "muv-migrations");
    const manifest = read("docs/seera/pre-phase-1/reference/MUV_MIGRATION_MANIFEST.sha256")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = /^([A-Fa-f0-9]{64})\s{2}(.+)$/.exec(line);
        expect(match).not.toBeNull();
        return { hash: match![1]!.toUpperCase(), relative: match![2]!.replaceAll("/", path.sep) };
      });
    const files = walk(archive);
    expect(manifest).toHaveLength(60);
    expect(files).toHaveLength(60);
    for (const item of manifest) {
      const file = path.join(archive, item.relative);
      expect(existsSync(file)).toBe(true);
      expect(sha256(file)).toBe(item.hash);
    }
  });

  it("archives copied Prisma-writing scripts and blocks the Prisma seed hook", () => {
    expect(existsSync(path.join(root, "prisma", "seed.ts"))).toBe(false);
    const archive = path.join(root, "reference", "muv-db-scripts");
    const manifest = read("reference/MUV_DB_SCRIPT_ARCHIVE_MANIFEST.sha256").trim().split(/\r?\n/);
    expect(manifest).toHaveLength(24);
    expect(walk(archive)).toHaveLength(24);
    const packageJson = JSON.parse(read("package.json")) as { prisma: { seed: string } };
    expect(packageJson.prisma.seed).toContain("blocked-database-command.cjs");
  });

  it("uses the clean Phase 1 schema and excludes legacy/later-phase authority", () => {
    const schema = read("prisma/schema.prisma");
    for (const model of [
      "User",
      "Account",
      "Session",
      "VerificationToken",
      "Role",
      "Permission",
      "RolePermission",
      "UserRoleAssignment",
      "AuditLog",
      "AppSetting",
      "FeatureFlag",
      "IdempotencyKey",
      "OutboxEvent",
      "StoredFile",
      "Notification",
      "NotificationDelivery",
    ]) {
      expect(schema).toMatch(new RegExp(`^model ${model} \\{`, "m"));
    }
    expect(schema).not.toMatch(/^enum Role \{/m);
    for (const forbidden of [
      "Retailer",
      "Distributor",
      "SuperStockist",
      "Beat",
      "SalesVisit",
      "CommercialOrder",
      "Ledger",
      "Payment",
      "BillingProfile",
      "CommercialDocument",
      "ExpenseClaim",
      "PartnerLifecycleEvent",
    ]) {
      expect(schema).not.toMatch(new RegExp(`^model ${forbidden} \\{`, "m"));
    }
    expect(schema).not.toContain("organizationKey");
    expect(schema).not.toContain("MUV");
  });

  it("keeps the copied MUV route archive complete and outside active app routes", () => {
    const activeRoutes = walk(path.join(root, "app"));
    const archivedRoutes = walk(path.join(root, "reference", "muv-app"));
    expect(archivedRoutes).toHaveLength(225);
    expect(activeRoutes.length).toBeGreaterThan(0);
    expect(activeRoutes.some((file) => file.includes(`${path.sep}(storefront)${path.sep}`))).toBe(false);
    expect(read("middleware.ts")).toContain("AUTHENTICATION_REQUIRED");
    expect(read("app/portal/[portal]/page.tsx")).toContain("resolveRequestIdentity");
    expect(read("app/portal/[portal]/page.tsx")).toContain("authorize");
  });

  it("contains no runtime absolute import or symlink to the MUV repository", () => {
    const runtimeFiles = [
      ...walk(path.join(root, "app")),
      ...walk(path.join(root, "lib", "database")),
      ...walk(path.join(root, "lib", "foundation")),
      path.join(root, "middleware.ts"),
      path.join(root, "instrumentation.ts"),
    ];
    for (const file of runtimeFiles.filter((candidate) => statSync(candidate).isFile())) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/muv-platform-deployment-package|C:\\Users\\KE\\muv-platform/i);
    }
  });
});
