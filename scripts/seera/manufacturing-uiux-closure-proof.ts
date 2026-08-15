import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMachine, updateMachine, createShift, updateShift, listMachines, listShifts } from "../../lib/manufacturing/machine-shift-service";
import { uploadManufacturingDocument, manufacturingDocumentsFor, downloadManufacturingDocument } from "../../lib/manufacturing/document-service";
import { manufacturingSearch } from "../../lib/manufacturing/search-service";
import { manufacturingWorkspaceData } from "../../lib/manufacturing/workspace-data";
import { product360, manufacturingInventoryValue, dashboardAttentionSignals, qcStatusBatches, materialStockReport } from "../../lib/manufacturing/reports-center-service";
import { createMaterial } from "../../lib/manufacturing/material-service";
import { holdBatch, releaseBatch } from "../../lib/manufacturing/qc-service";
import { adjustStock } from "../../lib/manufacturing/stores-service";
import { createBomDraft } from "../../lib/manufacturing/bom-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only proof for the "Final UI/UX Closure" pass: Global Search, Reports
// Center (spot-checked), Machine/Shift Master CRUD, inline document upload/
// download/authorization, Product 360, Founder Dashboard signals, and the
// new roleView + RBAC boundaries for the 5 Manufacturing roles (including
// the two permissions newly granted to PRODUCTION_OPERATOR this pass). The
// core Manufacturing engine (batch execution, GRN, QC, costing, Company
// stock/COGS) is already proven by manufacturing-os-proof.ts and
// manufacturing-company-dispatch-cogs-proof.ts and is NOT re-proven here.

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
  const [founder, mfgManager, supervisor, storeExec, qcUser, operator, executive] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-mfg-manager@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-production-supervisor@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-store-executive@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-qc-user@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-production-operator@seera.test" } }),
    db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } }),
  ]);
  const run = Date.now().toString(36);
  const key = (s: string) => `mfguiux-${run}-${s}`;

  console.log("\n=== Test 1-4: Machine Master CRUD ===");
  const machine = await createMachine(db, mfgManager.id, { code: `MC-${run}`, name: "TEST_ONLY_MANUFACTURING_FIXTURE Mixer", type: "Mixer" });
  assert(machine.isActive, "Test 1: Machine created, active by default");
  const machines = await listMachines(db, founder.id);
  assert(machines.some((m) => m.id === machine.id), "Test 2: Machine appears in listMachines");
  const deactivated = await updateMachine(db, mfgManager.id, machine.id, { isActive: false });
  assert(!deactivated.isActive, "Test 3: Machine deactivated");
  await expectError("ACCESS_DENIED", "Test 4: Sales Executive denied mfg_machine_shift:manage", () => createMachine(db, executive.id, { code: `DENIED-${run}`, name: "Denied" }));

  console.log("\n=== Test 5-7: Shift Master CRUD ===");
  const shift = await createShift(db, mfgManager.id, { name: `Shift-${run}`, startTime: "08:00", endTime: "16:00" });
  assert(shift.isActive, "Test 5: Shift created, active by default");
  const shifts = await listShifts(db, founder.id);
  assert(shifts.some((s) => s.id === shift.id), "Test 6: Shift appears in listShifts");
  await expectError("ACCESS_DENIED", "Test 7: Store Executive denied mfg_machine_shift:manage", () => createShift(db, storeExec.id, { name: `DENIED-${run}`, startTime: "00:00", endTime: "01:00" }));

  console.log("\n=== Test 8-12: Manufacturing document upload/download/authorization/audit ===");
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const rawMaterial = await createMaterial(db, mfgManager.id, { code: `DOC-RM-${run}`, name: "TEST_ONLY_MANUFACTURING_FIXTURE Doc Material", type: "RAW_MATERIAL", baseUnit: "KG" });
  const uploaded = await uploadManufacturingDocument(db, storeExec.id, { entityType: "SeeraManufacturingMaterial", entityId: rawMaterial.id, originalName: "coa-certificate.pdf", mimeType: "application/pdf", bytes: pdfBytes });
  assert(!!uploaded.id, "Test 8: Document uploaded (COA/certificate on a material)");
  const listed = await manufacturingDocumentsFor(db, founder.id, "SeeraManufacturingMaterial", rawMaterial.id);
  assert(listed.some((d) => d.id === uploaded.id), "Test 9: Uploaded document appears in manufacturingDocumentsFor");
  const downloaded = await downloadManufacturingDocument(db, founder.id, uploaded.id);
  assert(downloaded.bytes.length === pdfBytes.length && downloaded.mimeType === "application/pdf", "Test 10: Document downloads with correct bytes/mime");
  const auditRow = await db.auditLog.findFirst({ where: { action: "mfg.document.uploaded", entityId: rawMaterial.id }, orderBy: { occurredAt: "desc" } });
  assert(!!auditRow, "Test 11: Document upload recorded in audit log");
  await expectError("ACCESS_DENIED", "Test 12: Sales Executive denied document:upload for Manufacturing", () => uploadManufacturingDocument(db, executive.id, { entityType: "SeeraManufacturingMaterial", entityId: rawMaterial.id, originalName: "x.pdf", mimeType: "application/pdf", bytes: pdfBytes }));

  console.log("\n=== Test 13-15: Global Manufacturing Search ===");
  const searchByMaterialCode = await manufacturingSearch(db, founder.id, `DOC-RM-${run}`);
  assert(searchByMaterialCode.materials.some((m) => m.id === rawMaterial.id), "Test 13: Search finds material by code");
  const searchTooShort = await manufacturingSearch(db, founder.id, "a");
  assert(searchTooShort.query.length < 2 && searchTooShort.materials.length === 0, "Test 14: Sub-2-character query returns no results (guarded, not a full table scan)");
  await expectError("ACCESS_DENIED", "Test 15: Sales Executive denied manufacturingSearch (mfg_reports:view)", () => manufacturingSearch(db, executive.id, `DOC-RM-${run}`));

  console.log("\n=== Test 16-19: Reports Center spot-check (material stock, inventory value, dashboard signals, QC status) ===");
  const stockReport = await materialStockReport(db, founder.id, "RAW_MATERIAL");
  assert(stockReport.some((r) => r.materialId === rawMaterial.id), "Test 16: materialStockReport includes the fixture material");
  const invValue = await manufacturingInventoryValue(db, founder.id);
  assert(typeof invValue.totalValue === "number" && invValue.totalValue >= 0, `Test 17: manufacturingInventoryValue returns a real non-negative total (${invValue.totalValue})`);
  const signals = await dashboardAttentionSignals(db, founder.id);
  assert(typeof signals.skusWithoutActiveBom === "number" && typeof signals.qcFailedBatches === "number", "Test 18: dashboardAttentionSignals returns real counts");
  const pendingQc = await qcStatusBatches(db, qcUser.id, "PENDING");
  assert(Array.isArray(pendingQc), "Test 19: qcStatusBatches (QC role) returns a real list");

  console.log("\n=== Test 20-22: Product 360 ===");
  const skuForProduct360 = await db.seeraSku.findFirstOrThrow();
  const p360 = await product360(db, mfgManager.id, skuForProduct360.id);
  assert(p360.productSkuId === skuForProduct360.id, "Test 20: product360 returns data for the requested SKU");
  assert("finishedStock" in p360 && "avgYieldPct" in p360 && "cogsCoveragePct" in p360, "Test 21: product360 includes finished stock, yield, and COGS coverage fields");
  await expectError("ACCESS_DENIED", "Test 22: Sales Executive denied product360 (mfg_ledger:view)", () => product360(db, executive.id, skuForProduct360.id));

  console.log("\n=== Test 23-29: roleView + RBAC boundaries for the 5 Manufacturing roles ===");
  const [founderData, managerData, supervisorData, storeData, qcData, operatorData] = await Promise.all([
    manufacturingWorkspaceData(db, founder.id),
    manufacturingWorkspaceData(db, mfgManager.id),
    manufacturingWorkspaceData(db, supervisor.id),
    manufacturingWorkspaceData(db, storeExec.id),
    manufacturingWorkspaceData(db, qcUser.id),
    manufacturingWorkspaceData(db, operator.id),
  ]);
  assert(founderData.roleView === "FULL", `Test 23: Founder roleView is FULL (got ${founderData.roleView})`);
  assert(managerData.roleView === "FULL", `Test 24: Manufacturing Manager roleView is FULL (got ${managerData.roleView})`);
  assert(supervisorData.roleView === "FULL", `Test 25: Production Supervisor roleView is FULL (got ${supervisorData.roleView})`);
  assert(storeData.roleView === "STORE", `Test 26: Store Executive roleView is STORE (got ${storeData.roleView})`);
  assert(qcData.roleView === "QC", `Test 27: QC User roleView is QC (got ${qcData.roleView})`);
  assert(operatorData.roleView === "OPERATOR", `Test 28: Production Operator roleView is OPERATOR (got ${operatorData.roleView})`);
  // Operator's newly-granted mfg_ledger:view lets them see orders/materials (needed for Today's
  // Jobs), but they must still be denied every edit/approval permission outside "simple execution".
  assert(operatorData.orders !== null && operatorData.materials !== null, "Test 29: Operator can now see orders/materials (Today's Jobs data) after this pass's RBAC addition");

  console.log("\n=== Test 30-35: Operator/Store/QC negative-permission boundaries (spec §M/§15) ===");
  await expectError("ACCESS_DENIED", "Test 30: Operator denied mfg_material:manage (cannot create materials)", () => createMaterial(db, operator.id, { code: `OPDENIED-${run}`, name: "Denied", type: "RAW_MATERIAL", baseUnit: "KG" }));
  await expectError("ACCESS_DENIED", "Test 31: Operator denied mfg_bom:manage (cannot create/edit BOM)", () => createBomDraft(db, operator.id, { productSkuId: skuForProduct360.id, standardBatchSize: 1, batchUnit: "KG", lines: [] }));
  await expectError("ACCESS_DENIED", "Test 32: Store Executive denied mfg_qc:release (cannot QC-release a batch)", () => releaseBatch(db, storeExec.id, "nonexistent-but-permission-checked-first"));
  await expectError("ACCESS_DENIED", "Test 33: QC User denied mfg_stock_adjustment:manage (cannot adjust stock)", () => adjustStock(db, qcUser.id, { materialId: rawMaterial.id, direction: "INCREASE", quantity: 1, unit: "KG", canonicalQuantity: 1, locationId: "nonexistent", reason: "test", idempotencyKey: key("qc-adjust-denied") }));
  await expectError("ACCESS_DENIED", "Test 34: Manufacturing Manager denied settings:manage (cannot touch Founder-only Company Stock Mode)", () => db.$transaction(async () => { const { setCompanyInventoryMode } = await import("../../lib/manufacturing/company-stock-service"); return setCompanyInventoryMode(db, mfgManager.id, "LEGACY_UNBOUNDED", "unauthorized attempt"); }));
  await expectError("ACCESS_DENIED", "Test 35: Store Executive denied mfg_qc:enter (cannot hold a batch)", () => holdBatch(db, storeExec.id, "nonexistent-but-permission-checked-first", "test"));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
