import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Final Master Revision (Part 1, 22-Aug): the 7 real Seera/Yuva/Shine Plus SKUs shipped with an
// MRP=₹1 placeholder — flagged in the prior closure pass and left untouched pending real
// Founder-supplied end-customer MRP. This is the one governed correction path for it. Deliberately
// narrow (by SKU code, Founder/Admin-only, fully audited with before/after) rather than a general
// catalog-editing surface — there is no product-master UI in this app today, and building one is
// out of scope of a single named data correction. `unitsPerCase` is corrected in the same call
// where the Founder's real pack size disagrees with what's on file (e.g. Powder 1kg was recorded
// as 1 unit/case, but the real pack is 25 PC/BAG) — it already exists on SeeraSku and is exactly
// the packFactor the Executive-order UOM feature (Part 2) reads.
export async function correctSkuMasterFields(
  prisma: PrismaClient,
  actorId: string,
  input: { skuCode: string; mrp?: number; unitsPerCase?: number; reason: string },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const sku = await prisma.seeraSku.findFirst({ where: { code: input.skuCode } });
  if (!sku) throw new FoundationError("SKU_NOT_FOUND", `SKU ${input.skuCode} not found`, 404);
  if (input.mrp != null && input.mrp <= 0)
    throw new FoundationError("INVALID_MRP", "MRP must be a positive value", 400);
  if (input.unitsPerCase != null && input.unitsPerCase <= 0)
    throw new FoundationError("INVALID_UNITS_PER_CASE", "unitsPerCase must be a positive value", 400);
  const data: Prisma.SeeraSkuUpdateInput = {};
  if (input.mrp != null) data.mrp = input.mrp;
  if (input.unitsPerCase != null) data.unitsPerCase = input.unitsPerCase;
  if (Object.keys(data).length === 0)
    throw new FoundationError("NO_FIELDS_TO_UPDATE", "At least one field must be supplied", 400);
  const before = { mrp: sku.mrp.toString(), unitsPerCase: sku.unitsPerCase };
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.seeraSku.update({ where: { id: sku.id }, data });
    await recordAudit(tx, {
      actorId,
      action: "sku_master.corrected",
      entityType: "SeeraSku",
      entityId: sku.id,
      reason: input.reason,
      beforeState: before,
      afterState: { mrp: result.mrp.toString(), unitsPerCase: result.unitsPerCase },
    });
    return result;
  });
  return updated;
}
