import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE_1_PERMISSION_NAMESPACES, PHASE_1_ROLE_CODES } from "@/lib/foundation/rbac-catalog";

const root = path.resolve(__dirname, "..", "..");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const expectedModels = ["User", "Account", "Session", "VerificationToken", "Role", "Permission", "RolePermission", "UserRoleAssignment", "AuditLog", "AppSetting", "FeatureFlag", "IdempotencyKey", "OutboxEvent", "StoredFile", "Notification", "NotificationDelivery"];
const forbiddenModels = ["Retailer", "Distributor", "SuperStockist", "Beat", "SalesVisit", "CommercialOrder", "OrderItem", "FulfilmentEvent", "Ledger", "Payment", "BillingProfile", "ExpenseClaim", "PartnerLifecycleEvent", "Product", "Customer"];

describe("Block 2 schema and RBAC boundary", () => {
  it("contains exactly the approved foundation models", () => {
    const actual = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
    expect(actual).toEqual(expectedModels);
    for (const name of forbiddenModels) expect(schema).not.toMatch(new RegExp(`^model ${name} \\{`, "m"));
  });

  it("contains one Seera-only foundation migration", () => {
    const migrationRoot = path.join(root, "prisma/migrations");
    const directories = readdirSync(migrationRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(directories).toHaveLength(1);
    const migration = directories[0];
    expect(migration).toBeDefined();
    expect(migration!.name).toMatch(/_001_seera_foundation$/);
    const sql = readFileSync(path.join(migrationRoot, migration!.name, "migration.sql"), "utf8");
    for (const name of forbiddenModels) expect(sql).not.toContain(`CREATE TABLE "${name}"`);
  });

  it("defines all canonical Phase 1 roles and namespaced permissions", () => {
    expect(PHASE_1_ROLE_CODES).toHaveLength(14);
    expect(new Set(PHASE_1_ROLE_CODES).size).toBe(14);
    expect(PHASE_1_PERMISSION_NAMESPACES).toContain("rbac");
    expect(PHASE_1_PERMISSION_NAMESPACES).toContain("audit");
  });
});
