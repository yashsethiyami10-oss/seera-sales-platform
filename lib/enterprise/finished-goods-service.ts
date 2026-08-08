import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireEnterprisePrincipal } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";

/**
 * Milestone 7 — Manufacturing (Including Procurement). The one genuinely
 * missing piece of transactional logic identified during the architecture
 * pass: recordQualityDecision (operations-services.ts) already moves a
 * batch to qualityStatus/status "RELEASED", but nothing previously made
 * that stock sellable — createWarehouseMovement (warehouse-service.ts)
 * only ever wrote StockLedgerEntry, never Inventory.quantity. This closes
 * that bridge: a released batch, transferred exactly once, becomes real
 * stock in the same Inventory/StockHistory model finished goods and (per
 * the approved architecture decision) raw materials now both share.
 *
 * Gated on ENTERPRISE_WAREHOUSE_TRANSFER (not a new permission) — QC
 * releases the batch, the warehouse then physically receives it into
 * stock, matching the existing division of duties between Quality
 * Inspector and Warehouse Manager.
 */
export async function transferReleasedBatchToInventory(batchId: string) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_WAREHOUSE_TRANSFER, "ENTERPRISE_WAREHOUSE_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const batch = await tx.enterpriseBatch.findFirst({ where: { id: batchId, organizationKey: principal.organizationKey } });
    if (!batch) throw new NotFoundError("Batch");
    if (batch.status !== "RELEASED") throw new ForbiddenError(`Only a QC-released batch can be transferred to Finished Goods (this batch is ${batch.status.toLowerCase()})`);
    if (batch.transferredToInventoryAt) throw new AppError("This batch has already been transferred to Finished Goods inventory", 409, "ALREADY_TRANSFERRED");
    if (!batch.actualQuantity || Number(batch.actualQuantity) <= 0) throw new AppError("Batch has no recorded actual quantity to transfer");
    if (!batch.warehouseId) throw new AppError("Batch has no warehouse assigned");

    const quantity = Math.round(Number(batch.actualQuantity));
    const movementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "WAREHOUSE_MOVEMENT", "WM");
    const movement = await tx.enterpriseWarehouseMovement.create({
      data: {
        organizationKey: principal.organizationKey, movementNumber, movementType: "FINISHED_GOODS_RECEIPT",
        destinationWarehouseId: batch.warehouseId, variantId: batch.productVariantId, quantity,
        unitOfMeasure: batch.unitOfMeasure, businessReferenceType: "EnterpriseBatch", businessReferenceId: batch.id,
        businessReferenceNumber: batch.batchNumber, actorId: principal.id, correlationId: crypto.randomUUID(),
      },
    });
    await tx.stockLedgerEntry.create({
      data: {
        movementNumber, movementType: "FINISHED_GOODS_RECEIPT", warehouseId: batch.warehouseId, variantId: batch.productVariantId,
        quantity, referenceEntity: "EnterpriseBatch", referenceId: batch.id, referenceNumber: batch.batchNumber, userId: principal.id,
        reason: "QC-released batch transferred to Finished Goods inventory",
      },
    });

    const inventory = await tx.inventory.upsert({
      where: { variantId: batch.productVariantId },
      update: { quantity: { increment: quantity } },
      create: { variantId: batch.productVariantId, quantity },
    });
    await tx.stockHistory.create({
      data: {
        inventoryId: inventory.id, change: quantity, reason: "FINISHED_GOODS_PRODUCTION",
        changedById: principal.id, note: `Batch ${batch.batchNumber} released and transferred to inventory`,
      },
    });

    const updatedBatch = await tx.enterpriseBatch.update({
      where: { id: batch.id },
      data: { finishedGoodsMovementId: movement.id, transferredToInventoryAt: new Date() },
    });

    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finished_goods", action: "FINISHED_GOODS_TRANSFERRED", entityType: "EnterpriseBatch",
      entityId: batch.id, description: `Batch ${batch.batchNumber}: ${quantity} ${batch.unitOfMeasure} transferred to Finished Goods inventory`,
      next: { movementId: movement.id, movementNumber, variantId: batch.productVariantId, quantity, warehouseId: batch.warehouseId },
    });
    return { entity: updatedBatch, inventory, correlationId };
  });
}
