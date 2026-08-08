-- DropForeignKey
ALTER TABLE "enterprise_batch_lots" DROP CONSTRAINT "enterprise_batch_lots_materialVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_batches" DROP CONSTRAINT "enterprise_batches_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_demand_plan_items" DROP CONSTRAINT "enterprise_demand_plan_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_formula_ingredients" DROP CONSTRAINT "enterprise_formula_ingredients_materialVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_formula_packaging" DROP CONSTRAINT "enterprise_formula_packaging_materialVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_formulas" DROP CONSTRAINT "enterprise_formulas_outputVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_goods_receipts" DROP CONSTRAINT "enterprise_goods_receipts_receivedById_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_goods_receipts" DROP CONSTRAINT "enterprise_goods_receipts_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_material_allocations" DROP CONSTRAINT "enterprise_material_allocations_materialVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_material_allocations" DROP CONSTRAINT "enterprise_material_allocations_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_production_orders" DROP CONSTRAINT "enterprise_production_orders_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_purchase_order_items" DROP CONSTRAINT "enterprise_purchase_order_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_purchase_orders" DROP CONSTRAINT "enterprise_purchase_orders_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_purchase_requisition_items" DROP CONSTRAINT "enterprise_purchase_requisition_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_purchase_requisitions" DROP CONSTRAINT "enterprise_purchase_requisitions_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_vendor_quotation_items" DROP CONSTRAINT "enterprise_vendor_quotation_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_vendors" DROP CONSTRAINT "enterprise_vendors_createdById_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_warehouse_movements" DROP CONSTRAINT "enterprise_warehouse_movements_actorId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_warehouse_movements" DROP CONSTRAINT "enterprise_warehouse_movements_variantId_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_warehouse_zones" DROP CONSTRAINT "enterprise_warehouse_zones_warehouseId_fkey";

-- CreateTable
CREATE TABLE "enterprise_vendor_agreements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "vendorId" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "agreementType" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "terms" JSONB NOT NULL,
    "documentReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_vendor_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_performance" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "vendorId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "onTimePercentage" DECIMAL(7,3) NOT NULL,
    "qualityPercentage" DECIMAL(7,3) NOT NULL,
    "fulfillmentPercentage" DECIMAL(7,3) NOT NULL,
    "riskScore" DECIMAL(7,3),
    "calculationVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_vendor_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_quotation_comparisons" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "comparisonNumber" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recommendation" JSONB,
    "approvalReferenceId" TEXT,
    "awardedQuotationId" TEXT,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_quotation_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_returns" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "returnNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "approvalReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_return_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "purchaseReturnId" TEXT NOT NULL,
    "goodsReceiptItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,

    CONSTRAINT "enterprise_purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_invoice_references" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "goodsReceiptId" TEXT,
    "vendorInvoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "documentReference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_vendor_invoice_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_alternate_materials" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "primaryVariantId" TEXT NOT NULL,
    "alternateVariantId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "enterprise_alternate_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_yield_definitions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "outputVariantId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(14,3) NOT NULL,
    "minimumQuantity" DECIMAL(14,3),
    "maximumQuantity" DECIMAL(14,3),
    "unitOfMeasure" TEXT NOT NULL,
    "lossPercentage" DECIMAL(7,3),

    CONSTRAINT "enterprise_yield_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_schedules" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "productionOrderId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "shiftCode" TEXT,
    "machineId" TEXT,
    "workCenterId" TEXT,
    "productionLineId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_production_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_steps" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "instructionsReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "operatorId" TEXT,
    "machineId" TEXT,
    "actualParameters" JSONB,

    CONSTRAINT "enterprise_production_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_exceptions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "batchId" TEXT,
    "exceptionType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reasonCode" TEXT,
    "disposition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "enterprise_production_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_batch_exceptions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "exceptionType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reasonCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "enterprise_batch_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_inspection_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "planCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "sampleSize" INTEGER,
    "samplingMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_inspection_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_inspection_plan_parameters" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionPlanId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "targetValue" TEXT,
    "minimumLimit" DECIMAL(14,4),
    "maximumLimit" DECIMAL(14,4),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "enterprise_inspection_plan_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_inspection_samples" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "sampleNumber" TEXT NOT NULL,
    "lotNumber" TEXT,
    "quantity" DECIMAL(14,3),
    "unitOfMeasure" TEXT,
    "collectedById" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laboratoryReference" TEXT,

    CONSTRAINT "enterprise_inspection_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_quality_holds" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "batchId" TEXT,
    "warehouseId" TEXT,
    "variantId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,

    CONSTRAINT "enterprise_quality_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_corrective_actions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionId" TEXT,
    "batchId" TEXT,
    "actionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rootCause" TEXT,
    "actionPlan" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "effectivenessReview" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_preventive_actions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "correctiveActionId" TEXT,
    "actionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actionPlan" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_preventive_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_warehouse_reservations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "binId" TEXT,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "enterprise_warehouse_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_safety_stock_rules" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "minimumStock" DECIMAL(14,3) NOT NULL,
    "maximumStock" DECIMAL(14,3),
    "safetyStock" DECIMAL(14,3) NOT NULL,
    "reorderPoint" DECIMAL(14,3) NOT NULL,
    "reorderQuantity" DECIMAL(14,3),
    "leadTimeDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_safety_stock_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_material_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "materialPlanNumber" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recommendations" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_material_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_procurement_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "procurementPlanNumber" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recommendations" JSONB NOT NULL,
    "approvalReferenceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_procurement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_planning_overrides" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "overrideValue" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "approvalReferenceId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_planning_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enterprise_vendor_agreements_organizationKey_vendorId_statu_idx" ON "enterprise_vendor_agreements"("organizationKey", "vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendor_agreements_organizationKey_agreementNumbe_key" ON "enterprise_vendor_agreements"("organizationKey", "agreementNumber");

-- CreateIndex
CREATE INDEX "enterprise_vendor_performance_organizationKey_vendorId_peri_idx" ON "enterprise_vendor_performance"("organizationKey", "vendorId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendor_performance_vendorId_periodStart_periodEn_key" ON "enterprise_vendor_performance"("vendorId", "periodStart", "periodEnd", "calculationVersion");

-- CreateIndex
CREATE INDEX "enterprise_quotation_comparisons_organizationKey_rfqId_stat_idx" ON "enterprise_quotation_comparisons"("organizationKey", "rfqId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_quotation_comparisons_organizationKey_comparison_key" ON "enterprise_quotation_comparisons"("organizationKey", "comparisonNumber");

-- CreateIndex
CREATE INDEX "enterprise_purchase_returns_organizationKey_status_returnDa_idx" ON "enterprise_purchase_returns"("organizationKey", "status", "returnDate");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_purchase_returns_organizationKey_returnNumber_key" ON "enterprise_purchase_returns"("organizationKey", "returnNumber");

-- CreateIndex
CREATE INDEX "enterprise_purchase_return_items_organizationKey_purchaseRe_idx" ON "enterprise_purchase_return_items"("organizationKey", "purchaseReturnId");

-- CreateIndex
CREATE INDEX "enterprise_vendor_invoice_references_organizationKey_purcha_idx" ON "enterprise_vendor_invoice_references"("organizationKey", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendor_invoice_references_organizationKey_vendor_key" ON "enterprise_vendor_invoice_references"("organizationKey", "vendorId", "vendorInvoiceNumber");

-- CreateIndex
CREATE INDEX "enterprise_alternate_materials_organizationKey_revisionId_idx" ON "enterprise_alternate_materials"("organizationKey", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_alternate_materials_revisionId_primaryVariantId__key" ON "enterprise_alternate_materials"("revisionId", "primaryVariantId", "alternateVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_yield_definitions_revisionId_outputVariantId_key" ON "enterprise_yield_definitions"("revisionId", "outputVariantId");

-- CreateIndex
CREATE INDEX "enterprise_production_schedules_organizationKey_scheduledSt_idx" ON "enterprise_production_schedules"("organizationKey", "scheduledStart", "status");

-- CreateIndex
CREATE INDEX "enterprise_production_steps_organizationKey_status_idx" ON "enterprise_production_steps"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_production_steps_productionOrderId_sequence_key" ON "enterprise_production_steps"("productionOrderId", "sequence");

-- CreateIndex
CREATE INDEX "enterprise_production_exceptions_organizationKey_production_idx" ON "enterprise_production_exceptions"("organizationKey", "productionOrderId", "status");

-- CreateIndex
CREATE INDEX "enterprise_batch_exceptions_organizationKey_batchId_status_idx" ON "enterprise_batch_exceptions"("organizationKey", "batchId", "status");

-- CreateIndex
CREATE INDEX "enterprise_inspection_plans_organizationKey_status_idx" ON "enterprise_inspection_plans"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_inspection_plans_organizationKey_planCode_versio_key" ON "enterprise_inspection_plans"("organizationKey", "planCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_inspection_plan_parameters_inspectionPlanId_para_key" ON "enterprise_inspection_plan_parameters"("inspectionPlanId", "parameterId");

-- CreateIndex
CREATE INDEX "enterprise_inspection_samples_organizationKey_inspectionId_idx" ON "enterprise_inspection_samples"("organizationKey", "inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_inspection_samples_inspectionId_sampleNumber_key" ON "enterprise_inspection_samples"("inspectionId", "sampleNumber");

-- CreateIndex
CREATE INDEX "enterprise_quality_holds_organizationKey_status_placedAt_idx" ON "enterprise_quality_holds"("organizationKey", "status", "placedAt");

-- CreateIndex
CREATE INDEX "enterprise_corrective_actions_organizationKey_status_dueDat_idx" ON "enterprise_corrective_actions"("organizationKey", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_corrective_actions_organizationKey_actionNumber_key" ON "enterprise_corrective_actions"("organizationKey", "actionNumber");

-- CreateIndex
CREATE INDEX "enterprise_preventive_actions_organizationKey_status_dueDat_idx" ON "enterprise_preventive_actions"("organizationKey", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_preventive_actions_organizationKey_actionNumber_key" ON "enterprise_preventive_actions"("organizationKey", "actionNumber");

-- CreateIndex
CREATE INDEX "enterprise_warehouse_reservations_organizationKey_warehouse_idx" ON "enterprise_warehouse_reservations"("organizationKey", "warehouseId", "variantId", "status");

-- CreateIndex
CREATE INDEX "enterprise_safety_stock_rules_organizationKey_active_idx" ON "enterprise_safety_stock_rules"("organizationKey", "active");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_safety_stock_rules_organizationKey_warehouseId_v_key" ON "enterprise_safety_stock_rules"("organizationKey", "warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "enterprise_material_plans_organizationKey_status_periodStar_idx" ON "enterprise_material_plans"("organizationKey", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_material_plans_organizationKey_materialPlanNumbe_key" ON "enterprise_material_plans"("organizationKey", "materialPlanNumber");

-- CreateIndex
CREATE INDEX "enterprise_procurement_plans_organizationKey_status_periodS_idx" ON "enterprise_procurement_plans"("organizationKey", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_procurement_plans_organizationKey_procurementPla_key" ON "enterprise_procurement_plans"("organizationKey", "procurementPlanNumber");

-- CreateIndex
CREATE INDEX "enterprise_planning_overrides_organizationKey_snapshotId_cr_idx" ON "enterprise_planning_overrides"("organizationKey", "snapshotId", "createdAt");

CREATE TRIGGER enterprise_vendor_performance_immutable
BEFORE UPDATE OR DELETE ON "enterprise_vendor_performance"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_planning_override_immutable
BEFORE UPDATE OR DELETE ON "enterprise_planning_overrides"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_inspection_sample_immutable
BEFORE UPDATE OR DELETE ON "enterprise_inspection_samples"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();
