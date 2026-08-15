import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";

// Global Manufacturing Search (closure spec §9/E) — one query fan-out across
// every entity a factory user would actually search by, grouped and
// human-readable (batch/order numbers, material/SKU codes, lot numbers) so
// nothing forces a raw-UUID workflow. Each group carries enough fields for
// the UI to deep-link straight to the right existing section (BOM/SOP/Batch/
// GRN/etc. detail views already exist — this is the missing "how do I find
// the record" layer in front of them, not a second set of detail screens).
export async function manufacturingSearch(db: PrismaClient, actorId: string, query: string) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const q = query.trim();
  if (q.length < 2) return { query: q, batches: [], productionOrders: [], materials: [], lots: [], skus: [], grns: [], vendors: [], boms: [], sops: [], qc: [], deviations: [], documents: [] };
  const like = { contains: q, mode: "insensitive" as const };

  const matchedSkus = await db.seeraSku.findMany({ where: { OR: [{ code: like }, { productName: like }] }, take: 20, orderBy: { productName: "asc" } });
  const matchedSkuIds = matchedSkus.map((s) => s.id);
  const parsedVersion = /^\d+$/.test(q) ? Number(q) : undefined;

  const [batches, productionOrders, materials, lots, grns, vendors, boms, sops, qc, deviations, documents] = await Promise.all([
    db.seeraProductionBatch.findMany({ where: { batchNumber: like }, take: 20, orderBy: { createdAt: "desc" } }),
    db.seeraProductionOrder.findMany({ where: { orderNumber: like }, take: 20, orderBy: { createdAt: "desc" } }),
    db.seeraManufacturingMaterial.findMany({ where: { OR: [{ code: like }, { name: like }] }, take: 20, orderBy: { name: "asc" } }),
    db.seeraManufacturingLot.findMany({ where: { OR: [{ lotNumber: like }, { supplierLotRef: like }] }, take: 20, orderBy: { createdAt: "desc" } }),
    db.seeraGrn.findMany({ where: { OR: [{ grnNumber: like }, { purchaseRef: like }] }, take: 20, orderBy: { createdAt: "desc" } }),
    db.seeraVendor.findMany({ where: { OR: [{ code: like }, { legalName: like }, { tradeName: like }] }, take: 20, orderBy: { legalName: "asc" } }),
    // BOM/SOP have no free-text name of their own — searchable by the product
    // they belong to (matched above) or by an exact version number.
    db.seeraBom.findMany({ where: { OR: [{ productSkuId: { in: matchedSkuIds.length ? matchedSkuIds : ["__none__"] } }, ...(parsedVersion != null ? [{ version: parsedVersion }] : [])] }, take: 20, orderBy: { version: "desc" } }),
    db.seeraSop.findMany({ where: { OR: [{ productSkuId: { in: matchedSkuIds.length ? matchedSkuIds : ["__none__"] } }, ...(parsedVersion != null ? [{ version: parsedVersion }] : [])] }, take: 20, orderBy: { version: "desc" } }),
    db.seeraBatchQc.findMany({ where: { parameter: like }, take: 20, orderBy: { sampleDate: "desc" } }),
    db.seeraDeviationRecord.findMany({ where: { description: like }, take: 20, orderBy: { createdAt: "desc" } }),
    db.storedFile.findMany({ where: { entityType: { in: ["SeeraSop", "SeeraGrn", "SeeraBatchQc", "SeeraProductionBatch", "SeeraDeviationRecord", "SeeraManufacturingMaterial", "SeeraStockCount", "SeeraBom"] }, originalName: like, lifecycleStatus: "ACTIVE" }, take: 20, orderBy: { createdAt: "desc" } }),
  ]);
  const skus = matchedSkus;

  const skuIds = [...new Set([...boms.map((b) => b.productSkuId), ...sops.map((s) => s.productSkuId)])];
  const skuNames = skuIds.length ? new Map((await db.seeraSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, code: true, productName: true } })).map((s) => [s.id, s])) : new Map();

  return {
    query: q,
    batches: batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, status: b.status, qcStatus: b.qcStatus, date: b.date, group: "production" as const, section: "batches" as const })),
    productionOrders: productionOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, productionDate: o.productionDate, group: "production" as const, section: "orders" as const })),
    materials: materials.map((m) => ({ id: m.id, code: m.code, name: m.name, type: m.type, group: "materials" as const, section: "master" as const })),
    lots: lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, supplierLotRef: l.supplierLotRef, materialId: l.materialId, group: "materials" as const, section: "master" as const })),
    skus: skus.map((s) => ({ id: s.id, code: s.code, productName: s.productName, group: "formulations" as const, section: "bom" as const })),
    grns: grns.map((g) => ({ id: g.id, grnNumber: g.grnNumber, status: g.status, date: g.date, group: "warehouse" as const, section: "grn" as const })),
    vendors: vendors.map((v) => ({ id: v.id, code: v.code, legalName: v.legalName, group: "warehouse" as const, section: "grn" as const })),
    boms: boms.map((b) => ({ id: b.id, version: b.version, status: b.status, productSkuId: b.productSkuId, productName: skuNames.get(b.productSkuId)?.productName ?? b.productSkuId, group: "formulations" as const, section: "bom" as const })),
    sops: sops.map((s) => ({ id: s.id, version: s.version, status: s.status, productSkuId: s.productSkuId, productName: skuNames.get(s.productSkuId)?.productName ?? s.productSkuId, group: "formulations" as const, section: "sop" as const })),
    qc: qc.map((q2) => ({ id: q2.id, batchId: q2.batchId, parameter: q2.parameter, passFail: q2.passFail, group: "quality" as const, section: "queue" as const })),
    deviations: deviations.map((d) => ({ id: d.id, description: d.description, status: d.status, deviationType: d.deviationType, group: "cost" as const, section: "deviation" as const })),
    documents: documents.map((f) => ({ id: f.id, originalName: f.originalName, entityType: f.entityType, entityId: f.entityId, mimeType: f.mimeType })),
  };
}

export type ManufacturingSearchResult = Awaited<ReturnType<typeof manufacturingSearch>>;
