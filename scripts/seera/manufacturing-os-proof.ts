import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMaterial, material360 } from "../../lib/manufacturing/material-service";
import { createLocation } from "../../lib/manufacturing/material-service";
import { createGrn, postGrn } from "../../lib/manufacturing/grn-service";
import { createBomDraft, submitBomForReview, approveBom, activateBom, activeBomFor } from "../../lib/manufacturing/bom-service";
import { createPackagingBomDraft, approvePackagingBom, activatePackagingBom } from "../../lib/manufacturing/packaging-bom-service";
import { createProductionOrder, approveProductionOrder, materialAvailabilityGate, reserveOrderMaterials, cancelProductionOrder } from "../../lib/manufacturing/production-order-service";
import { issueToProduction, returnUnusedMaterial, recordDailyProduction, recordActualConsumption, batchDetail } from "../../lib/manufacturing/batch-execution-service";
import { holdBatch, releaseBatch } from "../../lib/manufacturing/qc-service";
import { recordWastage } from "../../lib/manufacturing/wastage-service";
import { transferStock, startStockCount, recordStockCountLine, approveStockCount } from "../../lib/manufacturing/stores-service";
import { materialStockPosition, lotLedger, assertSufficientStock } from "../../lib/manufacturing/ledger-service";
import { computeBatchCost, postCogsForBatch } from "../../lib/manufacturing/costing-service";
import { FoundationError } from "../../lib/foundation/errors";

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
authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string): asserts cond {
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
  const founder = await db.user.findFirstOrThrow({ where: { email: "review-founder@seera.test" } });
  const accounts = await db.user.findFirstOrThrow({ where: { email: "review-accounts-manager@seera.test" } });
  const executive = await db.user.findFirstOrThrow({ where: { email: "review-sales-executive-1@seera.test" } });
  const run = Date.now().toString(36);
  const key = (s: string) => `mfgproof-${run}-${s}`;

  console.log("\n=== Materials/Locations (TEST_ONLY_MANUFACTURING_FIXTURE) ===");
  const rawStore = await createLocation(db, founder.id, { code: `RAW-${run}`, name: "TEST_ONLY Raw Store", type: "RAW_STORE" });
  const packStore = await createLocation(db, founder.id, { code: `PACK-${run}`, name: "TEST_ONLY Packaging Store", type: "PACKAGING_STORE" });
  const fgStore = await createLocation(db, founder.id, { code: `FG-${run}`, name: "TEST_ONLY Finished Store", type: "FINISHED_STORE" });
  const rawMaterial = await createMaterial(db, founder.id, { code: `RM-${run}`, name: "TEST_ONLY_MANUFACTURING_FIXTURE Raw Chemical", type: "RAW_MATERIAL", baseUnit: "KG", lotTracked: true, expiryTracked: false });
  const packMaterial = await createMaterial(db, founder.id, { code: `PM-${run}`, name: "TEST_ONLY_MANUFACTURING_FIXTURE Pouch", type: "PACKAGING_MATERIAL", baseUnit: "PCS", lotTracked: true, expiryTracked: false });
  // Manufacturing must post finished-goods stock into the EXISTING
  // SeeraInventoryMovement ledger, which has a real FK on skuId — so this
  // proof uses a real, already-seeded SeeraSku row rather than an invented
  // string, exactly matching how production must work (spec §51).
  const realSku = await db.seeraSku.findFirstOrThrow();
  const productSkuId = realSku.id;

  console.log("\n=== Test 1/2: GRN raw + packaging receipt ===");
  const rawGrn = await createGrn(db, founder.id, { date: new Date(), vendorId: "TEST_VENDOR", idempotencyKey: key("grn-raw"), lines: [{ materialId: rawMaterial.id, quantity: 100, unit: "KG", canonicalQuantity: 100, acceptedQuantity: 100, unitCost: 50, locationId: rawStore.id }] });
  await postGrn(db, founder.id, rawGrn.id);
  const rawPosition1 = await materialStockPosition(db, rawMaterial.id);
  assert(rawPosition1.physical === 100, `Test 1: Raw material receipt +100 kg (physical=${rawPosition1.physical})`);

  const packGrn = await createGrn(db, founder.id, { date: new Date(), vendorId: "TEST_VENDOR", idempotencyKey: key("grn-pack"), lines: [{ materialId: packMaterial.id, quantity: 1000, unit: "PCS", canonicalQuantity: 1000, acceptedQuantity: 1000, unitCost: 2, locationId: packStore.id }] });
  await postGrn(db, founder.id, packGrn.id);
  const packPosition1 = await materialStockPosition(db, packMaterial.id);
  assert(packPosition1.physical === 1000, `Test 2: Packaging receipt +1000 pcs (physical=${packPosition1.physical})`);

  console.log("\n=== Test 3: Approved BOM + Packaging BOM ===");
  const bomDraft = await createBomDraft(db, founder.id, { productSkuId, standardBatchSize: 10, batchUnit: "KG", expectedOutput: 10, lines: [{ materialId: rawMaterial.id, requiredQuantity: 1, unit: "KG", canonicalQuantity: 1 }] });
  await submitBomForReview(db, founder.id, bomDraft.id);
  await approveBom(db, founder.id, bomDraft.id);
  const activatedBom = await activateBom(db, founder.id, bomDraft.id);
  assert(activatedBom.status === "ACTIVE", "Test 3: BOM approved and activated");
  const pbomDraft = await createPackagingBomDraft(db, founder.id, { productSkuId, effectiveFrom: new Date(), lines: [{ materialId: packMaterial.id, quantityPerUnit: 1, unit: "PCS", canonicalQuantity: 1 }] });
  await approvePackagingBom(db, founder.id, pbomDraft.id);
  await activatePackagingBom(db, founder.id, pbomDraft.id);

  console.log("\n=== Test 4/5/6: Production Order, MRP requirement, reservation ===");
  const order = await createProductionOrder(db, founder.id, { productSkuId, plannedBatches: 10, plannedOutput: 10, productionDate: new Date(), idempotencyKey: key("order") });
  await approveProductionOrder(db, founder.id, order.id);
  const gate = await materialAvailabilityGate(db, order.id);
  assert(gate.ready && gate.rows[0]!.required === 10, `Test 5: MRP requirement calculated correctly (required=${gate.rows[0]!.required})`);
  await reserveOrderMaterials(db, founder.id, order.id);
  const rawPositionReserved = await materialStockPosition(db, rawMaterial.id);
  assert(rawPositionReserved.reserved === 10 && rawPositionReserved.available === 90, `Test 6: Reservation posted (reserved=${rawPositionReserved.reserved}, available=${rawPositionReserved.available})`);

  console.log("\n=== Test 7: Two-step material issue ===");
  const issueEvent = await issueToProduction(db, founder.id, { productionOrderId: order.id, materialId: rawMaterial.id, quantity: 5, unit: "KG", canonicalQuantity: 5, fromLocationId: rawStore.id, toLocationId: "WIP", idempotencyKey: key("issue") });
  assert(issueEvent.kind === "ISSUE", "Test 7: Material issued to production (two-step)");
  const afterIssueReturn = await returnUnusedMaterial(db, founder.id, { productionOrderId: order.id, materialId: rawMaterial.id, quantity: 5, unit: "KG", canonicalQuantity: 5, toLocationId: rawStore.id, reason: "Test return of issued-but-unused material", idempotencyKey: key("issue-return") });
  assert(afterIssueReturn.kind === "RETURN", "Test 22 precursor: issued material returned (two-step reversible)");

  console.log("\n=== Test 8/9/10/12/17: Daily production — consumption, packaging, output, yield ===");
  const batch = await recordDailyProduction(db, founder.id, { productionOrderId: order.id, date: new Date(), batchCount: 7, actualOutputQuantity: 6.5, outputUnit: "KG", finishedGoodsLocationId: fgStore.id, rawStoreLocationId: rawStore.id, packagingStoreLocationId: packStore.id, idempotencyKey: key("batch1") });
  const rawPositionAfterBatch = await materialStockPosition(db, rawMaterial.id);
  assert(rawPositionAfterBatch.physical === 93, `Test 9: Raw material stock reduces exactly by 7kg theoretical (physical=${rawPositionAfterBatch.physical}, expected 93)`);
  const packPositionAfterBatch = await materialStockPosition(db, packMaterial.id);
  assert(packPositionAfterBatch.physical === 1000 - 6.5, `Test 10: Packaging stock reduces exactly by ACTUAL output 6.5 (physical=${packPositionAfterBatch.physical})`);
  assert(batch.actualOutputQuantity != null && Number(batch.actualOutputQuantity) === 6.5, "Test 12: Finished goods output recorded");
  // expectedOutput on the BOM header is PER standard batch (10kg), so for 7
  // batches the expected total is 70kg — actual 6.5kg against that gives
  // ~9.29%, which is exactly correct arithmetic for these arbitrary test
  // numbers (not meant to resemble a real detergent yield).
  const expectedYield = Math.round((6.5 / (10 * 7)) * 10000) / 100;
  assert(Number(batch.yieldPct) === expectedYield, `Test 17: Yield computed correctly (${batch.yieldPct}%, expected ${expectedYield}%)`);

  console.log("\n=== Test 13/14: QC hold blocks availability, release grants it ===");
  // Scoped to THIS run's specific finished-goods receipt, not a blanket count
  // for the SKU — the fixture reuses whatever real SeeraSku already exists,
  // which earlier proof runs may have already posted released stock against.
  const thisReceipt = await db.seeraFinishedGoodsReceipt.findUniqueOrThrow({ where: { batchId: batch.id } });
  const companyStockBefore = await db.seeraInventoryMovement.count({ where: { partyType: "COMPANY", sourceType: "SeeraFinishedGoodsReceipt", sourceId: thisReceipt.id } });
  assert(companyStockBefore === 0, "Test 13: QC-pending finished goods NOT yet in Company inventory ledger");
  await holdBatch(db, founder.id, batch.id, "Test QC hold — awaiting lab result");
  const fgAfterHold = await db.seeraFinishedGoodsReceipt.findUnique({ where: { batchId: batch.id } });
  assert(fgAfterHold?.qcStatus === "HOLD", "Test 13: Batch correctly held, still not available");
  await db.seeraProductionBatch.update({ where: { id: batch.id }, data: { qcStatus: "PENDING" } });
  await db.seeraFinishedGoodsReceipt.update({ where: { batchId: batch.id }, data: { qcStatus: "PENDING" } });
  const released = await releaseBatch(db, founder.id, batch.id);
  assert(released.qcStatus === "RELEASED", "Test 14: QC release succeeded");
  const companyStockAfter = await db.seeraInventoryMovement.findFirst({ where: { partyType: "COMPANY", skuId: productSkuId, sourceId: fgAfterHold!.id } });
  assert(companyStockAfter != null && Number(companyStockAfter.quantity) === 6.5, `Test 14/31: Finished stock now in Company inventory ledger (qty=${companyStockAfter?.quantity})`);

  console.log("\n=== Test 15: Partial production ===");
  const orderAfterPartial = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(orderAfterPartial.status === "AWAITING_QC" || orderAfterPartial.status === "IN_PROGRESS", `Test 15: Partial production (7 of 10 batches) leaves order open, status=${orderAfterPartial.status}`);

  console.log("\n=== Test 16: Wastage ===");
  const wastage = await recordWastage(db, founder.id, { batchId: batch.id, materialId: rawMaterial.id, wastageType: "PROCESS_LOSS", wasteQuantity: 1, unit: "KG", reason: "Test process loss", idempotencyKey: key("waste") });
  assert(Number(wastage.wasteQuantity) === 1, "Test 16: Wastage recorded");
  const rawPositionAfterWaste = await materialStockPosition(db, rawMaterial.id);
  assert(rawPositionAfterWaste.physical === 92, `Test 16: Wastage posted a real stock OUT (physical=${rawPositionAfterWaste.physical})`);

  console.log("\n=== Test 18: Consumption variance correction ===");
  const varianceResult = await recordActualConsumption(db, founder.id, { batchId: batch.id, materialId: rawMaterial.id, actualQuantity: 6.5, reason: "Test — actual weighed less than theoretical", idempotencyKey: key("variance") });
  assert(varianceResult.variance === -0.5, `Test 18: Variance computed correctly (${varianceResult.variance})`);

  console.log("\n=== Test 19: Stock transfer ===");
  await transferStock(db, founder.id, { materialId: packMaterial.id, quantity: 50, unit: "PCS", canonicalQuantity: 50, fromLocationId: packStore.id, toLocationId: fgStore.id, reason: "Test transfer", idempotencyKey: key("transfer") });
  const packAfterTransfer = await materialStockPosition(db, packMaterial.id);
  assert(packAfterTransfer.physical === packPositionAfterBatch.physical, `Test 19: Transfer is balanced (net physical unchanged=${packAfterTransfer.physical})`);

  console.log("\n=== Test 20: Stock count adjustment ===");
  const countSession = await startStockCount(db, founder.id, { locationId: rawStore.id, date: new Date(), idempotencyKey: key("count"), materialIds: [rawMaterial.id] });
  const countedLine = countSession.lines[0]!;
  await recordStockCountLine(db, founder.id, countedLine.id, Number(countedLine.systemQuantity) - 2);
  await approveStockCount(db, founder.id, countSession.id);
  const rawAfterCount = await materialStockPosition(db, rawMaterial.id);
  // countedLine.systemQuantity was captured at the moment the count started —
  // i.e. AFTER Test 18's +0.5 variance-return already posted — so the
  // expected result is systemQuantity-2, not rawPositionAfterWaste.physical-2
  // (which predates that intervening real event).
  const expectedAfterCount = Number(countedLine.systemQuantity) - 2;
  assert(rawAfterCount.physical === expectedAfterCount, `Test 20: Stock count correction posted a governed adjustment (physical=${rawAfterCount.physical}, expected ${expectedAfterCount})`);

  console.log("\n=== Test 21/22/23: Lot traceability ===");
  const rawLot = await db.seeraManufacturingLot.findFirst({ where: { materialId: rawMaterial.id } });
  if (rawLot) {
    const ledger = await lotLedger(db, founder.id, rawLot.id);
    assert(ledger.length > 0, `Test 21: Lot ledger has movements (${ledger.length})`);
  }
  const batchEvents = await db.seeraProductionMaterialEvent.findMany({ where: { batchId: batch.id } });
  assert(batchEvents.some((e) => e.materialId === rawMaterial.id), "Test 23: Finished batch -> raw material trace works (batch's consumption events reference the raw material)");

  console.log("\n=== Test 24: Production cancellation releases reservation ===");
  const order2 = await createProductionOrder(db, founder.id, { productSkuId, plannedBatches: 1, plannedOutput: 1, productionDate: new Date(), idempotencyKey: key("order2") });
  await approveProductionOrder(db, founder.id, order2.id);
  await reserveOrderMaterials(db, founder.id, order2.id);
  const reservedBefore = await materialStockPosition(db, rawMaterial.id);
  await cancelProductionOrder(db, founder.id, order2.id, "Test cancellation");
  const reservedAfter = await materialStockPosition(db, rawMaterial.id);
  assert(reservedAfter.reserved === reservedBefore.reserved - 1 && reservedAfter.available === reservedBefore.available + 1, `Test 24: Cancellation released the reservation (reserved ${reservedBefore.reserved}->${reservedAfter.reserved})`);

  console.log("\n=== Test 25/26: Idempotent production completion ===");
  const order3 = await createProductionOrder(db, founder.id, { productSkuId, plannedBatches: 1, plannedOutput: 1, productionDate: new Date(), idempotencyKey: key("order3") });
  await approveProductionOrder(db, founder.id, order3.id);
  await reserveOrderMaterials(db, founder.id, order3.id);
  const idempotentKey = key("batch-idempotent");
  const batch3a = await recordDailyProduction(db, founder.id, { productionOrderId: order3.id, date: new Date(), batchCount: 1, actualOutputQuantity: 1, outputUnit: "KG", finishedGoodsLocationId: fgStore.id, rawStoreLocationId: rawStore.id, packagingStoreLocationId: packStore.id, idempotencyKey: idempotentKey });
  const rawBeforeRetry = await materialStockPosition(db, rawMaterial.id);
  const batch3b = await recordDailyProduction(db, founder.id, { productionOrderId: order3.id, date: new Date(), batchCount: 1, actualOutputQuantity: 1, outputUnit: "KG", finishedGoodsLocationId: fgStore.id, rawStoreLocationId: rawStore.id, packagingStoreLocationId: packStore.id, idempotencyKey: idempotentKey });
  const rawAfterRetry = await materialStockPosition(db, rawMaterial.id);
  assert(batch3a.id === batch3b.id, "Test 25: Idempotent retry returns the same batch, does not create a second one");
  assert(rawBeforeRetry.physical === rawAfterRetry.physical, `Test 26: No duplicate stock movement on retry (physical unchanged at ${rawAfterRetry.physical})`);

  console.log("\n=== Test 27: Negative stock blocked ===");
  await expectError("INSUFFICIENT_MATERIAL_STOCK", "Test 27: Negative stock blocked", () => assertSufficientStock(db, rawMaterial.id, 999999));

  console.log("\n=== Test 28: Unauthorized role denied ===");
  await expectError("ACCESS_DENIED", "Test 28: Sales Executive denied mfg_material:manage", () => createMaterial(db, executive.id, { code: `DENIED-${run}`, name: "Denied", type: "RAW_MATERIAL", baseUnit: "KG" }));
  await expectError("ACCESS_DENIED", "Sales Executive denied mfg_order:manage", () => createProductionOrder(db, executive.id, { productSkuId, plannedBatches: 1, plannedOutput: 1, productionDate: new Date(), idempotencyKey: key("denied-order") }));
  await expectError("ACCESS_DENIED", "Sales Executive denied mfg_qc:release", () => releaseBatch(db, executive.id, batch.id));

  console.log("\n=== Test 29: BOM change does not alter historical batch ===");
  const bomDraft2 = await createBomDraft(db, founder.id, { productSkuId, standardBatchSize: 10, batchUnit: "KG", expectedOutput: 12, lines: [{ materialId: rawMaterial.id, requiredQuantity: 2, unit: "KG", canonicalQuantity: 2 }] });
  await submitBomForReview(db, founder.id, bomDraft2.id);
  await approveBom(db, founder.id, bomDraft2.id);
  await activateBom(db, founder.id, bomDraft2.id);
  const batchAfterNewBom = await batchDetail(db, founder.id, batch.id);
  assert(batchAfterNewBom.batch.bomVersion === activatedBom.version, `Test 29: Historical batch keeps its original BOM version (${batchAfterNewBom.batch.bomVersion}) after a new BOM version was activated`);
  const newActiveBom = await activeBomFor(db, productSkuId);
  assert(newActiveBom?.version === bomDraft2.version, "Test 29: New BOM version is now the active one going forward");

  console.log("\n=== Test 30/32: Finance cost integration + COGS readiness classification ===");
  const cost = await computeBatchCost(db, founder.id, batch.id);
  assert(cost.confidence === "RELIABLE", `Test 32: Batch cost classified RELIABLE when all consumed materials have captured cost (confidence=${cost.confidence})`);
  const journal = await postCogsForBatch(db, founder.id, batch.id);
  assert(journal.status === "POSTED", "Test 30: Finance journal posted for batch production value transfer");

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
