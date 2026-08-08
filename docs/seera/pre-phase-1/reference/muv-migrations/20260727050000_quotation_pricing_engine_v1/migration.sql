-- CreateTable
CREATE TABLE "quotation_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_status_transitions" (
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "quotation_status_transitions_pkey" PRIMARY KEY ("fromStatusId","toStatusId")
);

-- CreateTable
CREATE TABLE "pricing_policies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultDiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "defaultDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvalThreshold" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configurations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_approval_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "discountThreshold" DECIMAL(12,2),
    "valueThreshold" DECIMAL(15,2),
    "levels" INTEGER NOT NULL DEFAULT 1,
    "prohibitSelfApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "territoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_versions" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "statusId" TEXT NOT NULL,
    "pricingPolicyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "revisionReason" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "approvalState" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "termsSnapshot" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "commercialLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_line_items" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "taxConfigurationId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "variantSnapshot" TEXT,
    "categorySnapshot" TEXT,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "taxRate" DECIMAL(7,4) NOT NULL,
    "taxInclusive" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discountAmount" DECIMAL(15,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_status_history" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "previousStatusId" TEXT,
    "newStatusId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_approval_requests" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "quotation_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_approval_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_documents" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "fileReference" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_deliveries" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "recipient" TEXT,
    "status" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_views" (
    "id" TEXT NOT NULL,
    "quotationVersionId" TEXT NOT NULL,
    "viewerId" TEXT,
    "viewerReference" TEXT,
    "deliveryMethod" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_statuses_code_key" ON "quotation_statuses"("code");

-- CreateIndex
CREATE INDEX "quotation_statuses_active_displayOrder_idx" ON "quotation_statuses"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_policies_code_key" ON "pricing_policies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_configurations_code_key" ON "tax_configurations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_approval_rules_code_key" ON "quotation_approval_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "quotations_opportunityId_createdAt_idx" ON "quotations"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "quotations_customerId_createdAt_idx" ON "quotations"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "quotations_ownerUserId_createdAt_idx" ON "quotations"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "quotations_territoryId_createdAt_idx" ON "quotations"("territoryId", "createdAt");

-- CreateIndex
CREATE INDEX "quotation_versions_statusId_issueDate_idx" ON "quotation_versions"("statusId", "issueDate");

-- CreateIndex
CREATE INDEX "quotation_versions_pricingPolicyId_createdAt_idx" ON "quotation_versions"("pricingPolicyId", "createdAt");

-- CreateIndex
CREATE INDEX "quotation_versions_validUntil_isActive_idx" ON "quotation_versions"("validUntil", "isActive");

-- CreateIndex
CREATE INDEX "quotation_versions_approvalState_createdAt_idx" ON "quotation_versions"("approvalState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_versions_quotationId_versionNumber_key" ON "quotation_versions"("quotationId", "versionNumber");

-- CreateIndex
CREATE INDEX "quotation_line_items_quotationVersionId_displayOrder_idx" ON "quotation_line_items"("quotationVersionId", "displayOrder");

-- CreateIndex
CREATE INDEX "quotation_line_items_productId_idx" ON "quotation_line_items"("productId");

-- CreateIndex
CREATE INDEX "quotation_line_items_variantId_idx" ON "quotation_line_items"("variantId");

-- CreateIndex
CREATE INDEX "quotation_status_history_quotationVersionId_createdAt_idx" ON "quotation_status_history"("quotationVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "quotation_approval_requests_approverId_status_submittedAt_idx" ON "quotation_approval_requests"("approverId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_approval_requests_quotationVersionId_level_key" ON "quotation_approval_requests"("quotationVersionId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_approval_decisions_requestId_actorId_key" ON "quotation_approval_decisions"("requestId", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_documents_fileReference_key" ON "quotation_documents"("fileReference");

-- CreateIndex
CREATE INDEX "quotation_documents_quotationVersionId_generatedAt_idx" ON "quotation_documents"("quotationVersionId", "generatedAt");

-- CreateIndex
CREATE INDEX "quotation_deliveries_quotationVersionId_createdAt_idx" ON "quotation_deliveries"("quotationVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "quotation_views_quotationVersionId_viewedAt_idx" ON "quotation_views"("quotationVersionId", "viewedAt");

-- AddForeignKey
ALTER TABLE "quotation_status_transitions" ADD CONSTRAINT "quotation_status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "quotation_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_transitions" ADD CONSTRAINT "quotation_status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "quotation_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "quotation_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_pricingPolicyId_fkey" FOREIGN KEY ("pricingPolicyId") REFERENCES "pricing_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_taxConfigurationId_fkey" FOREIGN KEY ("taxConfigurationId") REFERENCES "tax_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_previousStatusId_fkey" FOREIGN KEY ("previousStatusId") REFERENCES "quotation_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_newStatusId_fkey" FOREIGN KEY ("newStatusId") REFERENCES "quotation_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_requests" ADD CONSTRAINT "quotation_approval_requests_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_requests" ADD CONSTRAINT "quotation_approval_requests_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "quotation_approval_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_requests" ADD CONSTRAINT "quotation_approval_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_requests" ADD CONSTRAINT "quotation_approval_requests_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_decisions" ADD CONSTRAINT "quotation_approval_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quotation_approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approval_decisions" ADD CONSTRAINT "quotation_approval_decisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_deliveries" ADD CONSTRAINT "quotation_deliveries_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_views" ADD CONSTRAINT "quotation_views_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_views" ADD CONSTRAINT "quotation_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotation_line_items"
  ADD CONSTRAINT "quotation_line_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "quotation_line_values_check" CHECK ("unitPrice" >= 0 AND "discountValue" >= 0 AND "subtotal" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "total" >= 0);
ALTER TABLE "quotation_versions"
  ADD CONSTRAINT "quotation_validity_check" CHECK ("validUntil" >= "issueDate"),
  ADD CONSTRAINT "quotation_totals_check" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "grandTotal" >= 0);
CREATE UNIQUE INDEX "quotation_one_active_version"
  ON "quotation_versions" ("quotationId") WHERE "isActive" = true;

CREATE SEQUENCE IF NOT EXISTS "quotation_number_seq" START 1;
CREATE OR REPLACE FUNCTION "assign_quotation_number"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."quotationNumber" IS NULL OR NEW."quotationNumber" = '' THEN
    NEW."quotationNumber" := 'MUV-QTN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('quotation_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "quotation_number_before_insert"
BEFORE INSERT ON "quotations"
FOR EACH ROW EXECUTE FUNCTION "assign_quotation_number"();

CREATE OR REPLACE FUNCTION "reject_quotation_history_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "quotation_status_history_immutable" BEFORE UPDATE OR DELETE ON "quotation_status_history"
FOR EACH ROW EXECUTE FUNCTION "reject_quotation_history_mutation"();
CREATE TRIGGER "quotation_approval_decisions_immutable" BEFORE UPDATE OR DELETE ON "quotation_approval_decisions"
FOR EACH ROW EXECUTE FUNCTION "reject_quotation_history_mutation"();
CREATE TRIGGER "quotation_documents_immutable" BEFORE UPDATE OR DELETE ON "quotation_documents"
FOR EACH ROW EXECUTE FUNCTION "reject_quotation_history_mutation"();
CREATE OR REPLACE FUNCTION "protect_locked_quotation_line_item"()
RETURNS TRIGGER AS $$
DECLARE locked BOOLEAN;
BEGIN
  SELECT "commercialLocked" INTO locked FROM "quotation_versions"
  WHERE "id" = OLD."quotationVersionId";
  IF locked THEN RAISE EXCEPTION 'pricing snapshot is immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "quotation_line_items_immutable_after_lock"
BEFORE UPDATE OR DELETE ON "quotation_line_items"
FOR EACH ROW EXECUTE FUNCTION "protect_locked_quotation_line_item"();
