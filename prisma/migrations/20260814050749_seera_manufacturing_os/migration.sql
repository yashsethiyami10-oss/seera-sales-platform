-- CreateEnum
CREATE TYPE "ManufacturingMaterialType" AS ENUM ('RAW_MATERIAL', 'PACKAGING_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOODS', 'CONSUMABLE', 'SCRAP');

-- CreateEnum
CREATE TYPE "ManufacturingUnit" AS ENUM ('KG', 'GRAM', 'LITRE', 'ML', 'PCS', 'ROLL', 'BOX', 'BAG', 'CARTON', 'DRUM', 'CAN', 'METER', 'OTHER');

-- CreateEnum
CREATE TYPE "ManufacturingLocationType" AS ENUM ('RAW_STORE', 'PACKAGING_STORE', 'PRODUCTION_FLOOR', 'WIP_AREA', 'QC_HOLD', 'FINISHED_STORE', 'REJECT_SCRAP', 'OTHER');

-- CreateEnum
CREATE TYPE "ManufacturingMovementType" AS ENUM ('PURCHASE_RECEIPT', 'OPENING_STOCK', 'TRANSFER_IN', 'TRANSFER_OUT', 'PRODUCTION_ISSUE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_RETURN', 'QC_HOLD', 'QC_RELEASE', 'REJECT', 'SCRAP', 'WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCK_COUNT_CORRECTION', 'SUPPLIER_RETURN');

-- CreateEnum
CREATE TYPE "ManufacturingMovementDirection" AS ENUM ('IN', 'OUT', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "PackLevel" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY');

-- CreateEnum
CREATE TYPE "ProductionPlanPeriod" AS ENUM ('DAY', 'WEEK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProductionPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_EXECUTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'READY', 'IN_PROGRESS', 'AWAITING_QC', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('IN_PROGRESS', 'AWAITING_QC', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchQcOverallStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'HOLD', 'RELEASED');

-- CreateEnum
CREATE TYPE "MaterialEventKind" AS ENUM ('ISSUE', 'RETURN', 'CONSUMPTION');

-- CreateEnum
CREATE TYPE "WastageType" AS ENUM ('PROCESS_LOSS', 'RAW_MATERIAL_WASTAGE', 'PACKAGING_WASTAGE', 'SPILLAGE', 'DAMAGED_PACK', 'QC_SAMPLE', 'SCRAP', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviationType" AS ENUM ('MATERIAL', 'PROCESS', 'OUTPUT', 'PACKAGING', 'QC', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviationStatus" AS ENUM ('OPEN', 'REVIEWED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockAdjustmentDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "ManufacturingApprovalCategory" AS ENUM ('BOM_ACTIVATION', 'SOP_ACTIVATION', 'LARGE_STOCK_ADJUSTMENT', 'MATERIAL_SUBSTITUTION', 'PRODUCTION_DEVIATION', 'QC_OVERRIDE', 'STOCK_COUNT_VARIANCE', 'REWORK');

-- CreateEnum
CREATE TYPE "CostConfidence" AS ENUM ('RELIABLE', 'PARTIAL', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "InventoryPartyType" ADD VALUE 'COMPANY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'MANUFACTURING_TRANSFORMATION';
ALTER TYPE "JournalSourceType" ADD VALUE 'MANUFACTURING_WASTAGE';

-- CreateTable
CREATE TABLE "seera_mfg_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ManufacturingMaterialType" NOT NULL,
    "category" TEXT,
    "baseUnit" "ManufacturingUnit" NOT NULL,
    "purchaseUnit" "ManufacturingUnit",
    "issueUnit" "ManufacturingUnit",
    "conversionFactor" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(14,4),
    "preferredVendorId" TEXT,
    "hsn" TEXT,
    "taxRate" DECIMAL(7,4),
    "reorderLevel" DECIMAL(14,3),
    "minStock" DECIMAL(14,3),
    "maxStock" DECIMAL(14,3),
    "leadTimeDays" INTEGER,
    "defaultLocationId" TEXT,
    "lotTracked" BOOLEAN NOT NULL DEFAULT true,
    "expiryTracked" BOOLEAN NOT NULL DEFAULT false,
    "qcRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_mfg_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ManufacturingLocationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "seera_mfg_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_lots" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierLotRef" TEXT,
    "vendorId" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "qcStatus" "BatchQcOverallStatus" NOT NULL DEFAULT 'PENDING',
    "sourceGrnId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_movements" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "movementType" "ManufacturingMovementType" NOT NULL,
    "direction" "ManufacturingMovementDirection" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,3) NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_boms" (
    "id" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "standardBatchSize" DECIMAL(14,3) NOT NULL,
    "batchUnit" "ManufacturingUnit" NOT NULL,
    "expectedOutput" DECIMAL(14,3),
    "expectedYieldPct" DECIMAL(6,3),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "sopId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_mfg_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_bom_lines" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requiredQuantity" DECIMAL(14,4) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,4) NOT NULL,
    "lossAllowancePct" DECIMAL(6,3),
    "stage" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "seera_mfg_bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_packaging_boms" (
    "id" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "packLevel" "PackLevel" NOT NULL DEFAULT 'PRIMARY',
    "version" INTEGER NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "unitsPerParent" DECIMAL(14,3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_packaging_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_packaging_bom_lines" (
    "id" TEXT NOT NULL,
    "packagingBomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(14,4) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "seera_mfg_packaging_bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_sops" (
    "id" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "documentFileId" TEXT,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "linkedBomId" TEXT,
    "supersedes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_production_plans" (
    "id" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "period" "ProductionPlanPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ProductionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_production_plan_lines" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "targetQuantity" DECIMAL(14,3) NOT NULL,
    "targetBatches" INTEGER NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,

    CONSTRAINT "seera_mfg_production_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_production_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "plannedBatches" INTEGER NOT NULL,
    "plannedOutput" DECIMAL(14,3) NOT NULL,
    "bomId" TEXT NOT NULL,
    "bomVersion" INTEGER NOT NULL,
    "packagingBomId" TEXT,
    "sopId" TEXT,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "machineId" TEXT,
    "supervisorId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "planLineId" TEXT,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_mfg_production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_production_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "bomVersion" INTEGER NOT NULL,
    "sopId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "machineId" TEXT,
    "supervisorId" TEXT,
    "operatorIds" TEXT[],
    "plannedQuantity" DECIMAL(14,3) NOT NULL,
    "actualOutputQuantity" DECIMAL(14,3),
    "yieldPct" DECIMAL(6,3),
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "qcStatus" "BatchQcOverallStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_mfg_production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_material_events" (
    "id" TEXT NOT NULL,
    "kind" "MaterialEventKind" NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "batchId" TEXT,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "theoreticalQuantity" DECIMAL(14,4),
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,4) NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "movementId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_material_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_finished_goods_receipts" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "locationId" TEXT NOT NULL,
    "qcStatus" "BatchQcOverallStatus" NOT NULL DEFAULT 'PENDING',
    "inventoryMovementId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_finished_goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_qc_templates" (
    "id" TEXT NOT NULL,
    "productSkuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parameter" TEXT NOT NULL,
    "unit" TEXT,
    "minValue" DECIMAL(14,4),
    "maxValue" DECIMAL(14,4),
    "targetValue" DECIMAL(14,4),
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "method" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "seera_mfg_qc_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_batch_qc" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "templateId" TEXT,
    "parameter" TEXT NOT NULL,
    "unit" TEXT,
    "observedValue" DECIMAL(14,4),
    "passFail" BOOLEAN,
    "remarks" TEXT,
    "testerId" TEXT NOT NULL,
    "sampleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_batch_qc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_wastage_records" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "batchId" TEXT,
    "materialId" TEXT,
    "wastageType" "WastageType" NOT NULL,
    "expectedQuantity" DECIMAL(14,4),
    "actualQuantity" DECIMAL(14,4),
    "wasteQuantity" DECIMAL(14,4) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "approvalId" TEXT,
    "movementId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_wastage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_deviation_records" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "productionOrderId" TEXT,
    "deviationType" "DeviationType" NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT,
    "immediateAction" TEXT,
    "responsibleUserId" TEXT,
    "status" "DeviationStatus" NOT NULL DEFAULT 'OPEN',
    "documentFileId" TEXT,
    "actorId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_deviation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_grns" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseRef" TEXT,
    "status" "GrnStatus" NOT NULL DEFAULT 'DRAFT',
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_grn_lines" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierLotRef" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,3) NOT NULL,
    "acceptedQuantity" DECIMAL(14,3) NOT NULL,
    "rejectedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,4),
    "internalLotId" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "locationId" TEXT NOT NULL,
    "qcStatus" "BatchQcOverallStatus" NOT NULL DEFAULT 'PENDING',
    "documentFileId" TEXT,

    CONSTRAINT "seera_mfg_grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_stock_transfers" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,3) NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_stock_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "direction" "StockAdjustmentDirection" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "ManufacturingUnit" NOT NULL,
    "canonicalQuantity" DECIMAL(14,3) NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_stock_counts" (
    "id" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_stock_count_lines" (
    "id" TEXT NOT NULL,
    "countSessionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "systemQuantity" DECIMAL(14,3) NOT NULL,
    "physicalQuantity" DECIMAL(14,3) NOT NULL,
    "varianceQuantity" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "adjustmentMovementId" TEXT,

    CONSTRAINT "seera_mfg_stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_machines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "locationId" TEXT,
    "capacity" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "seera_mfg_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "seera_mfg_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_approval_policies" (
    "id" TEXT NOT NULL,
    "category" "ManufacturingApprovalCategory" NOT NULL,
    "thresholdAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_mfg_approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_mfg_batch_costs" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rawMaterialCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(16,4),
    "confidence" "CostConfidence" NOT NULL DEFAULT 'UNAVAILABLE',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_batch_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_materials_code_key" ON "seera_mfg_materials"("code");

-- CreateIndex
CREATE INDEX "seera_mfg_materials_type_isActive_idx" ON "seera_mfg_materials"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_locations_code_key" ON "seera_mfg_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_lots_lotNumber_key" ON "seera_mfg_lots"("lotNumber");

-- CreateIndex
CREATE INDEX "seera_mfg_lots_materialId_expiryDate_idx" ON "seera_mfg_lots"("materialId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_movements_idempotencyKey_key" ON "seera_mfg_movements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_movements_materialId_lotId_direction_occurredAt_idx" ON "seera_mfg_movements"("materialId", "lotId", "direction", "occurredAt");

-- CreateIndex
CREATE INDEX "seera_mfg_movements_sourceType_sourceId_idx" ON "seera_mfg_movements"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "seera_mfg_movements_toLocationId_direction_idx" ON "seera_mfg_movements"("toLocationId", "direction");

-- CreateIndex
CREATE INDEX "seera_mfg_boms_productSkuId_status_idx" ON "seera_mfg_boms"("productSkuId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_boms_productSkuId_version_key" ON "seera_mfg_boms"("productSkuId", "version");

-- CreateIndex
CREATE INDEX "seera_mfg_bom_lines_bomId_idx" ON "seera_mfg_bom_lines"("bomId");

-- CreateIndex
CREATE INDEX "seera_mfg_bom_lines_materialId_idx" ON "seera_mfg_bom_lines"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_packaging_boms_productSkuId_packLevel_version_key" ON "seera_mfg_packaging_boms"("productSkuId", "packLevel", "version");

-- CreateIndex
CREATE INDEX "seera_mfg_packaging_bom_lines_packagingBomId_idx" ON "seera_mfg_packaging_bom_lines"("packagingBomId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_sops_productSkuId_version_key" ON "seera_mfg_sops"("productSkuId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_production_plans_planNumber_key" ON "seera_mfg_production_plans"("planNumber");

-- CreateIndex
CREATE INDEX "seera_mfg_production_plan_lines_planId_idx" ON "seera_mfg_production_plan_lines"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_production_orders_orderNumber_key" ON "seera_mfg_production_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_production_orders_idempotencyKey_key" ON "seera_mfg_production_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_production_orders_productSkuId_status_idx" ON "seera_mfg_production_orders"("productSkuId", "status");

-- CreateIndex
CREATE INDEX "seera_mfg_production_orders_productionDate_status_idx" ON "seera_mfg_production_orders"("productionDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_production_batches_batchNumber_key" ON "seera_mfg_production_batches"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_production_batches_idempotencyKey_key" ON "seera_mfg_production_batches"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_production_batches_productionOrderId_idx" ON "seera_mfg_production_batches"("productionOrderId");

-- CreateIndex
CREATE INDEX "seera_mfg_production_batches_productSkuId_date_idx" ON "seera_mfg_production_batches"("productSkuId", "date");

-- CreateIndex
CREATE INDEX "seera_mfg_production_batches_status_qcStatus_idx" ON "seera_mfg_production_batches"("status", "qcStatus");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_material_events_idempotencyKey_key" ON "seera_mfg_material_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_material_events_productionOrderId_kind_idx" ON "seera_mfg_material_events"("productionOrderId", "kind");

-- CreateIndex
CREATE INDEX "seera_mfg_material_events_batchId_kind_idx" ON "seera_mfg_material_events"("batchId", "kind");

-- CreateIndex
CREATE INDEX "seera_mfg_material_events_materialId_idx" ON "seera_mfg_material_events"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_finished_goods_receipts_batchId_key" ON "seera_mfg_finished_goods_receipts"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_finished_goods_receipts_idempotencyKey_key" ON "seera_mfg_finished_goods_receipts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_qc_templates_productSkuId_version_isActive_idx" ON "seera_mfg_qc_templates"("productSkuId", "version", "isActive");

-- CreateIndex
CREATE INDEX "seera_mfg_batch_qc_batchId_idx" ON "seera_mfg_batch_qc"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_wastage_records_idempotencyKey_key" ON "seera_mfg_wastage_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_wastage_records_batchId_idx" ON "seera_mfg_wastage_records"("batchId");

-- CreateIndex
CREATE INDEX "seera_mfg_wastage_records_productionOrderId_idx" ON "seera_mfg_wastage_records"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_deviation_records_idempotencyKey_key" ON "seera_mfg_deviation_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_deviation_records_batchId_idx" ON "seera_mfg_deviation_records"("batchId");

-- CreateIndex
CREATE INDEX "seera_mfg_deviation_records_status_idx" ON "seera_mfg_deviation_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_grns_grnNumber_key" ON "seera_mfg_grns"("grnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_grns_idempotencyKey_key" ON "seera_mfg_grns"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_grn_lines_grnId_idx" ON "seera_mfg_grn_lines"("grnId");

-- CreateIndex
CREATE INDEX "seera_mfg_grn_lines_materialId_idx" ON "seera_mfg_grn_lines"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_stock_transfers_transferNumber_key" ON "seera_mfg_stock_transfers"("transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_stock_transfers_idempotencyKey_key" ON "seera_mfg_stock_transfers"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_stock_adjustments_adjustmentNumber_key" ON "seera_mfg_stock_adjustments"("adjustmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_stock_adjustments_idempotencyKey_key" ON "seera_mfg_stock_adjustments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_stock_counts_countNumber_key" ON "seera_mfg_stock_counts"("countNumber");

-- CreateIndex
CREATE INDEX "seera_mfg_stock_count_lines_countSessionId_idx" ON "seera_mfg_stock_count_lines"("countSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_machines_code_key" ON "seera_mfg_machines"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_shifts_name_key" ON "seera_mfg_shifts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_approval_policies_category_key" ON "seera_mfg_approval_policies"("category");

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_batch_costs_batchId_key" ON "seera_mfg_batch_costs"("batchId");

-- AddForeignKey
ALTER TABLE "seera_mfg_bom_lines" ADD CONSTRAINT "seera_mfg_bom_lines_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "seera_mfg_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_mfg_packaging_bom_lines" ADD CONSTRAINT "seera_mfg_packaging_bom_lines_packagingBomId_fkey" FOREIGN KEY ("packagingBomId") REFERENCES "seera_mfg_packaging_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_mfg_production_plan_lines" ADD CONSTRAINT "seera_mfg_production_plan_lines_planId_fkey" FOREIGN KEY ("planId") REFERENCES "seera_mfg_production_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_mfg_grn_lines" ADD CONSTRAINT "seera_mfg_grn_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "seera_mfg_grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_mfg_stock_count_lines" ADD CONSTRAINT "seera_mfg_stock_count_lines_countSessionId_fkey" FOREIGN KEY ("countSessionId") REFERENCES "seera_mfg_stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

