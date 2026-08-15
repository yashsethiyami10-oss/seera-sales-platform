import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { createMaterial, updateMaterial, createLocation, createLot } from "@/lib/manufacturing/material-service";
import { createBomDraft, submitBomForReview, approveBom, activateBom, retireBom } from "@/lib/manufacturing/bom-service";
import { createSopDraft, approveSop, activateSop } from "@/lib/manufacturing/sop-service";
import { createPackagingBomDraft, approvePackagingBom, activatePackagingBom } from "@/lib/manufacturing/packaging-bom-service";
import { createProductionPlan, approveProductionPlan, cancelProductionPlan } from "@/lib/manufacturing/production-planning-service";
import { createProductionOrder, approveProductionOrder, reserveOrderMaterials, cancelProductionOrder } from "@/lib/manufacturing/production-order-service";
import { issueToProduction, returnUnusedMaterial, recordDailyProduction, recordActualConsumption } from "@/lib/manufacturing/batch-execution-service";
import { createQcTemplate, recordBatchQc, holdBatch, failBatch, releaseBatch } from "@/lib/manufacturing/qc-service";
import { recordWastage } from "@/lib/manufacturing/wastage-service";
import { createDeviation, reviewDeviation, closeDeviation } from "@/lib/manufacturing/deviation-service";
import { createGrn, postGrn, grnQcRelease, supplierMaterialReturn } from "@/lib/manufacturing/grn-service";
import { transferStock, adjustStock, startStockCount, recordStockCountLine, approveStockCount } from "@/lib/manufacturing/stores-service";
import { computeBatchCost, postCogsForBatch, postWastageExpense } from "@/lib/manufacturing/costing-service";
import { setCompanyInventoryMode } from "@/lib/manufacturing/company-stock-service";
import { createMachine, updateMachine, createShift, updateShift } from "@/lib/manufacturing/machine-shift-service";

const unit = z.enum(["KG", "GRAM", "LITRE", "ML", "PCS", "ROLL", "BOX", "BAG", "CARTON", "DRUM", "CAN", "METER", "OTHER"]);
const materialType = z.enum(["RAW_MATERIAL", "PACKAGING_MATERIAL", "SEMI_FINISHED", "FINISHED_GOODS", "CONSUMABLE", "SCRAP"]);
const bomLine = z.object({ materialId: z.string(), requiredQuantity: z.number(), unit, canonicalQuantity: z.number(), lossAllowancePct: z.number().optional(), stage: z.string().optional(), isRequired: z.boolean().optional(), sequence: z.number().optional(), notes: z.string().optional() });

const ACTIONS = [
  "create-material", "update-material", "create-location", "create-lot",
  "create-bom-draft", "submit-bom-for-review", "approve-bom", "activate-bom", "retire-bom",
  "create-sop-draft", "approve-sop", "activate-sop",
  "create-packaging-bom-draft", "approve-packaging-bom", "activate-packaging-bom",
  "create-production-plan", "approve-production-plan", "cancel-production-plan",
  "create-production-order", "approve-production-order", "reserve-order-materials", "cancel-production-order",
  "issue-to-production", "return-unused-material", "record-daily-production", "record-actual-consumption",
  "create-qc-template", "record-batch-qc", "hold-batch", "fail-batch", "release-batch",
  "record-wastage", "post-wastage-expense",
  "create-deviation", "review-deviation", "close-deviation",
  "create-grn", "post-grn", "grn-qc-release", "supplier-material-return",
  "transfer-stock", "adjust-stock", "start-stock-count", "record-stock-count-line", "approve-stock-count",
  "compute-batch-cost", "post-cogs-for-batch",
  "set-company-inventory-mode",
  "create-machine", "update-machine", "create-shift", "update-shift",
] as const;

const body = z.object({ action: z.enum(ACTIONS), payload: z.record(z.unknown()) });

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`manufacturing-operations:${user.id}`, 60, 60_000);
    const { action, payload } = body.parse(await request.json());
    let result: unknown;

    switch (action) {
      case "create-material":
        result = await createMaterial(prisma, user.id, z.object({ code: z.string(), name: z.string(), type: materialType, category: z.string().optional(), baseUnit: unit, purchaseUnit: unit.optional(), issueUnit: unit.optional(), conversionFactor: z.number().optional(), reorderLevel: z.number().optional(), minStock: z.number().optional(), maxStock: z.number().optional(), leadTimeDays: z.number().optional(), lotTracked: z.boolean().optional(), expiryTracked: z.boolean().optional(), qcRequired: z.boolean().optional(), notes: z.string().optional() }).parse(payload));
        break;
      case "update-material": {
        const v = z.object({ materialId: z.string() }).and(z.object({ name: z.string().optional(), category: z.string().optional(), reorderLevel: z.number().optional(), minStock: z.number().optional(), maxStock: z.number().optional(), leadTimeDays: z.number().optional(), isActive: z.boolean().optional(), notes: z.string().optional() })).parse(payload);
        result = await updateMaterial(prisma, user.id, v.materialId, v);
        break;
      }
      case "create-location":
        result = await createLocation(prisma, user.id, z.object({ code: z.string(), name: z.string(), type: z.string(), notes: z.string().optional() }).parse(payload));
        break;
      case "create-lot":
        result = await createLot(prisma, user.id, z.object({ lotNumber: z.string(), materialId: z.string(), supplierLotRef: z.string().optional(), vendorId: z.string().optional(), manufactureDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional(), notes: z.string().optional() }).parse(payload));
        break;
      case "create-bom-draft":
        result = await createBomDraft(prisma, user.id, z.object({ productSkuId: z.string(), standardBatchSize: z.number(), batchUnit: unit, expectedOutput: z.number().optional(), expectedYieldPct: z.number().optional(), sopId: z.string().optional(), notes: z.string().optional(), lines: z.array(bomLine).min(1) }).parse(payload));
        break;
      case "submit-bom-for-review":
        result = await submitBomForReview(prisma, user.id, z.object({ bomId: z.string() }).parse(payload).bomId);
        break;
      case "approve-bom":
        result = await approveBom(prisma, user.id, z.object({ bomId: z.string() }).parse(payload).bomId);
        break;
      case "activate-bom":
        result = await activateBom(prisma, user.id, z.object({ bomId: z.string() }).parse(payload).bomId);
        break;
      case "retire-bom":
        result = await retireBom(prisma, user.id, z.object({ bomId: z.string() }).parse(payload).bomId);
        break;
      case "create-sop-draft":
        result = await createSopDraft(prisma, user.id, z.object({ productSkuId: z.string(), effectiveFrom: z.coerce.date(), documentFileId: z.string().optional(), linkedBomId: z.string().optional(), notes: z.string().optional() }).parse(payload));
        break;
      case "approve-sop":
        result = await approveSop(prisma, user.id, z.object({ sopId: z.string() }).parse(payload).sopId);
        break;
      case "activate-sop":
        result = await activateSop(prisma, user.id, z.object({ sopId: z.string() }).parse(payload).sopId);
        break;
      case "create-packaging-bom-draft":
        result = await createPackagingBomDraft(prisma, user.id, z.object({ productSkuId: z.string(), packLevel: z.enum(["PRIMARY", "SECONDARY", "TERTIARY"]).optional(), unitsPerParent: z.number().optional(), effectiveFrom: z.coerce.date(), notes: z.string().optional(), lines: z.array(z.object({ materialId: z.string(), quantityPerUnit: z.number(), unit, canonicalQuantity: z.number(), notes: z.string().optional() })).min(1) }).parse(payload));
        break;
      case "approve-packaging-bom":
        result = await approvePackagingBom(prisma, user.id, z.object({ packagingBomId: z.string() }).parse(payload).packagingBomId);
        break;
      case "activate-packaging-bom":
        result = await activatePackagingBom(prisma, user.id, z.object({ packagingBomId: z.string() }).parse(payload).packagingBomId);
        break;
      case "create-production-plan":
        result = await createProductionPlan(prisma, user.id, z.object({ period: z.enum(["DAY", "WEEK", "CUSTOM"]), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), idempotencyKey: z.string(), lines: z.array(z.object({ productSkuId: z.string(), targetQuantity: z.number(), targetBatches: z.number().int(), requiredDate: z.coerce.date(), priority: z.string().optional(), notes: z.string().optional() })).min(1) }).parse(payload));
        break;
      case "approve-production-plan":
        result = await approveProductionPlan(prisma, user.id, z.object({ planId: z.string() }).parse(payload).planId);
        break;
      case "cancel-production-plan": {
        const v = z.object({ planId: z.string(), reason: z.string() }).parse(payload);
        result = await cancelProductionPlan(prisma, user.id, v.planId, v.reason);
        break;
      }
      case "create-production-order":
        result = await createProductionOrder(prisma, user.id, z.object({ productSkuId: z.string(), plannedBatches: z.number().int(), plannedOutput: z.number(), productionDate: z.coerce.date(), shiftId: z.string().optional(), machineId: z.string().optional(), supervisorId: z.string().optional(), priority: z.string().optional(), planLineId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "approve-production-order":
        result = await approveProductionOrder(prisma, user.id, z.object({ orderId: z.string() }).parse(payload).orderId);
        break;
      case "reserve-order-materials":
        result = await reserveOrderMaterials(prisma, user.id, z.object({ orderId: z.string() }).parse(payload).orderId);
        break;
      case "cancel-production-order": {
        const v = z.object({ orderId: z.string(), reason: z.string() }).parse(payload);
        result = await cancelProductionOrder(prisma, user.id, v.orderId, v.reason);
        break;
      }
      case "issue-to-production":
        result = await issueToProduction(prisma, user.id, z.object({ productionOrderId: z.string(), materialId: z.string(), lotId: z.string().optional(), quantity: z.number(), unit: z.string(), canonicalQuantity: z.number(), fromLocationId: z.string(), toLocationId: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "return-unused-material":
        result = await returnUnusedMaterial(prisma, user.id, z.object({ productionOrderId: z.string(), materialId: z.string(), lotId: z.string().optional(), quantity: z.number(), unit: z.string(), canonicalQuantity: z.number(), toLocationId: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "record-daily-production":
        result = await recordDailyProduction(prisma, user.id, z.object({ productionOrderId: z.string(), date: z.coerce.date(), batchCount: z.number().int(), actualOutputQuantity: z.number(), outputUnit: z.string(), shiftId: z.string().optional(), machineId: z.string().optional(), supervisorId: z.string().optional(), operatorIds: z.array(z.string()).optional(), finishedGoodsLocationId: z.string(), rawStoreLocationId: z.string(), packagingStoreLocationId: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "record-actual-consumption":
        result = await recordActualConsumption(prisma, user.id, z.object({ batchId: z.string(), materialId: z.string(), actualQuantity: z.number(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "create-qc-template":
        result = await createQcTemplate(prisma, user.id, z.object({ productSkuId: z.string(), version: z.number().int(), parameter: z.string(), unit: z.string().optional(), minValue: z.number().optional(), maxValue: z.number().optional(), targetValue: z.number().optional(), isRequired: z.boolean().optional(), method: z.string().optional(), sequence: z.number().optional() }).parse(payload));
        break;
      case "record-batch-qc":
        result = await recordBatchQc(prisma, user.id, z.object({ batchId: z.string(), templateId: z.string().optional(), parameter: z.string(), unit: z.string().optional(), observedValue: z.number().optional(), remarks: z.string().optional(), documentFileId: z.string().optional() }).parse(payload));
        break;
      case "hold-batch": {
        const v = z.object({ batchId: z.string(), reason: z.string() }).parse(payload);
        result = await holdBatch(prisma, user.id, v.batchId, v.reason);
        break;
      }
      case "fail-batch": {
        const v = z.object({ batchId: z.string(), reason: z.string() }).parse(payload);
        result = await failBatch(prisma, user.id, v.batchId, v.reason);
        break;
      }
      case "release-batch":
        result = await releaseBatch(prisma, user.id, z.object({ batchId: z.string() }).parse(payload).batchId);
        break;
      case "record-wastage":
        result = await recordWastage(prisma, user.id, z.object({ productionOrderId: z.string().optional(), batchId: z.string().optional(), materialId: z.string().optional(), wastageType: z.enum(["PROCESS_LOSS", "RAW_MATERIAL_WASTAGE", "PACKAGING_WASTAGE", "SPILLAGE", "DAMAGED_PACK", "QC_SAMPLE", "SCRAP", "OTHER"]), expectedQuantity: z.number().optional(), actualQuantity: z.number().optional(), wasteQuantity: z.number(), unit: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "post-wastage-expense":
        result = await postWastageExpense(prisma, user.id, z.object({ wastageRecordId: z.string() }).parse(payload).wastageRecordId);
        break;
      case "create-deviation":
        result = await createDeviation(prisma, user.id, z.object({ batchId: z.string().optional(), productionOrderId: z.string().optional(), deviationType: z.enum(["MATERIAL", "PROCESS", "OUTPUT", "PACKAGING", "QC", "OTHER"]), description: z.string(), impact: z.string().optional(), immediateAction: z.string().optional(), responsibleUserId: z.string().optional(), documentFileId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "review-deviation":
        result = await reviewDeviation(prisma, user.id, z.object({ deviationId: z.string() }).parse(payload).deviationId);
        break;
      case "close-deviation": {
        const v = z.object({ deviationId: z.string(), reason: z.string() }).parse(payload);
        result = await closeDeviation(prisma, user.id, v.deviationId, v.reason);
        break;
      }
      case "create-grn":
        result = await createGrn(prisma, user.id, z.object({ date: z.coerce.date(), vendorId: z.string(), purchaseRef: z.string().optional(), idempotencyKey: z.string(), lines: z.array(z.object({ materialId: z.string(), supplierLotRef: z.string().optional(), quantity: z.number(), unit, canonicalQuantity: z.number(), acceptedQuantity: z.number(), rejectedQuantity: z.number().optional(), unitCost: z.number().optional(), manufactureDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional(), locationId: z.string() })).min(1) }).parse(payload));
        break;
      case "post-grn":
        result = await postGrn(prisma, user.id, z.object({ grnId: z.string() }).parse(payload).grnId);
        break;
      case "grn-qc-release": {
        const v = z.object({ grnLineId: z.string(), decision: z.enum(["PASSED", "FAILED"]) }).parse(payload);
        result = await grnQcRelease(prisma, user.id, v.grnLineId, v.decision);
        break;
      }
      case "supplier-material-return":
        result = await supplierMaterialReturn(prisma, user.id, z.object({ materialId: z.string(), lotId: z.string().optional(), quantity: z.number(), unit: z.string(), canonicalQuantity: z.number(), fromLocationId: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "transfer-stock":
        result = await transferStock(prisma, user.id, z.object({ materialId: z.string(), lotId: z.string().optional(), quantity: z.number(), unit: z.string(), canonicalQuantity: z.number(), fromLocationId: z.string(), toLocationId: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "adjust-stock":
        result = await adjustStock(prisma, user.id, z.object({ materialId: z.string(), lotId: z.string().optional(), direction: z.enum(["INCREASE", "DECREASE"]), quantity: z.number(), unit: z.string(), canonicalQuantity: z.number(), locationId: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "start-stock-count":
        result = await startStockCount(prisma, user.id, z.object({ locationId: z.string(), date: z.coerce.date(), idempotencyKey: z.string(), materialIds: z.array(z.string()).min(1) }).parse(payload));
        break;
      case "record-stock-count-line": {
        const v = z.object({ lineId: z.string(), physicalQuantity: z.number() }).parse(payload);
        result = await recordStockCountLine(prisma, user.id, v.lineId, v.physicalQuantity);
        break;
      }
      case "approve-stock-count":
        result = await approveStockCount(prisma, user.id, z.object({ countId: z.string() }).parse(payload).countId);
        break;
      case "compute-batch-cost":
        result = await computeBatchCost(prisma, user.id, z.object({ batchId: z.string() }).parse(payload).batchId);
        break;
      case "post-cogs-for-batch":
        result = await postCogsForBatch(prisma, user.id, z.object({ batchId: z.string() }).parse(payload).batchId);
        break;
      case "set-company-inventory-mode": {
        const v = z.object({ mode: z.enum(["LEGACY_UNBOUNDED", "MANUFACTURING_GOVERNED"]), reason: z.string() }).parse(payload);
        result = await setCompanyInventoryMode(prisma, user.id, v.mode, v.reason);
        break;
      }
      case "create-machine":
        result = await createMachine(prisma, user.id, z.object({ code: z.string(), name: z.string(), type: z.string().optional(), locationId: z.string().optional(), capacity: z.string().optional(), notes: z.string().optional() }).parse(payload));
        break;
      case "update-machine": {
        const v = z.object({ machineId: z.string() }).and(z.object({ name: z.string().optional(), type: z.string().optional(), locationId: z.string().optional(), capacity: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional() })).parse(payload);
        result = await updateMachine(prisma, user.id, v.machineId, v);
        break;
      }
      case "create-shift":
        result = await createShift(prisma, user.id, z.object({ name: z.string(), startTime: z.string(), endTime: z.string() }).parse(payload));
        break;
      case "update-shift": {
        const v = z.object({ shiftId: z.string() }).and(z.object({ name: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), isActive: z.boolean().optional() })).parse(payload);
        result = await updateShift(prisma, user.id, v.shiftId, v);
        break;
      }
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
