-- CreateTable
CREATE TABLE "enterprise_sequences" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendors" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "vendorCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categoryCode" TEXT,
    "taxIdentifier" TEXT,
    "registrationIdentifier" TEXT,
    "paymentTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "leadTimeDays" INTEGER,
    "minimumOrderValue" DECIMAL(14,2),
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "riskClassification" TEXT,
    "performanceClassification" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_contacts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_documents" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "storageReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_requisitions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "requisitionNumber" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "department" TEXT,
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredByDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preferredVendorId" TEXT,
    "warehouseId" TEXT,
    "productionPlanId" TEXT,
    "planningSnapshotId" TEXT,
    "approvalReferenceId" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_requisition_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "estimatedPrice" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_purchase_requisition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_rfqs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "rfqNumber" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3),
    "terms" TEXT,
    "warehouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_rfq_vendors" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'INVITED',

    CONSTRAINT "enterprise_rfq_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_quotations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "vendorReference" TEXT,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validityDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "leadTimeDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_vendor_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vendor_quotation_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "enterprise_vendor_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_orders" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "purchaseOrderNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "quotationId" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "warehouseId" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freightTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvalReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_purchase_order_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitOfMeasure" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "enterprise_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_goods_receipts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "goodsReceiptNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "receivedById" TEXT NOT NULL,
    "inspectionRequired" BOOLEAN NOT NULL DEFAULT true,
    "qualityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_goods_receipt_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL,
    "acceptedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "vendorLotNumber" TEXT,
    "manufacturingDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "enterprise_goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_formulas" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "formulaCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputVariantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_formula_revisions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "standardBatchSize" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "expectedYield" DECIMAL(7,3) NOT NULL,
    "tolerance" DECIMAL(7,3),
    "approvalReferenceId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_formula_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_formula_ingredients" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "materialVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "percentage" DECIMAL(7,3),
    "toleranceMin" DECIMAL(14,3),
    "toleranceMax" DECIMAL(14,3),
    "sequence" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "lossFactor" DECIMAL(7,3),
    "alternatePolicy" TEXT,

    CONSTRAINT "enterprise_formula_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_formula_packaging" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "materialVariantId" TEXT NOT NULL,
    "packagingType" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,

    CONSTRAINT "enterprise_formula_packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_machines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "machineCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineType" TEXT,
    "capacity" DECIMAL(14,3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_work_centers" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "workCenterCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "lineCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "warehouseId" TEXT,
    "capacity" DECIMAL(14,3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_production_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "productionPlanNumber" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalReferenceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_production_orders" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "productionOrderNumber" TEXT NOT NULL,
    "productionPlanId" TEXT,
    "productVariantId" TEXT NOT NULL,
    "formulaRevisionId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(14,3) NOT NULL,
    "actualQuantity" DECIMAL(14,3),
    "unitOfMeasure" TEXT NOT NULL,
    "plannedBatchCount" INTEGER NOT NULL DEFAULT 1,
    "warehouseId" TEXT,
    "productionLineId" TEXT,
    "workCenterId" TEXT,
    "machineId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledCompletion" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "materialAvailability" TEXT NOT NULL DEFAULT 'UNCHECKED',
    "approvalReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_material_allocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "materialVariantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "plannedQuantity" DECIMAL(14,3) NOT NULL,
    "allocatedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "consumedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_material_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_batches" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "batchNumber" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "formulaRevisionId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(14,3) NOT NULL,
    "actualQuantity" DECIMAL(14,3),
    "unitOfMeasure" TEXT NOT NULL,
    "manufacturingDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "warehouseId" TEXT,
    "productionLineId" TEXT,
    "workCenterId" TEXT,
    "machineId" TEXT,
    "operatorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_batch_lots" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "materialVariantId" TEXT NOT NULL,
    "lotType" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_batch_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_batch_status_history" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_batch_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_quality_parameters" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "parameterCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "unit" TEXT,
    "targetValue" TEXT,
    "minimumLimit" DECIMAL(14,4),
    "maximumLimit" DECIMAL(14,4),
    "allowedValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "samplingRequired" BOOLEAN NOT NULL DEFAULT false,
    "methodReference" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_quality_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_inspections" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "inspectionNumber" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "goodsReceiptId" TEXT,
    "batchId" TEXT,
    "warehouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sampleReference" TEXT,
    "inspectedById" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "approvalReferenceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_inspection_results" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "observedValue" TEXT NOT NULL,
    "numericValue" DECIMAL(14,4),
    "passed" BOOLEAN,
    "remarks" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_inspection_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_quality_decisions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT,
    "comments" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalReferenceId" TEXT,
    "overrideReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "enterprise_quality_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_warehouse_zones" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "warehouseId" TEXT NOT NULL,
    "zoneCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stockType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_warehouse_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_warehouse_bins" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "binCode" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_warehouse_bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_warehouse_movements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "movementNumber" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "sourceWarehouseId" TEXT,
    "sourceBinId" TEXT,
    "destinationWarehouseId" TEXT,
    "destinationBinId" TEXT,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "businessReferenceType" TEXT NOT NULL,
    "businessReferenceId" TEXT NOT NULL,
    "businessReferenceNumber" TEXT,
    "reasonCode" TEXT,
    "actorId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_warehouse_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_demand_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "demandPlanNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_demand_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_demand_plan_items" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "demandPlanId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReference" TEXT,

    CONSTRAINT "enterprise_demand_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_planning_snapshots" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "snapshotNumber" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputReferences" JSONB NOT NULL,
    "demandQuantities" JSONB NOT NULL,
    "availableInventory" JSONB NOT NULL,
    "reservedInventory" JSONB NOT NULL,
    "incomingSupply" JSONB NOT NULL,
    "requiredMaterials" JSONB NOT NULL,
    "recommendedProcurement" JSONB NOT NULL,
    "recommendedProduction" JSONB NOT NULL,
    "policyReferences" JSONB NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_planning_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_sequences_organizationKey_documentType_key" ON "enterprise_sequences"("organizationKey", "documentType");

-- CreateIndex
CREATE INDEX "enterprise_vendors_organizationKey_status_createdAt_idx" ON "enterprise_vendors"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_vendors_organizationKey_displayName_idx" ON "enterprise_vendors"("organizationKey", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendors_organizationKey_vendorCode_key" ON "enterprise_vendors"("organizationKey", "vendorCode");

-- CreateIndex
CREATE INDEX "enterprise_vendor_contacts_organizationKey_vendorId_active_idx" ON "enterprise_vendor_contacts"("organizationKey", "vendorId", "active");

-- CreateIndex
CREATE INDEX "enterprise_vendor_documents_organizationKey_vendorId_idx" ON "enterprise_vendor_documents"("organizationKey", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendor_documents_vendorId_documentType_version_key" ON "enterprise_vendor_documents"("vendorId", "documentType", "version");

-- CreateIndex
CREATE INDEX "enterprise_purchase_requisitions_organizationKey_status_cre_idx" ON "enterprise_purchase_requisitions"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_purchase_requisitions_organizationKey_requesterI_idx" ON "enterprise_purchase_requisitions"("organizationKey", "requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_purchase_requisitions_organizationKey_requisitio_key" ON "enterprise_purchase_requisitions"("organizationKey", "requisitionNumber");

-- CreateIndex
CREATE INDEX "enterprise_purchase_requisition_items_organizationKey_requi_idx" ON "enterprise_purchase_requisition_items"("organizationKey", "requisitionId");

-- CreateIndex
CREATE INDEX "enterprise_purchase_requisition_items_variantId_idx" ON "enterprise_purchase_requisition_items"("variantId");

-- CreateIndex
CREATE INDEX "enterprise_rfqs_organizationKey_status_createdAt_idx" ON "enterprise_rfqs"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_rfqs_organizationKey_rfqNumber_key" ON "enterprise_rfqs"("organizationKey", "rfqNumber");

-- CreateIndex
CREATE INDEX "enterprise_rfq_vendors_organizationKey_vendorId_status_idx" ON "enterprise_rfq_vendors"("organizationKey", "vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_rfq_vendors_rfqId_vendorId_key" ON "enterprise_rfq_vendors"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "enterprise_vendor_quotations_organizationKey_vendorId_statu_idx" ON "enterprise_vendor_quotations"("organizationKey", "vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vendor_quotations_organizationKey_quotationNumbe_key" ON "enterprise_vendor_quotations"("organizationKey", "quotationNumber", "version");

-- CreateIndex
CREATE INDEX "enterprise_vendor_quotation_items_organizationKey_quotation_idx" ON "enterprise_vendor_quotation_items"("organizationKey", "quotationId");

-- CreateIndex
CREATE INDEX "enterprise_purchase_orders_organizationKey_status_createdAt_idx" ON "enterprise_purchase_orders"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_purchase_orders_organizationKey_vendorId_status_idx" ON "enterprise_purchase_orders"("organizationKey", "vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_purchase_orders_organizationKey_purchaseOrderNum_key" ON "enterprise_purchase_orders"("organizationKey", "purchaseOrderNumber");

-- CreateIndex
CREATE INDEX "enterprise_purchase_order_items_organizationKey_purchaseOrd_idx" ON "enterprise_purchase_order_items"("organizationKey", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "enterprise_purchase_order_items_variantId_idx" ON "enterprise_purchase_order_items"("variantId");

-- CreateIndex
CREATE INDEX "enterprise_goods_receipts_organizationKey_status_receiptDat_idx" ON "enterprise_goods_receipts"("organizationKey", "status", "receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_goods_receipts_organizationKey_goodsReceiptNumbe_key" ON "enterprise_goods_receipts"("organizationKey", "goodsReceiptNumber");

-- CreateIndex
CREATE INDEX "enterprise_goods_receipt_items_organizationKey_goodsReceipt_idx" ON "enterprise_goods_receipt_items"("organizationKey", "goodsReceiptId");

-- CreateIndex
CREATE INDEX "enterprise_formulas_organizationKey_status_idx" ON "enterprise_formulas"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_formulas_organizationKey_formulaCode_key" ON "enterprise_formulas"("organizationKey", "formulaCode");

-- CreateIndex
CREATE INDEX "enterprise_formula_revisions_organizationKey_status_effecti_idx" ON "enterprise_formula_revisions"("organizationKey", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_formula_revisions_formulaId_revisionNumber_key" ON "enterprise_formula_revisions"("formulaId", "revisionNumber");

-- CreateIndex
CREATE INDEX "enterprise_formula_ingredients_organizationKey_revisionId_idx" ON "enterprise_formula_ingredients"("organizationKey", "revisionId");

-- CreateIndex
CREATE INDEX "enterprise_formula_packaging_organizationKey_revisionId_idx" ON "enterprise_formula_packaging"("organizationKey", "revisionId");

-- CreateIndex
CREATE INDEX "enterprise_machines_organizationKey_status_idx" ON "enterprise_machines"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_machines_organizationKey_machineCode_key" ON "enterprise_machines"("organizationKey", "machineCode");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_work_centers_organizationKey_workCenterCode_key" ON "enterprise_work_centers"("organizationKey", "workCenterCode");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_production_lines_organizationKey_lineCode_key" ON "enterprise_production_lines"("organizationKey", "lineCode");

-- CreateIndex
CREATE INDEX "enterprise_production_plans_organizationKey_status_planDate_idx" ON "enterprise_production_plans"("organizationKey", "status", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_production_plans_organizationKey_productionPlanN_key" ON "enterprise_production_plans"("organizationKey", "productionPlanNumber");

-- CreateIndex
CREATE INDEX "enterprise_production_orders_organizationKey_status_created_idx" ON "enterprise_production_orders"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_production_orders_organizationKey_productVariant_idx" ON "enterprise_production_orders"("organizationKey", "productVariantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_production_orders_organizationKey_productionOrde_key" ON "enterprise_production_orders"("organizationKey", "productionOrderNumber");

-- CreateIndex
CREATE INDEX "enterprise_material_allocations_organizationKey_productionO_idx" ON "enterprise_material_allocations"("organizationKey", "productionOrderId", "status");

-- CreateIndex
CREATE INDEX "enterprise_material_allocations_warehouseId_materialVariant_idx" ON "enterprise_material_allocations"("warehouseId", "materialVariantId");

-- CreateIndex
CREATE INDEX "enterprise_batches_organizationKey_status_createdAt_idx" ON "enterprise_batches"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_batches_organizationKey_qualityStatus_idx" ON "enterprise_batches"("organizationKey", "qualityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_batches_organizationKey_batchNumber_key" ON "enterprise_batches"("organizationKey", "batchNumber");

-- CreateIndex
CREATE INDEX "enterprise_batch_lots_organizationKey_batchId_idx" ON "enterprise_batch_lots"("organizationKey", "batchId");

-- CreateIndex
CREATE INDEX "enterprise_batch_lots_lotNumber_idx" ON "enterprise_batch_lots"("lotNumber");

-- CreateIndex
CREATE INDEX "enterprise_batch_status_history_organizationKey_batchId_cre_idx" ON "enterprise_batch_status_history"("organizationKey", "batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_quality_parameters_organizationKey_parameterCode_key" ON "enterprise_quality_parameters"("organizationKey", "parameterCode");

-- CreateIndex
CREATE INDEX "enterprise_inspections_organizationKey_status_createdAt_idx" ON "enterprise_inspections"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_inspections_organizationKey_batchId_idx" ON "enterprise_inspections"("organizationKey", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_inspections_organizationKey_inspectionNumber_key" ON "enterprise_inspections"("organizationKey", "inspectionNumber");

-- CreateIndex
CREATE INDEX "enterprise_inspection_results_organizationKey_inspectionId_idx" ON "enterprise_inspection_results"("organizationKey", "inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_inspection_results_inspectionId_parameterId_key" ON "enterprise_inspection_results"("inspectionId", "parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_quality_decisions_inspectionId_key" ON "enterprise_quality_decisions"("inspectionId");

-- CreateIndex
CREATE INDEX "enterprise_quality_decisions_organizationKey_decision_decid_idx" ON "enterprise_quality_decisions"("organizationKey", "decision", "decidedAt");

-- CreateIndex
CREATE INDEX "enterprise_warehouse_zones_organizationKey_warehouseId_stat_idx" ON "enterprise_warehouse_zones"("organizationKey", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_warehouse_zones_warehouseId_zoneCode_key" ON "enterprise_warehouse_zones"("warehouseId", "zoneCode");

-- CreateIndex
CREATE INDEX "enterprise_warehouse_bins_organizationKey_status_idx" ON "enterprise_warehouse_bins"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_warehouse_bins_zoneId_binCode_key" ON "enterprise_warehouse_bins"("zoneId", "binCode");

-- CreateIndex
CREATE INDEX "enterprise_warehouse_movements_organizationKey_variantId_cr_idx" ON "enterprise_warehouse_movements"("organizationKey", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "enterprise_warehouse_movements_businessReferenceType_busine_idx" ON "enterprise_warehouse_movements"("businessReferenceType", "businessReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_warehouse_movements_organizationKey_movementNumb_key" ON "enterprise_warehouse_movements"("organizationKey", "movementNumber");

-- CreateIndex
CREATE INDEX "enterprise_demand_plans_organizationKey_status_periodStart_idx" ON "enterprise_demand_plans"("organizationKey", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_demand_plans_organizationKey_demandPlanNumber_key" ON "enterprise_demand_plans"("organizationKey", "demandPlanNumber");

-- CreateIndex
CREATE INDEX "enterprise_demand_plan_items_organizationKey_demandPlanId_idx" ON "enterprise_demand_plan_items"("organizationKey", "demandPlanId");

-- CreateIndex
CREATE INDEX "enterprise_planning_snapshots_organizationKey_snapshotType__idx" ON "enterprise_planning_snapshots"("organizationKey", "snapshotType", "snapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_planning_snapshots_organizationKey_snapshotNumbe_key" ON "enterprise_planning_snapshots"("organizationKey", "snapshotNumber");

-- AddForeignKey
ALTER TABLE "enterprise_vendor_contacts" ADD CONSTRAINT "enterprise_vendor_contacts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vendor_documents" ADD CONSTRAINT "enterprise_vendor_documents_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_requisitions" ADD CONSTRAINT "enterprise_purchase_requisitions_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_requisition_items" ADD CONSTRAINT "enterprise_purchase_requisition_items_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "enterprise_purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_rfqs" ADD CONSTRAINT "enterprise_rfqs_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "enterprise_purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_rfq_vendors" ADD CONSTRAINT "enterprise_rfq_vendors_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "enterprise_rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_rfq_vendors" ADD CONSTRAINT "enterprise_rfq_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vendor_quotations" ADD CONSTRAINT "enterprise_vendor_quotations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "enterprise_rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vendor_quotations" ADD CONSTRAINT "enterprise_vendor_quotations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vendor_quotation_items" ADD CONSTRAINT "enterprise_vendor_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "enterprise_vendor_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_orders" ADD CONSTRAINT "enterprise_purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_orders" ADD CONSTRAINT "enterprise_purchase_orders_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "enterprise_purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_orders" ADD CONSTRAINT "enterprise_purchase_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "enterprise_vendor_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_purchase_order_items" ADD CONSTRAINT "enterprise_purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "enterprise_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_goods_receipts" ADD CONSTRAINT "enterprise_goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "enterprise_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_goods_receipt_items" ADD CONSTRAINT "enterprise_goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "enterprise_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_goods_receipt_items" ADD CONSTRAINT "enterprise_goods_receipt_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "enterprise_purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_formula_revisions" ADD CONSTRAINT "enterprise_formula_revisions_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "enterprise_formulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_formula_ingredients" ADD CONSTRAINT "enterprise_formula_ingredients_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "enterprise_formula_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_formula_packaging" ADD CONSTRAINT "enterprise_formula_packaging_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "enterprise_formula_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_production_orders" ADD CONSTRAINT "enterprise_production_orders_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "enterprise_production_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_production_orders" ADD CONSTRAINT "enterprise_production_orders_formulaRevisionId_fkey" FOREIGN KEY ("formulaRevisionId") REFERENCES "enterprise_formula_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_material_allocations" ADD CONSTRAINT "enterprise_material_allocations_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "enterprise_production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_batches" ADD CONSTRAINT "enterprise_batches_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "enterprise_production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_batches" ADD CONSTRAINT "enterprise_batches_formulaRevisionId_fkey" FOREIGN KEY ("formulaRevisionId") REFERENCES "enterprise_formula_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_batch_lots" ADD CONSTRAINT "enterprise_batch_lots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "enterprise_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_batch_status_history" ADD CONSTRAINT "enterprise_batch_status_history_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "enterprise_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_inspections" ADD CONSTRAINT "enterprise_inspections_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "enterprise_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_inspections" ADD CONSTRAINT "enterprise_inspections_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "enterprise_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_inspection_results" ADD CONSTRAINT "enterprise_inspection_results_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "enterprise_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_quality_decisions" ADD CONSTRAINT "enterprise_quality_decisions_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "enterprise_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_warehouse_bins" ADD CONSTRAINT "enterprise_warehouse_bins_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "enterprise_warehouse_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_demand_plan_items" ADD CONSTRAINT "enterprise_demand_plan_items_demandPlanId_fkey" FOREIGN KEY ("demandPlanId") REFERENCES "enterprise_demand_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing authoritative master references. These are deliberately SQL-level
-- constraints because the additive Prisma records do not add inverse relation
-- fields to frozen Sales/Commerce models.
ALTER TABLE "enterprise_vendors" ADD CONSTRAINT "enterprise_vendors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_purchase_requisitions" ADD CONSTRAINT "enterprise_purchase_requisitions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_purchase_requisition_items" ADD CONSTRAINT "enterprise_purchase_requisition_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_vendor_quotation_items" ADD CONSTRAINT "enterprise_vendor_quotation_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_purchase_orders" ADD CONSTRAINT "enterprise_purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_purchase_order_items" ADD CONSTRAINT "enterprise_purchase_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_goods_receipts" ADD CONSTRAINT "enterprise_goods_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_goods_receipts" ADD CONSTRAINT "enterprise_goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_formulas" ADD CONSTRAINT "enterprise_formulas_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_formula_ingredients" ADD CONSTRAINT "enterprise_formula_ingredients_materialVariantId_fkey" FOREIGN KEY ("materialVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_formula_packaging" ADD CONSTRAINT "enterprise_formula_packaging_materialVariantId_fkey" FOREIGN KEY ("materialVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_production_orders" ADD CONSTRAINT "enterprise_production_orders_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_material_allocations" ADD CONSTRAINT "enterprise_material_allocations_materialVariantId_fkey" FOREIGN KEY ("materialVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_material_allocations" ADD CONSTRAINT "enterprise_material_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_batches" ADD CONSTRAINT "enterprise_batches_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_batch_lots" ADD CONSTRAINT "enterprise_batch_lots_materialVariantId_fkey" FOREIGN KEY ("materialVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_warehouse_zones" ADD CONSTRAINT "enterprise_warehouse_zones_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_warehouse_movements" ADD CONSTRAINT "enterprise_warehouse_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_warehouse_movements" ADD CONSTRAINT "enterprise_warehouse_movements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_demand_plan_items" ADD CONSTRAINT "enterprise_demand_plan_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Frozen operational history is protected even from direct database access.
CREATE OR REPLACE FUNCTION reject_enterprise_immutable_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Enterprise operational history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enterprise_formula_revision_immutable
BEFORE UPDATE OR DELETE ON "enterprise_formula_revisions"
FOR EACH ROW WHEN (OLD."status" IN ('APPROVED', 'ACTIVE', 'SUPERSEDED'))
EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_quality_decision_immutable
BEFORE UPDATE OR DELETE ON "enterprise_quality_decisions"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_batch_lot_immutable
BEFORE UPDATE OR DELETE ON "enterprise_batch_lots"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_batch_history_immutable
BEFORE UPDATE OR DELETE ON "enterprise_batch_status_history"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_warehouse_movement_immutable
BEFORE UPDATE OR DELETE ON "enterprise_warehouse_movements"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();

CREATE TRIGGER enterprise_planning_snapshot_immutable
BEFORE UPDATE OR DELETE ON "enterprise_planning_snapshots"
FOR EACH ROW EXECUTE FUNCTION reject_enterprise_immutable_change();
