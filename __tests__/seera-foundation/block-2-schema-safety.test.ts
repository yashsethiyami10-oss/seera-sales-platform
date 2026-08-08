import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE_1_PERMISSION_NAMESPACES, PHASE_1_ROLE_CODES } from "@/lib/foundation/rbac-catalog";

const root = path.resolve(__dirname, "..", "..");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const expectedModels = ["User", "Account", "Session", "VerificationToken", "Role", "Permission", "RolePermission", "UserRoleAssignment", "AuditLog", "AppSetting", "FeatureFlag", "IdempotencyKey", "OutboxEvent", "StoredFile", "Notification", "NotificationDelivery"];
const forbiddenModels = ["Retailer", "Distributor", "SuperStockist", "Beat", "SalesVisit", "CommercialOrder", "OrderItem", "FulfilmentEvent", "Ledger", "Payment", "BillingProfile", "ExpenseClaim", "PartnerLifecycleEvent", "Product", "Customer"];

describe("Block 2 schema and RBAC boundary", () => {
  it("preserves every approved foundation model before append-only Seera domain models", () => {
    const actual = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
    expect(actual.slice(0, expectedModels.length)).toEqual(expectedModels);
    for (const name of forbiddenModels) expect(schema).not.toMatch(new RegExp(`^model ${name} \\{`, "m"));
  });

  it("contains only the twelve explicitly approved Seera migrations", () => {
    const migrationRoot = path.join(root, "prisma/migrations");
    const directories = readdirSync(migrationRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(directories).toHaveLength(12);
    expect(directories.map((item) => item.name)).toEqual(expect.arrayContaining([expect.stringMatching(/_001_seera_foundation$/), expect.stringMatching(/_002_user_disabled_status$/), expect.stringMatching(/_003_phase_2_5_sales_distribution$/), expect.stringMatching(/_004_partner_user_scope$/), expect.stringMatching(/_005_company_order_states$/), expect.stringMatching(/_006_active_work_session_constraint$/), expect.stringMatching(/_007_phase_2_3_operational_records$/), expect.stringMatching(/_008_user_ui_language$/), expect.stringMatching(/_phase_6_9_governed_operations$/), expect.stringMatching(/_phase_6_9_private_document_content$/), expect.stringMatching(/_phase_10_automation_reporting_intelligence$/), expect.stringMatching(/_phase_11_offline_sync$/)]));
    for (const migration of directories) { const sql = readFileSync(path.join(migrationRoot, migration.name, "migration.sql"), "utf8"); for (const name of forbiddenModels) expect(sql).not.toContain(`CREATE TABLE "${name}"`); }
  });

  it("defines all canonical Phase 1 roles and namespaced permissions", () => {
    expect(PHASE_1_ROLE_CODES).toHaveLength(14);
    expect(new Set(PHASE_1_ROLE_CODES).size).toBe(14);
    expect(PHASE_1_PERMISSION_NAMESPACES).toContain("role");
    expect(PHASE_1_PERMISSION_NAMESPACES).toContain("audit");
  });
});
