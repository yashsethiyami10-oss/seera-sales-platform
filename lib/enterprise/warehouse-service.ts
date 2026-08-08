import { z } from "zod";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireEnterprisePrincipal } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";

const movementInput = z.object({
  movementType: z.enum([
    "PURCHASE_RECEIPT", "QUALITY_TRANSFER", "PUTAWAY", "INTERNAL_TRANSFER",
    "PRODUCTION_RESERVATION", "PRODUCTION_ISSUE", "PRODUCTION_CONSUMPTION",
    "PRODUCTION_RETURN", "FINISHED_GOODS_RECEIPT", "QUALITY_HOLD",
    "QUALITY_RELEASE", "QUALITY_REJECTION", "PURCHASE_RETURN",
    "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "DAMAGE", "EXPIRY", "REWORK_TRANSFER",
  ]),
  sourceWarehouseId: z.string().cuid().optional(),
  sourceBinId: z.string().cuid().optional(),
  destinationWarehouseId: z.string().cuid().optional(),
  destinationBinId: z.string().cuid().optional(),
  variantId: z.string().cuid(),
  quantity: z.coerce.number().positive(),
  unitOfMeasure: z.string().min(1).max(30),
  businessReferenceType: z.string().min(1).max(80),
  businessReferenceId: z.string().min(1).max(191),
  businessReferenceNumber: z.string().max(100).optional(),
  reasonCode: z.string().max(80).optional(),
});

export async function createWarehouseMovement(input: unknown) {
  const data = movementInput.parse(input);
  const permission = data.movementType.startsWith("ADJUSTMENT")
    ? PERMISSIONS.ENTERPRISE_WAREHOUSE_ADJUST
    : data.movementType === "PRODUCTION_CONSUMPTION"
      ? PERMISSIONS.ENTERPRISE_WAREHOUSE_CONSUME
      : PERMISSIONS.ENTERPRISE_WAREHOUSE_TRANSFER;
  const principal = await requireEnterprisePrincipal(permission, "ENTERPRISE_WAREHOUSE_ENABLED");
  if (!data.sourceWarehouseId && !data.destinationWarehouseId) throw new AppError("A source or destination warehouse is required");
  if (["ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "DAMAGE", "EXPIRY"].includes(data.movementType) && !data.reasonCode) {
    throw new AppError("A reason code is required");
  }
  return enterpriseTransaction(async (tx) => {
    const warehouseIds = [...new Set([data.sourceWarehouseId, data.destinationWarehouseId].filter(Boolean) as string[])];
    if (await tx.warehouse.count({ where: { id: { in: warehouseIds }, active: true } }) !== warehouseIds.length) {
      throw new AppError("Warehouse reference is invalid");
    }
    if (!(await tx.productVariant.findUnique({ where: { id: data.variantId } }))) throw new AppError("Material reference is invalid");
    const movementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "WAREHOUSE_MOVEMENT", "WM");
    const correlationId = crypto.randomUUID();
    const entity = await tx.enterpriseWarehouseMovement.create({
      data: { ...data, organizationKey: principal.organizationKey, movementNumber, actorId: principal.id, correlationId },
    });
    // Extend the authoritative stock ledger rather than introducing a second balance.
    const warehouseId = data.destinationWarehouseId ?? data.sourceWarehouseId!;
    const sign = data.destinationWarehouseId && !data.sourceWarehouseId ? 1
      : !data.destinationWarehouseId && data.sourceWarehouseId ? -1
        : data.movementType === "ADJUSTMENT_INCREASE" ? 1 : -1;
    await tx.stockLedgerEntry.create({
      data: {
        movementNumber, movementType: data.movementType, warehouseId, variantId: data.variantId,
        quantity: Math.round(data.quantity * sign), referenceEntity: data.businessReferenceType,
        referenceId: data.businessReferenceId, referenceNumber: data.businessReferenceNumber ?? movementNumber,
        userId: principal.id, reason: data.reasonCode,
      },
    });
    const auditCorrelationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_warehouse", action: `WAREHOUSE_${data.movementType}`,
      entityType: "EnterpriseWarehouseMovement", entityId: entity.id,
      description: `Warehouse movement ${movementNumber} completed`,
      next: { movementNumber, movementType: data.movementType, quantity: data.quantity, correlationId },
    });
    return { entity, correlationId: auditCorrelationId };
  });
}

