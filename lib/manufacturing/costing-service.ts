import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournalInTx } from "@/lib/finance/journal-service";

// Batch Costing (spec §46/§47) — cost basis is ALWAYS the material's real
// weighted-average receipt cost (SeeraManufacturingMaterial.unitCost, set
// only from an actual costed GRN — never selling price). Confidence is
// classified honestly: RELIABLE only when every consumed material has a real
// cost; PARTIAL when some do; UNAVAILABLE when none do. This is also what
// finally gives Finance OS's COGS a real basis to graduate out of PARTIAL —
// see postCogsForBatch below.
export async function computeBatchCost(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const events = await db.seeraProductionMaterialEvent.findMany({ where: { batchId, kind: "CONSUMPTION" } });
  let rawMaterialCost = 0;
  let packagingCost = 0;
  let knownCostLines = 0;
  for (const event of events) {
    const material = await db.seeraManufacturingMaterial.findUnique({ where: { id: event.materialId } });
    if (!material || material.unitCost == null) continue;
    const cost = Number(material.unitCost) * Number(event.canonicalQuantity);
    if (material.type === "PACKAGING_MATERIAL") packagingCost += cost;
    else rawMaterialCost += cost;
    knownCostLines++;
  }
  const totalCost = rawMaterialCost + packagingCost;
  const confidence = knownCostLines === 0 ? "UNAVAILABLE" : knownCostLines < events.length ? "PARTIAL" : "RELIABLE";
  const batch = await db.seeraProductionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const unitCost = batch.actualOutputQuantity && Number(batch.actualOutputQuantity) > 0 ? totalCost / Number(batch.actualOutputQuantity) : null;
  const record = await db.seeraBatchCost.upsert({ where: { batchId }, update: { rawMaterialCost, packagingCost, totalCost, unitCost, confidence, computedAt: new Date() }, create: { batchId, rawMaterialCost, packagingCost, totalCost, unitCost, confidence } });
  await recordAudit(db, { actorId, action: "mfg.batch_cost.computed", entityType: "SeeraBatchCost", entityId: record.id, afterState: { totalCost, confidence } });
  return record;
}

// Finance OS integration (spec §48) — values the internal transformation:
// Dr WIP/Finished Goods Inventory, Cr Raw Material + Packaging Inventory, at
// the batch's real computed cost. Deliberately does NOT auto-post from a
// bare GRN (valuation-method choice is a Founder/Finance decision, spec §46)
// and does NOT hook Sales V1's dispatch to auto-recognise COGS at the point
// of sale (that is Sales V1's own frozen flow, not modified this pass) — see
// the Final Report's integration-boundary note. This posts the PRODUCTION
// value transfer only, which is the piece Manufacturing OS owns.
export async function postCogsForBatch(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const cost = await db.seeraBatchCost.findUnique({ where: { batchId } });
  if (!cost || cost.confidence === "UNAVAILABLE") throw new FoundationError("BATCH_COST_UNAVAILABLE", "Batch cost is not yet reliable enough to post — configure material receipt costs first", 409);
  const batch = await db.seeraProductionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const total = Number(cost.totalCost);
  if (total <= 0) throw new FoundationError("BATCH_COST_ZERO", "Batch cost is zero — nothing to post", 409);
  return db.$transaction(async (tx) => {
    const lines = [{ accountId: "1230", debit: total }];
    if (Number(cost.rawMaterialCost) > 0) lines.push({ accountId: "1210", credit: Number(cost.rawMaterialCost) } as never);
    if (Number(cost.packagingCost) > 0) lines.push({ accountId: "1220", credit: Number(cost.packagingCost) } as never);
    const journal = await postJournalInTx(tx, actorId, { date: batch.date, sourceType: "MANUFACTURING_TRANSFORMATION", sourceId: batch.id, narration: `Production value transfer — batch ${batch.batchNumber}`, idempotencyKey: `mfg-cogs-${batch.id}`, lines: lines as never });
    await recordAudit(tx, { actorId, action: "mfg.batch_cost.posted", entityType: "SeeraBatchCost", entityId: cost.id, afterState: { journalId: journal.id, totalCost: total } });
    return journal;
  });
}

export async function postWastageExpense(db: PrismaClient, actorId: string, wastageRecordId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const record = await db.seeraWastageRecord.findUniqueOrThrow({ where: { id: wastageRecordId } });
  if (!record.materialId) throw new FoundationError("WASTAGE_MATERIAL_REQUIRED", "Wastage record has no material to cost", 400);
  const material = await db.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: record.materialId } });
  if (material.unitCost == null) throw new FoundationError("MATERIAL_COST_UNAVAILABLE", "Material has no captured cost yet — configure a costed GRN first", 409);
  const value = Number(material.unitCost) * Number(record.wasteQuantity);
  if (value <= 0) throw new FoundationError("WASTAGE_VALUE_ZERO", "Wastage value is zero", 409);
  const inventoryAccount = material.type === "PACKAGING_MATERIAL" ? "1220" : "1210";
  return db.$transaction(async (tx) => {
    const journal = await postJournalInTx(tx, actorId, { date: new Date(), sourceType: "MANUFACTURING_WASTAGE", sourceId: record.id, narration: `Wastage — ${record.wastageType}`, idempotencyKey: `mfg-wastage-${record.id}`, lines: [{ accountId: "5240", debit: value }, { accountId: inventoryAccount, credit: value }] });
    await recordAudit(tx, { actorId, action: "mfg.wastage.costed", entityType: "SeeraWastageRecord", entityId: record.id, afterState: { journalId: journal.id, value } });
    return journal;
  });
}

export async function batchCostTrend(db: PrismaClient, actorId: string, productSkuId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { productSkuId }, orderBy: { date: "desc" }, take: 20 });
  const costs = await db.seeraBatchCost.findMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
  const costByBatch = new Map(costs.map((c) => [c.batchId, c]));
  return batches.map((b) => ({ batchId: b.id, batchNumber: b.batchNumber, date: b.date, cost: costByBatch.get(b.id) ?? null }));
}
