import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { releaseBatch, holdBatch } from "../../lib/manufacturing/qc-service";
import { adjustStock } from "../../lib/manufacturing/stores-service";
import { createBomDraft } from "../../lib/manufacturing/bom-service";
import { createSopDraft } from "../../lib/manufacturing/sop-service";
import { createProductionPlan } from "../../lib/manufacturing/production-planning-service";
import { setCompanyInventoryMode } from "../../lib/manufacturing/company-stock-service";
import { postJournal } from "../../lib/finance/journal-service";
import { effectivePermissions } from "../../lib/foundation/authorization-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only exhaustive negative-permission matrix for the 6 Manufacturing-
// relevant roles, per the "95-96% freeze" closure spec §3. Complements (does
// not duplicate) the 13 negative tests already proven in
// manufacturing-uiux-closure-proof.ts — this script fills the SPECIFIC
// remaining cells the spec called out by name.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string) {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}
async function expectError(code: string, label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    fail++;
    console.error(`  FAIL: ${label} — expected ${code} but call succeeded`);
  } catch (error) {
    const actual = error instanceof FoundationError ? error.code : String(error);
    assert(actual === code, `${label} — expected ${code}, got ${actual}`);
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const [founder, mfgManager, supervisor, storeExec, qcUser, operator, salesExec] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-mfg-manager@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-production-supervisor@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-store-executive@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-qc-user@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-production-operator@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } }),
  ]);
  const run = Date.now().toString(36);
  const key = (s: string) => `mfgperm-${run}-${s}`;
  const sku = await db.seeraSku.findFirstOrThrow();

  console.log("\n=== OPERATOR negative cases ===");
  await expectError("ACCESS_DENIED", "Operator cannot BOM edit", () => createBomDraft(db, operator.id, { productSkuId: sku.id, standardBatchSize: 1, batchUnit: "KG", lines: [] }));
  await expectError("ACCESS_DENIED", "Operator cannot SOP edit", () => createSopDraft(db, operator.id, { productSkuId: sku.id, effectiveFrom: new Date() }));
  await expectError("ACCESS_DENIED", "Operator cannot QC release", () => releaseBatch(db, operator.id, "nonexistent-but-permission-checked-first"));
  await expectError("ACCESS_DENIED", "Operator cannot stock adjustment", () => adjustStock(db, operator.id, { materialId: "x", direction: "INCREASE", quantity: 1, unit: "KG", canonicalQuantity: 1, locationId: "x", reason: "test", idempotencyKey: key("op-adjust") }));
  await expectError("ACCESS_DENIED", "Operator cannot settings manage (Company Stock Mode)", () => setCompanyInventoryMode(db, operator.id, "LEGACY_UNBOUNDED", "unauthorized"));

  console.log("\n=== STORE negative cases ===");
  await expectError("ACCESS_DENIED", "Store cannot QC release", () => releaseBatch(db, storeExec.id, "nonexistent-but-permission-checked-first"));
  await expectError("ACCESS_DENIED", "Store cannot BOM manage", () => createBomDraft(db, storeExec.id, { productSkuId: sku.id, standardBatchSize: 1, batchUnit: "KG", lines: [] }));
  await expectError("ACCESS_DENIED", "Store cannot Founder-only settings (Company Stock Mode)", () => setCompanyInventoryMode(db, storeExec.id, "LEGACY_UNBOUNDED", "unauthorized"));

  console.log("\n=== QC negative cases ===");
  await expectError("ACCESS_DENIED", "QC cannot stock adjustment", () => adjustStock(db, qcUser.id, { materialId: "x", direction: "INCREASE", quantity: 1, unit: "KG", canonicalQuantity: 1, locationId: "x", reason: "test", idempotencyKey: key("qc-adjust") }));
  await expectError("ACCESS_DENIED", "QC cannot production planning edit", () => createProductionPlan(db, qcUser.id, { period: "WEEK", periodStart: new Date(), periodEnd: new Date(), idempotencyKey: key("qc-plan"), lines: [] }));
  await expectError("ACCESS_DENIED", "QC cannot BOM manage", () => createBomDraft(db, qcUser.id, { productSkuId: sku.id, standardBatchSize: 1, batchUnit: "KG", lines: [] }));

  console.log("\n=== SUPERVISOR negative cases ===");
  await expectError("ACCESS_DENIED", "Supervisor cannot Founder-only Company Stock Mode", () => setCompanyInventoryMode(db, supervisor.id, "LEGACY_UNBOUNDED", "unauthorized"));
  await expectError("ACCESS_DENIED", "Supervisor cannot Finance admin (manual journal post)", () => postJournal(db, supervisor.id, { date: new Date(), sourceType: "MANUAL", narration: "unauthorized", idempotencyKey: key("sup-journal"), lines: [{ accountId: "1000", debit: 1 }, { accountId: "3000", credit: 1 }] }));
  await expectError("ACCESS_DENIED", "Supervisor cannot stock adjustment (Manager+Founder only, not even Supervisor)", () => adjustStock(db, supervisor.id, { materialId: "x", direction: "INCREASE", quantity: 1, unit: "KG", canonicalQuantity: 1, locationId: "x", reason: "test", idempotencyKey: key("sup-adjust") }));

  console.log("\n=== MANAGER negative cases ===");
  await expectError("ACCESS_DENIED", "Manager cannot Founder-only Company Stock Mode", () => setCompanyInventoryMode(db, mfgManager.id, "LEGACY_UNBOUNDED", "unauthorized"));
  await expectError("ACCESS_DENIED", "Manager cannot Finance admin (manual journal post)", () => postJournal(db, mfgManager.id, { date: new Date(), sourceType: "MANUAL", narration: "unauthorized", idempotencyKey: key("mgr-journal"), lines: [{ accountId: "1000", debit: 1 }, { accountId: "3000", credit: 1 }] }));
  // Documented observation, not a "fix": MANUFACTURING_MANAGER does NOT hold
  // mfg_qc:release in the RBAC catalog (only QC_USER + Founder do) — a
  // deliberate segregation-of-duties control already present in the original
  // Manufacturing OS build, not something this pass changes without explicit
  // instruction. Proven here so it's a known, tested fact, not an assumption.
  await expectError("ACCESS_DENIED", "Manager does NOT hold mfg_qc:release (segregation of duties, by design)", () => releaseBatch(db, mfgManager.id, "nonexistent-but-permission-checked-first"));

  console.log("\n=== SALES roles: no Manufacturing access (blanket check) ===");
  const salesPermissions = await effectivePermissions(db, salesExec.id);
  const mfgPermissionsHeld = [...salesPermissions].filter((p) => p.startsWith("mfg_") || p === "portal:manufacturing");
  assert(mfgPermissionsHeld.length === 0, `Sales Executive holds zero mfg_*/portal:manufacturing permissions (found: ${mfgPermissionsHeld.join(", ") || "none"})`);
  await expectError("ACCESS_DENIED", "Sales Executive denied QC release", () => releaseBatch(db, salesExec.id, "nonexistent-but-permission-checked-first"));
  await expectError("ACCESS_DENIED", "Sales Executive denied stock adjustment", () => adjustStock(db, salesExec.id, { materialId: "x", direction: "INCREASE", quantity: 1, unit: "KG", canonicalQuantity: 1, locationId: "x", reason: "test", idempotencyKey: key("sales-adjust") }));

  console.log("\n=== Cross-check: Store's mfg_grn:manage does NOT also grant QC hold ===");
  await expectError("ACCESS_DENIED", "Store denied QC hold (mfg_qc:enter is a separate permission Store never received)", () => holdBatch(db, storeExec.id, "nonexistent-but-permission-checked-first", "test"));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
