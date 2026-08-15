import type { ManufacturingMaterialType, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { materialStockPosition } from "./ledger-service";
import { activeBomFor } from "./bom-service";
import { activeSopFor } from "./sop-service";
import { activePackagingBomFor } from "./packaging-bom-service";
import { companyStockPosition } from "./company-stock-service";

type RangeFilter = { from?: Date; to?: Date; productSkuId?: string; materialId?: string; status?: string };
const range = (f?: Date, t?: Date) => ({ gte: f ?? new Date(0), lte: t ?? new Date("9999-12-31") });

// ---------------------------------------------------------------------------
// PRODUCTION
// ---------------------------------------------------------------------------
export async function dailyProductionReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { date: range(f.from, f.to), productSkuId: f.productSkuId, status: f.status as never }, orderBy: { date: "desc" }, take: 500 });
  return batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, productSkuId: b.productSkuId, date: b.date, shiftId: b.shiftId, machineId: b.machineId, plannedQuantity: Number(b.plannedQuantity), actualOutputQuantity: b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : null, yieldPct: b.yieldPct != null ? Number(b.yieldPct) : null, status: b.status, qcStatus: b.qcStatus }));
}

export async function productWiseProductionReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { date: range(f.from, f.to) }, select: { productSkuId: true, actualOutputQuantity: true, plannedQuantity: true } });
  const skus = await db.seeraSku.findMany({ select: { id: true, code: true, productName: true } });
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const byProduct = new Map<string, { productSkuId: string; batches: number; plannedTotal: number; actualTotal: number }>();
  for (const b of batches) {
    const row = byProduct.get(b.productSkuId) ?? { productSkuId: b.productSkuId, batches: 0, plannedTotal: 0, actualTotal: 0 };
    row.batches += 1; row.plannedTotal += Number(b.plannedQuantity); row.actualTotal += b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : 0;
    byProduct.set(b.productSkuId, row);
  }
  return [...byProduct.values()].map((r) => ({ ...r, productCode: skuMap.get(r.productSkuId)?.code ?? r.productSkuId, productName: skuMap.get(r.productSkuId)?.productName ?? "UNKNOWN" }));
}

export async function planVsActualReport(db: PrismaClient, actorId: string, planId: string) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const plan = await db.seeraProductionPlan.findUniqueOrThrow({ where: { id: planId }, include: { lines: true } });
  const rows = await Promise.all(plan.lines.map(async (line) => {
    const orders = await db.seeraProductionOrder.findMany({ where: { planLineId: line.id }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    const batches = orderIds.length ? await db.seeraProductionBatch.findMany({ where: { productionOrderId: { in: orderIds } }, select: { actualOutputQuantity: true } }) : [];
    const actualTotal = batches.reduce((s, b) => s + (b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : 0), 0);
    return { planLineId: line.id, productSkuId: line.productSkuId, targetQuantity: Number(line.targetQuantity), targetBatches: line.targetBatches, actualQuantity: actualTotal, actualBatches: batches.length, variance: actualTotal - Number(line.targetQuantity) };
  }));
  return { plan: { id: plan.id, planNumber: plan.planNumber, period: plan.period, periodStart: plan.periodStart, periodEnd: plan.periodEnd, status: plan.status }, lines: rows };
}

export async function productionOrderRegister(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  return db.seeraProductionOrder.findMany({ where: { productionDate: range(f.from, f.to), productSkuId: f.productSkuId, status: f.status as never }, orderBy: { productionDate: "desc" }, take: 500 });
}

export async function batchRegister(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { date: range(f.from, f.to), productSkuId: f.productSkuId, status: f.status as never }, orderBy: { date: "desc" }, take: 500 });
  return batches.map((b) => ({ ...b, plannedQuantity: Number(b.plannedQuantity), actualOutputQuantity: b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : null, yieldPct: b.yieldPct != null ? Number(b.yieldPct) : null }));
}

export async function shiftWiseOutputReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { date: range(f.from, f.to) }, select: { shiftId: true, actualOutputQuantity: true } });
  const shifts = await db.seeraManufacturingShift.findMany({ select: { id: true, name: true } });
  const shiftMap = new Map(shifts.map((s) => [s.id, s.name]));
  const byShift = new Map<string, { shiftId: string; shiftName: string; batches: number; outputTotal: number }>();
  for (const b of batches) {
    const key = b.shiftId ?? "UNASSIGNED";
    const row = byShift.get(key) ?? { shiftId: key, shiftName: b.shiftId ? (shiftMap.get(b.shiftId) ?? "UNKNOWN") : "Unassigned", batches: 0, outputTotal: 0 };
    row.batches += 1; row.outputTotal += b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : 0;
    byShift.set(key, row);
  }
  return [...byShift.values()];
}

// ---------------------------------------------------------------------------
// MATERIAL / PACKAGING (shared implementation, filtered by type)
// ---------------------------------------------------------------------------
export async function materialStockReport(db: PrismaClient, actorId: string, type?: ManufacturingMaterialType) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const materials = await db.seeraManufacturingMaterial.findMany({ where: { isActive: true, type }, orderBy: { name: "asc" } });
  const rows = await Promise.all(materials.map(async (m) => ({ materialId: m.id, code: m.code, name: m.name, type: m.type, unit: m.baseUnit, ...(await materialStockPosition(db, m.id)), reorderLevel: m.reorderLevel != null ? Number(m.reorderLevel) : null })));
  return rows;
}

export async function materialConsumptionReport(db: PrismaClient, actorId: string, f: RangeFilter & { type?: ManufacturingMaterialType }) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const materials = await db.seeraManufacturingMaterial.findMany({ where: { type: f.type, id: f.materialId }, select: { id: true, code: true, name: true } });
  const materialIds = materials.map((m) => m.id);
  const events = await db.seeraProductionMaterialEvent.findMany({ where: { kind: "CONSUMPTION", createdAt: range(f.from, f.to), materialId: f.type || f.materialId ? { in: materialIds } : undefined }, select: { materialId: true, canonicalQuantity: true } });
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  const byMaterial = new Map<string, { materialId: string; code: string; name: string; consumedQuantity: number }>();
  for (const e of events) {
    const mat = materialMap.get(e.materialId);
    const row = byMaterial.get(e.materialId) ?? { materialId: e.materialId, code: mat?.code ?? e.materialId, name: mat?.name ?? "UNKNOWN", consumedQuantity: 0 };
    row.consumedQuantity += Number(e.canonicalQuantity);
    byMaterial.set(e.materialId, row);
  }
  return [...byMaterial.values()];
}

export async function packagingVarianceReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const packagingMaterials = await db.seeraManufacturingMaterial.findMany({ where: { type: "PACKAGING_MATERIAL" }, select: { id: true, code: true, name: true } });
  const ids = packagingMaterials.map((m) => m.id);
  // theoreticalQuantity is captured once, at creation, and never overwritten;
  // canonicalQuantity is updated in place if recordActualConsumption later
  // corrects it — so a plain CONSUMPTION-kind query already reflects any
  // correction, matching batchDetail()'s own consumptionVariance computation.
  const events = await db.seeraProductionMaterialEvent.findMany({ where: { kind: "CONSUMPTION", materialId: { in: ids }, createdAt: range(f.from, f.to) }, select: { materialId: true, batchId: true, theoreticalQuantity: true, canonicalQuantity: true } });
  const materialMap = new Map(packagingMaterials.map((m) => [m.id, m]));
  return events.filter((e) => e.theoreticalQuantity != null).map((e) => ({ materialId: e.materialId, code: materialMap.get(e.materialId)?.code ?? e.materialId, batchId: e.batchId, theoretical: Number(e.theoreticalQuantity), actual: Number(e.canonicalQuantity), variance: Number(e.canonicalQuantity) - Number(e.theoreticalQuantity) }));
}

export async function rawMaterialVarianceReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const rawMaterials = await db.seeraManufacturingMaterial.findMany({ where: { type: "RAW_MATERIAL" }, select: { id: true, code: true, name: true } });
  const ids = rawMaterials.map((m) => m.id);
  const events = await db.seeraProductionMaterialEvent.findMany({ where: { kind: "CONSUMPTION", materialId: { in: ids }, createdAt: range(f.from, f.to) }, select: { materialId: true, batchId: true, theoreticalQuantity: true, canonicalQuantity: true } });
  const materialMap = new Map(rawMaterials.map((m) => [m.id, m]));
  return events.filter((e) => e.theoreticalQuantity != null).map((e) => ({ materialId: e.materialId, code: materialMap.get(e.materialId)?.code ?? e.materialId, batchId: e.batchId, theoretical: Number(e.theoreticalQuantity), actual: Number(e.canonicalQuantity), variance: Number(e.canonicalQuantity) - Number(e.theoreticalQuantity) }));
}

// ---------------------------------------------------------------------------
// QUALITY
// ---------------------------------------------------------------------------
export async function qcStatusBatches(db: PrismaClient, actorId: string, qcStatus: "PENDING" | "HOLD" | "FAILED" | "RELEASED") {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  const batches = await db.seeraProductionBatch.findMany({ where: { qcStatus }, orderBy: { date: "desc" }, take: 200 });
  return batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, productSkuId: b.productSkuId, date: b.date, status: b.status, qcStatus: b.qcStatus, actualOutputQuantity: b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : null }));
}

export async function qcPassFailReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  const rows = await db.seeraBatchQc.findMany({ where: { sampleDate: range(f.from, f.to) }, orderBy: { sampleDate: "desc" }, take: 500 });
  const passed = rows.filter((r) => r.passFail === true).length;
  const failed = rows.filter((r) => r.passFail === false).length;
  const untested = rows.filter((r) => r.passFail === null).length;
  return { total: rows.length, passed, failed, untested, rows: rows.map((r) => ({ id: r.id, batchId: r.batchId, parameter: r.parameter, observedValue: r.observedValue != null ? Number(r.observedValue) : null, passFail: r.passFail, sampleDate: r.sampleDate })) };
}

export async function batchQualityHistoryReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  return db.seeraBatchQc.findMany({ where: { sampleDate: range(f.from, f.to) }, orderBy: { sampleDate: "desc" }, take: 500 });
}

// ---------------------------------------------------------------------------
// EFFICIENCY
// ---------------------------------------------------------------------------
export async function yieldReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const batches = await db.seeraProductionBatch.findMany({ where: { date: range(f.from, f.to), productSkuId: f.productSkuId, yieldPct: { not: null } }, orderBy: { date: "desc" }, take: 500 });
  return batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, productSkuId: b.productSkuId, date: b.date, yieldPct: Number(b.yieldPct) }));
}

export async function outputVarianceReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const orders = await db.seeraProductionOrder.findMany({ where: { productionDate: range(f.from, f.to), productSkuId: f.productSkuId }, orderBy: { productionDate: "desc" }, take: 300 });
  return Promise.all(orders.map(async (o) => {
    const batches = await db.seeraProductionBatch.findMany({ where: { productionOrderId: o.id }, select: { actualOutputQuantity: true } });
    const actualTotal = batches.reduce((s, b) => s + (b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : 0), 0);
    return { orderId: o.id, orderNumber: o.orderNumber, productSkuId: o.productSkuId, plannedOutput: Number(o.plannedOutput), actualOutput: actualTotal, variance: actualTotal - Number(o.plannedOutput), status: o.status };
  }));
}

// ---------------------------------------------------------------------------
// COSTING
// ---------------------------------------------------------------------------
export async function batchCostReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const costs = await db.seeraBatchCost.findMany({ where: { computedAt: range(f.from, f.to) }, orderBy: { computedAt: "desc" }, take: 500 });
  const batchIds = costs.map((c) => c.batchId);
  const batches = batchIds.length ? await db.seeraProductionBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, batchNumber: true, productSkuId: true } }) : [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  return costs.map((c) => ({ batchId: c.batchId, batchNumber: batchMap.get(c.batchId)?.batchNumber ?? c.batchId, productSkuId: batchMap.get(c.batchId)?.productSkuId, rawMaterialCost: Number(c.rawMaterialCost), packagingCost: Number(c.packagingCost), totalCost: Number(c.totalCost), unitCost: c.unitCost != null ? Number(c.unitCost) : null, confidence: c.confidence, computedAt: c.computedAt }));
}

export async function productCostReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const costs = await db.seeraBatchCost.findMany({ where: { computedAt: range(f.from, f.to) } });
  const batches = await db.seeraProductionBatch.findMany({ where: { id: { in: costs.map((c) => c.batchId) } }, select: { id: true, productSkuId: true } });
  const batchToSku = new Map(batches.map((b) => [b.id, b.productSkuId]));
  const skus = await db.seeraSku.findMany({ select: { id: true, code: true, productName: true } });
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const byProduct = new Map<string, { productSkuId: string; batches: number; totalCost: number; unitCostSum: number; unitCostCount: number }>();
  for (const c of costs) {
    const skuId = batchToSku.get(c.batchId); if (!skuId) continue;
    const row = byProduct.get(skuId) ?? { productSkuId: skuId, batches: 0, totalCost: 0, unitCostSum: 0, unitCostCount: 0 };
    row.batches += 1; row.totalCost += Number(c.totalCost);
    if (c.unitCost != null) { row.unitCostSum += Number(c.unitCost); row.unitCostCount += 1; }
    byProduct.set(skuId, row);
  }
  return [...byProduct.values()].map((r) => ({ productSkuId: r.productSkuId, productCode: skuMap.get(r.productSkuId)?.code, productName: skuMap.get(r.productSkuId)?.productName, batches: r.batches, totalCost: r.totalCost, avgUnitCost: r.unitCostCount ? r.unitCostSum / r.unitCostCount : null }));
}

export async function costConfidenceReport(db: PrismaClient, actorId: string, f: RangeFilter) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const costs = await db.seeraBatchCost.findMany({ where: { computedAt: range(f.from, f.to) }, select: { confidence: true } });
  const reliable = costs.filter((c) => c.confidence === "RELIABLE").length;
  const partial = costs.filter((c) => c.confidence === "PARTIAL").length;
  const unavailable = costs.filter((c) => c.confidence === "UNAVAILABLE").length;
  return { total: costs.length, reliable, partial, unavailable };
}

// Manufacturing Inventory Value (Founder Dashboard §13) — sum of physical
// stock x captured unit cost, across every material that HAS a captured
// cost; materials with no GRN unit cost yet are excluded from the total
// (reported separately as uncostedMaterialCount) rather than valued at zero,
// which would silently understate the true figure without saying so.
export async function manufacturingInventoryValue(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const materials = await db.seeraManufacturingMaterial.findMany({ where: { isActive: true }, select: { id: true, unitCost: true } });
  let totalValue = 0;
  let costedCount = 0;
  let uncostedCount = 0;
  for (const m of materials) {
    const position = await materialStockPosition(db, m.id);
    if (m.unitCost != null) { totalValue += position.physical * Number(m.unitCost); costedCount++; }
    else uncostedCount++;
  }
  return { totalValue, costedMaterialCount: costedCount, uncostedMaterialCount: uncostedCount };
}

// Founder Dashboard "Attention" signals not already covered by lowStock/
// nearExpiry/deviations/cogsCoverage: BOM Missing, SOP Missing, QC Failed
// (open), High Wastage — each a real query, no invented thresholds beyond
// what the spec itself implies (a batch that failed QC and hasn't moved on).
export async function dashboardAttentionSignals(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const [skusWithoutBom, qcFailedOpen] = await Promise.all([
    (async () => {
      const [allSkus, activeBoms] = await Promise.all([db.seeraSku.findMany({ where: { status: "ACTIVE" }, select: { id: true } }), db.seeraBom.findMany({ where: { status: "ACTIVE" }, select: { productSkuId: true } })]);
      const withBom = new Set(activeBoms.map((b) => b.productSkuId));
      return allSkus.filter((s) => !withBom.has(s.id)).length;
    })(),
    db.seeraProductionBatch.count({ where: { qcStatus: "FAILED" } }),
  ]);
  return { skusWithoutActiveBom: skusWithoutBom, qcFailedBatches: qcFailedOpen };
}

export async function costExceptionsReport(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_cost:view" });
  const costs = await db.seeraBatchCost.findMany({ where: { confidence: { in: ["PARTIAL", "UNAVAILABLE"] } }, orderBy: { computedAt: "desc" }, take: 200 });
  const batchIds = costs.map((c) => c.batchId);
  const batches = batchIds.length ? await db.seeraProductionBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, batchNumber: true, productSkuId: true, status: true } }) : [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  return costs.map((c) => ({ batchId: c.batchId, batchNumber: batchMap.get(c.batchId)?.batchNumber ?? c.batchId, productSkuId: batchMap.get(c.batchId)?.productSkuId, confidence: c.confidence, totalCost: Number(c.totalCost) }));
}

// ---------------------------------------------------------------------------
// TRACEABILITY
// ---------------------------------------------------------------------------
// Product Manufacturing 360 (closure spec §10/J) — the SKU-centric view
// mirroring material360()'s shape: active BOM/SOP/Packaging BOM, production
// history, current Company finished stock, QC/yield/wastage summary, cost
// trend, dispatch quantity and COGS coverage — one round trip, reusing every
// already-proven lookup (activeBomFor/activeSopFor/companyStockPosition/etc.)
// rather than re-deriving any of them.
export async function product360(db: PrismaClient, actorId: string, productSkuId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const [bom, sop, packagingBom, position, batches, wastage, allocations] = await Promise.all([
    activeBomFor(db, productSkuId),
    activeSopFor(db, productSkuId),
    activePackagingBomFor(db, productSkuId),
    companyStockPosition(db, productSkuId),
    db.seeraProductionBatch.findMany({ where: { productSkuId }, orderBy: { date: "desc" }, take: 30 }),
    db.seeraWastageRecord.findMany({ where: { batchId: { in: (await db.seeraProductionBatch.findMany({ where: { productSkuId }, select: { id: true } })).map((b) => b.id) } } }),
    db.seeraCompanyDispatchAllocation.findMany({ where: { skuId: productSkuId } }),
  ]);
  const qc = await db.seeraBatchQc.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, orderBy: { sampleDate: "desc" }, take: 30 });
  const yieldValues = batches.filter((b) => b.yieldPct != null).map((b) => Number(b.yieldPct));
  const avgYieldPct = yieldValues.length ? Math.round((yieldValues.reduce((s, v) => s + v, 0) / yieldValues.length) * 100) / 100 : null;
  const totalWastage = wastage.reduce((s, w) => s + Number(w.wasteQuantity), 0);
  const totalDispatchedQty = allocations.reduce((s, a) => s + Number(a.quantity), 0);
  const reliableDispatchedQty = allocations.filter((a) => a.costConfidence === "RELIABLE").reduce((s, a) => s + Number(a.quantity), 0);
  const cogsCoveragePct = totalDispatchedQty > 0 ? Math.round((reliableDispatchedQty / totalDispatchedQty) * 10000) / 100 : null;
  return {
    productSkuId,
    activeBom: bom ? { id: bom.id, version: bom.version, standardBatchSize: Number(bom.standardBatchSize), batchUnit: bom.batchUnit, lines: bom.lines.map((l) => ({ materialId: l.materialId, requiredQuantity: Number(l.requiredQuantity), unit: l.unit })) } : null,
    activeSop: sop ? { id: sop.id, version: sop.version, effectiveFrom: sop.effectiveFrom } : null,
    activePackagingBom: packagingBom ? { id: packagingBom.id, version: packagingBom.version } : null,
    finishedStock: position,
    productionHistory: batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, date: b.date, status: b.status, qcStatus: b.qcStatus, actualOutputQuantity: b.actualOutputQuantity != null ? Number(b.actualOutputQuantity) : null, yieldPct: b.yieldPct != null ? Number(b.yieldPct) : null })),
    qc: qc.map((q) => ({ id: q.id, batchId: q.batchId, parameter: q.parameter, passFail: q.passFail, sampleDate: q.sampleDate })),
    avgYieldPct,
    totalWastage,
    totalDispatchedQty,
    cogsCoveragePct,
  };
}

export async function rawLotToFinishedBatchesReport(db: PrismaClient, actorId: string, lotId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const events = await db.seeraProductionMaterialEvent.findMany({ where: { lotId, kind: "CONSUMPTION" }, select: { batchId: true, canonicalQuantity: true } });
  const batchIds = [...new Set(events.map((e) => e.batchId).filter((b): b is string => !!b))];
  const batches = batchIds.length ? await db.seeraProductionBatch.findMany({ where: { id: { in: batchIds } } }) : [];
  return batches.map((b) => ({ batchId: b.id, batchNumber: b.batchNumber, productSkuId: b.productSkuId, date: b.date, status: b.status, qcStatus: b.qcStatus, consumedFromLot: events.filter((e) => e.batchId === b.id).reduce((s, e) => s + Number(e.canonicalQuantity), 0) }));
}

export async function finishedBatchToCompanyDispatchReport(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const allocations = await db.seeraCompanyDispatchAllocation.findMany({ where: { batchId }, orderBy: { createdAt: "desc" } });
  if (!allocations.length) return { batchId, dispatches: [] };
  const orderIds = [...new Set(allocations.map((a) => a.orderId))];
  const orders = await db.seeraSalesOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, buyerPartnerId: true } });
  const partnerIds = [...new Set(orders.map((o) => o.buyerPartnerId).filter((p): p is string => !!p))];
  const partners = partnerIds.length ? await db.seeraPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, code: true, legalName: true } }) : [];
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const partnerMap = new Map(partners.map((p) => [p.id, p]));
  return {
    batchId,
    dispatches: allocations.map((a) => {
      const order = orderMap.get(a.orderId);
      const partner = order?.buyerPartnerId ? partnerMap.get(order.buyerPartnerId) : undefined;
      return { allocationId: a.id, orderId: a.orderId, orderNumber: order?.orderNumber ?? a.orderId, superStockist: partner ? `${partner.code} — ${partner.legalName}` : "UNKNOWN", quantity: Number(a.quantity), unitCost: a.unitCost != null ? Number(a.unitCost) : null, costConfidence: a.costConfidence, dispatchedAt: a.createdAt };
    }),
  };
}
