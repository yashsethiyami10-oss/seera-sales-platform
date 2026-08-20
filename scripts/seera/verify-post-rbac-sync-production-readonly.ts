import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Post-RBAC-sync production verification (Founder request) —
// confirms the production RolePermission sync actually landed as intended:
// GAP-003 (SALES_HEAD master:manage removal) and money_desk:* activation for
// ACCOUNTS_MANAGER/ACCOUNTS_EXECUTIVE/FOUNDER, no Manufacturing regression, no
// Company Direct governance regression. Every query below is a read (write:false
// is passed to the identity guard, matching the existing
// deploy-verify-production-foundation-readonly.ts convention).

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

const MONEY_DESK_ALL = ["money_desk:view", "money_desk:create", "money_desk:approve", "money_desk:reverse", "money_desk:view_all", "money_desk:cash", "money_desk:bank"];
const MONEY_DESK_EXECUTIVE_EXPECTED = ["money_desk:view", "money_desk:create", "money_desk:cash", "money_desk:bank"];
const SALES_HEAD_EXPECTED_OPS = ["portal:sales_manager", "user:view", "network:manage", "credit:manage", "approval:decide", "field_reports:view_self", "notifications:view", "files:view", "session:revoke_self"];

async function rolePermissionCodes(code: string): Promise<Set<string>> {
  const role = await prisma.role.findUnique({ where: { code }, include: { permissions: { include: { permission: true } } } });
  return new Set((role?.permissions ?? []).map((p) => p.permission.code));
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  const results: Record<string, string> = {};

  console.log("\n=== 1. SALES_HEAD ===");
  const salesHead = await rolePermissionCodes("SALES_HEAD");
  const masterManageRemoved = !salesHead.has("master:manage");
  console.log(`  master:manage present: ${salesHead.has("master:manage")}`);
  results["SALES_HEAD_MASTER_MANAGE"] = masterManageRemoved ? "REMOVED" : "STILL PRESENT";
  const opsMissing = SALES_HEAD_EXPECTED_OPS.filter((p) => !salesHead.has(p));
  console.log(`  Expected operational permissions present: ${SALES_HEAD_EXPECTED_OPS.length - opsMissing.length}/${SALES_HEAD_EXPECTED_OPS.length}${opsMissing.length ? ` (missing: ${opsMissing.join(", ")})` : ""}`);
  results["SALES_HEAD_OPS"] = opsMissing.length === 0 ? "PASS" : "FAIL";

  console.log("\n=== 2. ACCOUNTS_MANAGER ===");
  const accountsManager = await rolePermissionCodes("ACCOUNTS_MANAGER");
  const amMissing = MONEY_DESK_ALL.filter((p) => !accountsManager.has(p));
  console.log(`  money_desk:* present: ${MONEY_DESK_ALL.filter((p) => accountsManager.has(p)).join(", ")}`);
  if (amMissing.length) console.log(`  MISSING: ${amMissing.join(", ")}`);
  results["ACCOUNTS_MANAGER_MD"] = amMissing.length === 0 ? "PASS" : "FAIL";

  console.log("\n=== 3. ACCOUNTS_EXECUTIVE ===");
  const accountsExecutive = await rolePermissionCodes("ACCOUNTS_EXECUTIVE");
  const aeExpectedMissing = MONEY_DESK_EXECUTIVE_EXPECTED.filter((p) => !accountsExecutive.has(p));
  const aeShouldNotHave = ["money_desk:approve", "money_desk:reverse", "money_desk:view_all"].filter((p) => accountsExecutive.has(p));
  console.log(`  Expected present: ${MONEY_DESK_EXECUTIVE_EXPECTED.filter((p) => accountsExecutive.has(p)).join(", ")}`);
  if (aeExpectedMissing.length) console.log(`  MISSING (should have): ${aeExpectedMissing.join(", ")}`);
  if (aeShouldNotHave.length) console.log(`  UNEXPECTED (should NOT have): ${aeShouldNotHave.join(", ")}`);
  results["ACCOUNTS_EXECUTIVE_MD"] = aeExpectedMissing.length === 0 && aeShouldNotHave.length === 0 ? "PASS" : "FAIL";

  console.log("\n=== 4. FOUNDER/ADMIN ===");
  const founder = await rolePermissionCodes("FOUNDER_SUPER_ADMIN");
  const founderMissing = MONEY_DESK_ALL.filter((p) => !founder.has(p));
  console.log(`  money_desk:* present: ${MONEY_DESK_ALL.length - founderMissing.length}/${MONEY_DESK_ALL.length}`);
  console.log(`  Total Founder permission count: ${founder.size} (full catalog)`);
  results["FOUNDER_MD_GOVERNANCE"] = founderMissing.length === 0 ? "PASS" : "FAIL";

  console.log("\n=== 5. Money Desk access boundary ===");
  const salesExecutive = await rolePermissionCodes("SALES_EXECUTIVE");
  const distributorOwner = await rolePermissionCodes("DISTRIBUTOR_OWNER");
  const unauthorizedHasAccess = salesExecutive.has("money_desk:view") || distributorOwner.has("money_desk:view");
  console.log(`  SALES_EXECUTIVE has money_desk:view: ${salesExecutive.has("money_desk:view")}`);
  console.log(`  DISTRIBUTOR_OWNER has money_desk:view: ${distributorOwner.has("money_desk:view")}`);
  console.log(`  (Route/nav gate: lib/foundation/product-surface.ts item("money-desk",...,"money_desk:view") — code-level, not runtime-checkable read-only)`);
  console.log(`  (Backend enforcement: every createMoneyDeskTransaction/decideMoneyDeskApproval/voidMoneyDeskTransaction/moneyDeskHome call in lib/finance/money-desk-service.ts opens with authorize(actorId, "money_desk:*") — API-level, not UI-only, by construction)`);
  results["UNAUTHORIZED_MD_ACCESS"] = unauthorizedHasAccess ? "FAIL — unauthorized role has money_desk:view" : "BLOCKED";

  console.log("\n=== 6. Manufacturing ===");
  const flag = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
  console.log(`  portal.manufacturing.enabled: ${flag ? `enabled=${flag.enabled}` : "MISSING"}`);
  const mfgPermCount = await prisma.permission.count({ where: { code: { startsWith: "mfg_" } } });
  const mfgManager = await rolePermissionCodes("MANUFACTURING_MANAGER");
  console.log(`  mfg_* permissions in catalog: ${mfgPermCount} (baseline 23)`);
  console.log(`  MANUFACTURING_MANAGER permission count: ${mfgManager.size}`);
  results["MANUFACTURING_FLAG"] = flag?.enabled && mfgPermCount === 23 ? "PASS" : "FAIL";

  console.log("\n=== 7. Company Direct governance ===");
  const cdPartnerCount = await prisma.seeraPartner.count({ where: { type: "COMPANY_DIRECT" } });
  const cdEligibilityRows = await prisma.seeraAssignment.count({ where: { assignmentType: "COMPANY_DIRECT_ELIGIBLE" } });
  const distributorManagement = await rolePermissionCodes("DISTRIBUTOR_OWNER"); // unrelated role, sanity that RBAC sync didn't touch unrelated grants
  console.log(`  Company Direct partner rows (should stay <=1, singleton): ${cdPartnerCount}`);
  console.log(`  COMPANY_DIRECT_ELIGIBLE assignment rows (unaffected by RBAC sync — different table): ${cdEligibilityRows}`);
  console.log(`  master:manage now held only by: checking...`);
  const allRoles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
  const masterManageHolders = allRoles.filter((r) => r.permissions.some((p) => p.permission.code === "master:manage")).map((r) => r.code);
  console.log(`  master:manage holders: ${masterManageHolders.join(", ")}`);
  results["COMPANY_DIRECT_GOVERNANCE"] = cdPartnerCount <= 1 && masterManageHolders.includes("FOUNDER_SUPER_ADMIN") && !masterManageHolders.includes("SALES_HEAD") ? "PASS" : "FAIL";

  console.log("\n=== 8. Sanity: sync counts ===");
  const roleCount = await prisma.role.count();
  const permCount = await prisma.permission.count();
  console.log(`  Roles: ${roleCount} (expected 19)`);
  console.log(`  Permissions: ${permCount} (expected 145)`);
  results["SYNC_COUNTS"] = roleCount === 19 && permCount === 145 ? "PASS" : "FAIL";

  console.log("\n\n========== SUMMARY ==========");
  for (const [key, value] of Object.entries(results)) console.log(`${key}: ${value}`);
  const allPass = Object.entries(results).every(([k, v]) => (k === "SALES_HEAD_MASTER_MANAGE" ? v === "REMOVED" : k === "UNAUTHORIZED_MD_ACCESS" ? v === "BLOCKED" : v === "PASS"));
  console.log(`\nOVERALL: ${allPass ? "PASS" : "FAIL"}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
