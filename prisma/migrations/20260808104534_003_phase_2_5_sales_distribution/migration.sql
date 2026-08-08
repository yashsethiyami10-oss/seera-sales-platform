-- CreateEnum
CREATE TYPE "MasterStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('DISTRIBUTOR', 'SUPER_STOCKIST');

-- CreateEnum
CREATE TYPE "PartnerLifecycle" AS ENUM ('PROSPECT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('COMPANY_TO_SS', 'SS_TO_DISTRIBUTOR', 'DISTRIBUTOR_TO_RETAILER');

-- CreateEnum
CREATE TYPE "MarginType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "WorkSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('PENDING', 'PRODUCTIVE', 'NO_ORDER', 'SKIPPED', 'CLOSED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "SalesOrderType" AS ENUM ('RETAILER_ORDER', 'DISTRIBUTOR_REPLENISHMENT', 'COMPANY_REPLENISHMENT');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'PARTIAL_ACCEPTED', 'ACCEPTED', 'HELD', 'REJECTED', 'ALLOCATED', 'DISPATCH_READY', 'DISPATCHED', 'PARTIAL_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'PARTIAL_DELIVERED', 'REFUSED', 'SHOP_CLOSED', 'PAYMENT_ISSUE', 'STOCK_UNAVAILABLE', 'WRONG_ORDER', 'RESCHEDULED', 'DAMAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryPartyType" AS ENUM ('DISTRIBUTOR', 'SUPER_STOCKIST');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'RECEIPT', 'ALLOCATION', 'RELEASE', 'DISPATCH', 'DELIVERY', 'RETURN', 'DAMAGE', 'SHORTAGE', 'ADJUSTMENT', 'RECONCILIATION', 'OFF_SYSTEM_ISSUE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "MovementDirection" AS ENUM ('IN', 'OUT', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'MATCHED', 'PARTIALLY_MATCHED', 'REJECTED', 'ADVANCE_HELD', 'VERIFIED');

-- CreateEnum
CREATE TYPE "CreditDecision" AS ENUM ('ALLOW', 'WARNING', 'HOLD', 'BLOCK', 'OVERRIDE_REQUIRED');

-- CreateTable
CREATE TABLE "seera_skus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'Seera',
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "packSize" DECIMAL(14,3) NOT NULL,
    "unitType" TEXT NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "mrp" DECIMAL(14,2) NOT NULL,
    "hsn" TEXT,
    "taxRate" DECIMAL(7,4),
    "minimumOrderMultiple" INTEGER NOT NULL DEFAULT 1,
    "imageReference" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'DRAFT',
    "launchedAt" TIMESTAMP(3),
    "discontinuedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_price_versions" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "tier" "PriceTier" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mrpSnapshot" DECIMAL(14,2) NOT NULL,
    "marginType" "MarginType",
    "marginValue" DECIMAL(14,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "MasterStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_price_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skuId" TEXT,
    "eligibilityType" TEXT NOT NULL,
    "minimumValue" DECIMAL(14,2),
    "minimumQuantity" DECIMAL(14,3),
    "freeQuantity" DECIMAL(14,3),
    "discountPercent" DECIMAL(7,4),
    "flatDiscount" DECIMAL(14,2),
    "applicability" JSONB NOT NULL,
    "maximumBenefit" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3) NOT NULL,
    "status" "MasterStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_geography_nodes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "parentId" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_geography_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_partners" (
    "id" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "lifecycle" "PartnerLifecycle" NOT NULL DEFAULT 'PROSPECT',
    "gstin" TEXT,
    "pan" TEXT,
    "primaryContact" JSONB NOT NULL,
    "addresses" JSONB NOT NULL,
    "warehouseProfile" JSONB,
    "capacityProfile" JSONB,
    "territoryIds" TEXT[],
    "assignedSuperStockistId" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "documents" JSONB,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_retailers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "normalizedMobile" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "address" JSONB NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gstin" TEXT,
    "shopType" TEXT NOT NULL,
    "classification" TEXT,
    "territoryId" TEXT,
    "marketId" TEXT,
    "beatId" TEXT,
    "distributorId" TEXT,
    "salespersonId" TEXT,
    "estimatedPotential" DECIMAL(14,2),
    "lifecycle" "PartnerLifecycle" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "photoMetadata" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_credit_terms" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DECIMAL(14,2) NOT NULL,
    "creditDays" INTEGER NOT NULL,
    "warningThreshold" DECIMAL(14,2),
    "blockThreshold" DECIMAL(14,2),
    "graceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "exceptionPolicy" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvalId" TEXT,
    "changeReason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_credit_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_assignments" (
    "id" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_prospects" (
    "id" TEXT NOT NULL,
    "prospectType" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "normalizedMobile" TEXT NOT NULL,
    "areaId" TEXT,
    "profile" JSONB NOT NULL,
    "status" "PartnerLifecycle" NOT NULL DEFAULT 'PROSPECT',
    "followUpAt" TIMESTAMP(3),
    "ownerEmployeeId" TEXT NOT NULL,
    "approvedPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_work_sessions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeRole" TEXT NOT NULL,
    "workingType" TEXT NOT NULL,
    "plannedGeographyId" TEXT,
    "status" "WorkSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startLatitude" DECIMAL(10,7),
    "startLongitude" DECIMAL(10,7),
    "endedAt" TIMESTAMP(3),
    "endLatitude" DECIMAL(10,7),
    "endLongitude" DECIMAL(10,7),
    "remarks" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_visits" (
    "id" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "retailerId" TEXT,
    "prospectId" TEXT,
    "sequence" INTEGER,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkInLatitude" DECIMAL(10,7),
    "checkInLongitude" DECIMAL(10,7),
    "gpsExceptionReason" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "outcome" "VisitOutcome" NOT NULL DEFAULT 'PENDING',
    "noOrderReason" TEXT,
    "followUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "seera_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_joint_work" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "salesExecutiveId" TEXT NOT NULL,
    "territoryId" TEXT,
    "beatId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "leadActorId" TEXT NOT NULL,
    "observations" TEXT,
    "coaching" TEXT,
    "outcome" TEXT,

    CONSTRAINT "seera_joint_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_sales_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "type" "SalesOrderType" NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "retailerId" TEXT,
    "buyerPartnerId" TEXT,
    "sellerPartnerId" TEXT,
    "salespersonId" TEXT,
    "actorId" TEXT NOT NULL,
    "commercialPartyType" TEXT NOT NULL,
    "commercialPartyId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "onBehalfOfPartyId" TEXT,
    "financialAcceptance" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "requestedDeliveryAt" TIMESTAMP(3),
    "contractualCreditDays" INTEGER,
    "originalDueDate" TIMESTAMP(3),
    "graceDays" INTEGER,
    "graceUntil" TIMESTAMP(3),
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "allocatedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "skuCodeSnapshot" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "packSnapshot" TEXT NOT NULL,
    "priceSnapshot" DECIMAL(14,2) NOT NULL,
    "mrpSnapshot" DECIMAL(14,2) NOT NULL,
    "schemeSnapshot" JSONB,
    "taxSnapshot" JSONB,
    "orderedQuantity" DECIMAL(14,3) NOT NULL,
    "acceptedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "allocatedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "dispatchedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "deliveredQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cancelledQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "refusedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "seera_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_deliveries" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryUserId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "quantities" JSONB NOT NULL,
    "proof" JSONB,
    "receiverName" TEXT,
    "reason" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "occurredAt" TIMESTAMP(3),
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_inventory_movements" (
    "id" TEXT NOT NULL,
    "partyType" "InventoryPartyType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "onBehalfOfPartyId" TEXT,
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_stock_reconciliations" (
    "id" TEXT NOT NULL,
    "partyType" "InventoryPartyType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "seera_stock_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_stock_reconciliation_lines" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "openingQuantity" DECIMAL(14,3) NOT NULL,
    "receiptQuantity" DECIMAL(14,3) NOT NULL,
    "issueQuantity" DECIMAL(14,3) NOT NULL,
    "systemClosing" DECIMAL(14,3) NOT NULL,
    "physicalClosing" DECIMAL(14,3) NOT NULL,
    "variance" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustmentMovementId" TEXT,

    CONSTRAINT "seera_stock_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_payment_promises" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "originalDueDate" TIMESTAMP(3) NOT NULL,
    "promisedPaymentDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "verbalCommitmentContext" TEXT,
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "approvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_payment_promises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_payment_proofs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "fileId" TEXT,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "seera_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_approval_items" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "assignedRoleCode" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "request" JSONB NOT NULL,
    "decision" JSONB,
    "decidedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "seera_approval_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_status_history" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_credit_reminder_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "creditDaysFilter" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_credit_reminder_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "claimantType" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "againstPartyType" TEXT NOT NULL,
    "againstPartyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "details" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seera_skus_code_key" ON "seera_skus"("code");

-- CreateIndex
CREATE INDEX "seera_skus_status_category_idx" ON "seera_skus"("status", "category");

-- CreateIndex
CREATE INDEX "seera_price_versions_skuId_tier_status_effectiveFrom_effect_idx" ON "seera_price_versions"("skuId", "tier", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_price_versions_skuId_tier_effectiveFrom_key" ON "seera_price_versions"("skuId", "tier", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seera_schemes_skuId_status_effectiveFrom_effectiveTo_idx" ON "seera_schemes"("skuId", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_geography_nodes_code_key" ON "seera_geography_nodes"("code");

-- CreateIndex
CREATE INDEX "seera_geography_nodes_parentId_level_status_idx" ON "seera_geography_nodes"("parentId", "level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_partners_code_key" ON "seera_partners"("code");

-- CreateIndex
CREATE INDEX "seera_partners_type_lifecycle_idx" ON "seera_partners"("type", "lifecycle");

-- CreateIndex
CREATE INDEX "seera_partners_assignedSuperStockistId_idx" ON "seera_partners"("assignedSuperStockistId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_retailers_code_key" ON "seera_retailers"("code");

-- CreateIndex
CREATE INDEX "seera_retailers_beatId_distributorId_salespersonId_lifecycl_idx" ON "seera_retailers"("beatId", "distributorId", "salespersonId", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "seera_retailers_normalizedMobile_businessName_key" ON "seera_retailers"("normalizedMobile", "businessName");

-- CreateIndex
CREATE INDEX "seera_credit_terms_distributorId_effectiveFrom_effectiveTo_idx" ON "seera_credit_terms"("distributorId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_credit_terms_distributorId_effectiveFrom_key" ON "seera_credit_terms"("distributorId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seera_assignments_subjectType_subjectId_effectiveFrom_effec_idx" ON "seera_assignments"("subjectType", "subjectId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "seera_assignments_targetType_targetId_effectiveFrom_effecti_idx" ON "seera_assignments"("targetType", "targetId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_assignments_assignmentType_subjectId_targetId_effecti_key" ON "seera_assignments"("assignmentType", "subjectId", "targetId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seera_prospects_ownerEmployeeId_status_followUpAt_idx" ON "seera_prospects"("ownerEmployeeId", "status", "followUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_prospects_prospectType_normalizedMobile_businessName_key" ON "seera_prospects"("prospectType", "normalizedMobile", "businessName");

-- CreateIndex
CREATE INDEX "seera_work_sessions_employeeId_status_startedAt_idx" ON "seera_work_sessions"("employeeId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_visits_idempotencyKey_key" ON "seera_visits"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_visits_workSessionId_outcome_idx" ON "seera_visits"("workSessionId", "outcome");

-- CreateIndex
CREATE INDEX "seera_joint_work_managerId_salesExecutiveId_startedAt_idx" ON "seera_joint_work"("managerId", "salesExecutiveId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_sales_orders_orderNumber_key" ON "seera_sales_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_sales_orders_idempotencyKey_key" ON "seera_sales_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_sales_orders_type_status_createdAt_idx" ON "seera_sales_orders"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "seera_sales_orders_retailerId_createdAt_idx" ON "seera_sales_orders"("retailerId", "createdAt");

-- CreateIndex
CREATE INDEX "seera_sales_orders_buyerPartnerId_sellerPartnerId_status_idx" ON "seera_sales_orders"("buyerPartnerId", "sellerPartnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_order_lines_orderId_skuId_key" ON "seera_order_lines"("orderId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_deliveries_idempotencyKey_key" ON "seera_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_deliveries_orderId_status_idx" ON "seera_deliveries"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_inventory_movements_idempotencyKey_key" ON "seera_inventory_movements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_inventory_movements_partyType_partyId_skuId_occurredA_idx" ON "seera_inventory_movements"("partyType", "partyId", "skuId", "occurredAt");

-- CreateIndex
CREATE INDEX "seera_inventory_movements_sourceType_sourceId_idx" ON "seera_inventory_movements"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_stock_reconciliations_idempotencyKey_key" ON "seera_stock_reconciliations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_stock_reconciliations_partyType_partyId_periodEnd_idx" ON "seera_stock_reconciliations"("partyType", "partyId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "seera_stock_reconciliation_lines_reconciliationId_skuId_key" ON "seera_stock_reconciliation_lines"("reconciliationId", "skuId");

-- CreateIndex
CREATE INDEX "seera_payment_promises_orderId_createdAt_idx" ON "seera_payment_promises"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payment_proofs_idempotencyKey_key" ON "seera_payment_proofs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_payment_proofs_orderId_status_idx" ON "seera_payment_proofs"("orderId", "status");

-- CreateIndex
CREATE INDEX "seera_approval_items_assignedRoleCode_status_createdAt_idx" ON "seera_approval_items"("assignedRoleCode", "status", "createdAt");

-- CreateIndex
CREATE INDEX "seera_approval_items_entityType_entityId_idx" ON "seera_approval_items"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "seera_status_history_entityType_entityId_occurredAt_idx" ON "seera_status_history"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "seera_credit_reminder_rules_enabled_creditDaysFilter_offset_idx" ON "seera_credit_reminder_rules"("enabled", "creditDaysFilter", "offsetDays");

-- CreateIndex
CREATE UNIQUE INDEX "seera_claims_claimNumber_key" ON "seera_claims"("claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_claims_idempotencyKey_key" ON "seera_claims"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_claims_claimantType_claimantId_status_idx" ON "seera_claims"("claimantType", "claimantId", "status");

-- AddForeignKey
ALTER TABLE "seera_price_versions" ADD CONSTRAINT "seera_price_versions_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "seera_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_schemes" ADD CONSTRAINT "seera_schemes_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "seera_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_credit_terms" ADD CONSTRAINT "seera_credit_terms_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "seera_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_visits" ADD CONSTRAINT "seera_visits_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "seera_work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_visits" ADD CONSTRAINT "seera_visits_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "seera_retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_sales_orders" ADD CONSTRAINT "seera_sales_orders_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "seera_retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_sales_orders" ADD CONSTRAINT "seera_sales_orders_buyerPartnerId_fkey" FOREIGN KEY ("buyerPartnerId") REFERENCES "seera_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_sales_orders" ADD CONSTRAINT "seera_sales_orders_sellerPartnerId_fkey" FOREIGN KEY ("sellerPartnerId") REFERENCES "seera_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_order_lines" ADD CONSTRAINT "seera_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "seera_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_order_lines" ADD CONSTRAINT "seera_order_lines_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "seera_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_deliveries" ADD CONSTRAINT "seera_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "seera_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_inventory_movements" ADD CONSTRAINT "seera_inventory_movements_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "seera_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_stock_reconciliation_lines" ADD CONSTRAINT "seera_stock_reconciliation_lines_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "seera_stock_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_stock_reconciliation_lines" ADD CONSTRAINT "seera_stock_reconciliation_lines_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "seera_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_payment_promises" ADD CONSTRAINT "seera_payment_promises_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "seera_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_payment_proofs" ADD CONSTRAINT "seera_payment_proofs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "seera_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
