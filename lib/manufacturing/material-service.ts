import type { ManufacturingMaterialType, ManufacturingUnit, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { materialStockPosition } from "./ledger-service";

export async function createMaterial(
  db: PrismaClient,
  actorId: string,
  input: { code: string; name: string; type: ManufacturingMaterialType; category?: string; baseUnit: ManufacturingUnit; purchaseUnit?: ManufacturingUnit; issueUnit?: ManufacturingUnit; conversionFactor?: number; preferredVendorId?: string; hsn?: string; taxRate?: number; reorderLevel?: number; minStock?: number; maxStock?: number; leadTimeDays?: number; defaultLocationId?: string; lotTracked?: boolean; expiryTracked?: boolean; qcRequired?: boolean; notes?: string },
) {
  await authorize(db, { actorId, permission: "mfg_material:manage" });
  const existing = await db.seeraManufacturingMaterial.findUnique({ where: { code: input.code } });
  if (existing) throw new FoundationError("MATERIAL_CODE_EXISTS", "A material with this code already exists", 409);
  const material = await db.seeraManufacturingMaterial.create({ data: { ...input, conversionFactor: input.conversionFactor ?? 1, createdById: actorId } });
  await recordAudit(db, { actorId, action: "mfg.material.created", entityType: "SeeraManufacturingMaterial", entityId: material.id, afterState: { code: material.code, type: material.type } });
  return material;
}

export async function updateMaterial(db: PrismaClient, actorId: string, materialId: string, input: Partial<{ name: string; category: string; reorderLevel: number; minStock: number; maxStock: number; leadTimeDays: number; isActive: boolean; notes: string }>) {
  await authorize(db, { actorId, permission: "mfg_material:manage" });
  const before = await db.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: materialId } });
  const after = await db.seeraManufacturingMaterial.update({ where: { id: materialId }, data: input });
  await recordAudit(db, { actorId, action: "mfg.material.updated", entityType: "SeeraManufacturingMaterial", entityId: materialId, beforeState: { isActive: before.isActive }, afterState: { isActive: after.isActive } });
  return after;
}

export async function listMaterials(db: PrismaClient, actorId: string, type?: ManufacturingMaterialType) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraManufacturingMaterial.findMany({ where: { type, isActive: true }, orderBy: { name: "asc" } });
}

// Material 360 (spec §55): current stock + locations/lots + consumption
// history + reorder signal, one round trip.
export async function material360(db: PrismaClient, actorId: string, materialId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const [material, position, lots, recentMovements] = await Promise.all([
    db.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: materialId } }),
    materialStockPosition(db, materialId),
    db.seeraManufacturingLot.findMany({ where: { materialId }, orderBy: { expiryDate: "asc" }, take: 50 }),
    db.seeraManufacturingMovement.findMany({ where: { materialId }, orderBy: { occurredAt: "desc" }, take: 30 }),
  ]);
  const belowReorder = material.reorderLevel != null && position.available <= Number(material.reorderLevel);
  return { material, position, lots, recentMovements: recentMovements.map((m) => ({ ...m, quantity: Number(m.quantity), canonicalQuantity: Number(m.canonicalQuantity) })), belowReorder };
}

export async function lowStockMaterials(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const materials = await db.seeraManufacturingMaterial.findMany({ where: { isActive: true, reorderLevel: { not: null } } });
  const rows = await Promise.all(materials.map(async (m) => ({ material: m, position: await materialStockPosition(db, m.id) })));
  return rows.filter((r) => r.position.available <= Number(r.material.reorderLevel));
}

export async function nearExpiryMaterials(db: PrismaClient, actorId: string, withinDays = 30) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 86_400_000);
  const lots = await db.seeraManufacturingLot.findMany({ where: { expiryDate: { not: null, lte: horizon } }, orderBy: { expiryDate: "asc" } });
  return lots.map((l) => ({ ...l, expired: l.expiryDate! < now, daysRemaining: Math.ceil((l.expiryDate!.getTime() - now.getTime()) / 86_400_000) }));
}

// Money Desk 2.0 (Rule 7): the detergent-cake raw-material set the Founder specified must be
// selectable from Money Desk's Raw Material Purchase flow. Idempotent (upsert-by-code, same
// pattern as seedDefaultChartOfAccounts) — safe to call again if the list grows. Reuses the
// existing SeeraManufacturingMaterial master; never a duplicate/parallel material list.
const DETERGENT_CAKE_RAW_MATERIALS: { code: string; name: string; baseUnit: ManufacturingUnit }[] = [
  { code: "RM-SLURRY", name: "Slurry", baseUnit: "KG" },
  { code: "RM-SODA-ASH", name: "Soda Ash", baseUnit: "KG" },
  { code: "RM-DOLOMITE", name: "Dolomite", baseUnit: "KG" },
  { code: "RM-CHINA-CLAY", name: "China Clay", baseUnit: "KG" },
  { code: "RM-AOS", name: "AOS", baseUnit: "KG" },
  { code: "RM-SLES", name: "SLES", baseUnit: "KG" },
  { code: "RM-POLYMER", name: "Polymer", baseUnit: "KG" },
  { code: "RM-SODIUM-SILICATE", name: "Sodium Silicate", baseUnit: "KG" },
  { code: "RM-COLOUR", name: "Colour", baseUnit: "KG" },
  { code: "RM-PERFUME", name: "Perfume", baseUnit: "LITRE" },
  { code: "RM-CAUSTIC", name: "Caustic", baseUnit: "KG" },
  { code: "RM-SALT", name: "Salt", baseUnit: "KG" },
  { code: "RM-COLOUR-GRADIENTS", name: "Colour Gradients", baseUnit: "KG" },
  { code: "RM-CBSX", name: "CBSX", baseUnit: "KG" },
];

export async function seedDetergentCakeMaterials(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_material:manage" });
  const results = [];
  for (const m of DETERGENT_CAKE_RAW_MATERIALS) {
    results.push(
      await db.seeraManufacturingMaterial.upsert({
        where: { code: m.code },
        update: {},
        create: { code: m.code, name: m.name, type: "RAW_MATERIAL", category: "Detergent Cake", baseUnit: m.baseUnit, purchaseUnit: m.baseUnit, issueUnit: m.baseUnit, conversionFactor: 1, createdById: actorId },
      }),
    );
  }
  await recordAudit(db, { actorId, action: "mfg.material.seeded", entityType: "SeeraManufacturingMaterial", entityId: "detergent-cake-set", afterState: { count: results.length } });
  return results;
}

// --- Locations --------------------------------------------------------------
// Idempotent default RAW_STORE location so Money Desk's location picker is never empty on a fresh
// deployment. Safe to call repeatedly; never creates a second store for the same code.
export async function seedDefaultManufacturingLocation(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_location:manage" });
  return db.seeraManufacturingLocation.upsert({
    where: { code: "RM-STORE-MAIN" },
    update: {},
    create: { code: "RM-STORE-MAIN", name: "Main Raw Material Store", type: "RAW_STORE" },
  });
}
export async function createLocation(db: PrismaClient, actorId: string, input: { code: string; name: string; type: string; notes?: string }) {
  await authorize(db, { actorId, permission: "mfg_location:manage" });
  const location = await db.seeraManufacturingLocation.create({ data: input as never });
  await recordAudit(db, { actorId, action: "mfg.location.created", entityType: "SeeraManufacturingLocation", entityId: location.id, afterState: input });
  return location;
}
export async function listLocations(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraManufacturingLocation.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

// --- Lots (FEFO/FIFO recommendation, spec §42) -------------------------------
export async function createLot(db: PrismaClient, actorId: string, input: { lotNumber: string; materialId: string; supplierLotRef?: string; vendorId?: string; manufactureDate?: Date; expiryDate?: Date; sourceGrnId?: string; notes?: string }) {
  await authorize(db, { actorId, permission: "mfg_grn:manage" });
  const existing = await db.seeraManufacturingLot.findUnique({ where: { lotNumber: input.lotNumber } });
  if (existing) return existing;
  return db.seeraManufacturingLot.create({ data: input });
}

// Recommend the lot to consume next: earliest expiry first if the material
// is expiry-tracked (FEFO), else earliest-received first (FIFO) — never a
// silent arbitrary pick (spec §42: "Store user should see recommended lot").
export async function recommendedLot(db: PrismaClient, materialId: string) {
  const material = await db.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: materialId } });
  const lots = await db.seeraManufacturingLot.findMany({ where: { materialId }, orderBy: material.expiryTracked ? { expiryDate: "asc" } : { receiptDate: "asc" } });
  for (const lot of lots) {
    const position = await materialStockPosition(db, materialId, lot.id);
    if (position.available > 0) return lot;
  }
  return null;
}
