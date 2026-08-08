-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "acceptedQuotationVersionId" TEXT,
ADD COLUMN     "commerceOwnerId" TEXT,
ADD COLUMN     "commerceStatusId" TEXT,
ADD COLUMN     "commerceTerritoryId" TEXT,
ADD COLUMN     "commercialLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warehouseId" TEXT;

-- CreateTable
CREATE TABLE "commerce_order_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_order_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_order_status_transitions" (
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "commerce_order_status_transitions_pkey" PRIMARY KEY ("fromStatusId","toStatusId")
);

-- CreateTable
CREATE TABLE "commerce_order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "previousStatusId" TEXT,
    "newStatusId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entries" (
    "id" TEXT NOT NULL,
    "movementNumber" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "referenceEntity" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_allocations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_damage_records" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_damage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_operations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "picking_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_operations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "packageCount" INTEGER NOT NULL DEFAULT 1,
    "packageWeight" DECIMAL(12,3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packing_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_carriers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "commerce_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_dispatches" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "dispatchedById" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deliveryConfirmation" TEXT,
    "deliveryNotes" TEXT,

    CONSTRAINT "commerce_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "gstNumber" TEXT,
    "taxableValue" DECIMAL(15,2) NOT NULL,
    "cgst" DECIMAL(15,2) NOT NULL,
    "sgst" DECIMAL(15,2) NOT NULL,
    "igst" DECIMAL(15,2) NOT NULL,
    "discountTotal" DECIMAL(15,2) NOT NULL,
    "grandTotal" DECIMAL(15,2) NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL,
    "tax" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "commercial_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_payment_methods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "commerce_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "methodId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "collectedById" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "voidReason" TEXT,

    CONSTRAINT "commerce_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fileReference" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_documents" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "generatedById" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commerce_order_statuses_code_key" ON "commerce_order_statuses"("code");

-- CreateIndex
CREATE INDEX "commerce_order_status_history_orderId_createdAt_idx" ON "commerce_order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_entries_movementNumber_key" ON "stock_ledger_entries"("movementNumber");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_warehouseId_variantId_createdAt_idx" ON "stock_ledger_entries"("warehouseId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_referenceEntity_referenceId_idx" ON "stock_ledger_entries"("referenceEntity", "referenceId");

-- CreateIndex
CREATE INDEX "inventory_reservations_warehouseId_variantId_status_idx" ON "inventory_reservations"("warehouseId", "variantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_orderId_variantId_key" ON "inventory_reservations"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_allocations_orderId_variantId_key" ON "inventory_allocations"("orderId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_damage_records_warehouseId_variantId_reportedAt_idx" ON "inventory_damage_records"("warehouseId", "variantId", "reportedAt");

-- CreateIndex
CREATE INDEX "picking_operations_orderId_status_idx" ON "picking_operations"("orderId", "status");

-- CreateIndex
CREATE INDEX "packing_operations_orderId_status_idx" ON "packing_operations"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_carriers_code_key" ON "commerce_carriers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_dispatches_orderId_key" ON "commerce_dispatches"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_dispatches_trackingNumber_key" ON "commerce_dispatches"("trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_invoices_invoiceNumber_key" ON "commercial_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_invoices_orderId_key" ON "commercial_invoices"("orderId");

-- CreateIndex
CREATE INDEX "commercial_invoices_paymentStatus_issueDate_idx" ON "commercial_invoices"("paymentStatus", "issueDate");

-- CreateIndex
CREATE INDEX "commercial_invoice_lines_invoiceId_idx" ON "commercial_invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_payment_methods_code_key" ON "commerce_payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_payments_paymentNumber_key" ON "commerce_payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "commerce_payments_invoiceId_status_collectedAt_idx" ON "commerce_payments"("invoiceId", "status", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_receipts_receiptNumber_key" ON "commerce_receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_receipts_paymentId_key" ON "commerce_receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_documents_fileReference_key" ON "commerce_documents"("fileReference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_acceptedQuotationVersionId_key" ON "orders"("acceptedQuotationVersionId");

-- CreateIndex
CREATE INDEX "orders_commerceStatusId_createdAt_idx" ON "orders"("commerceStatusId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_commerceOwnerId_createdAt_idx" ON "orders"("commerceOwnerId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_commerceTerritoryId_createdAt_idx" ON "orders"("commerceTerritoryId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_warehouseId_createdAt_idx" ON "orders"("warehouseId", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_acceptedQuotationVersionId_fkey" FOREIGN KEY ("acceptedQuotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_commerceStatusId_fkey" FOREIGN KEY ("commerceStatusId") REFERENCES "commerce_order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_commerceOwnerId_fkey" FOREIGN KEY ("commerceOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_commerceTerritoryId_fkey" FOREIGN KEY ("commerceTerritoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_transitions" ADD CONSTRAINT "commerce_order_status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "commerce_order_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_transitions" ADD CONSTRAINT "commerce_order_status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "commerce_order_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_history" ADD CONSTRAINT "commerce_order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_history" ADD CONSTRAINT "commerce_order_status_history_previousStatusId_fkey" FOREIGN KEY ("previousStatusId") REFERENCES "commerce_order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_history" ADD CONSTRAINT "commerce_order_status_history_newStatusId_fkey" FOREIGN KEY ("newStatusId") REFERENCES "commerce_order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_status_history" ADD CONSTRAINT "commerce_order_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_records" ADD CONSTRAINT "inventory_damage_records_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_records" ADD CONSTRAINT "inventory_damage_records_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_records" ADD CONSTRAINT "inventory_damage_records_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_operations" ADD CONSTRAINT "picking_operations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_operations" ADD CONSTRAINT "picking_operations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_operations" ADD CONSTRAINT "packing_operations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_operations" ADD CONSTRAINT "packing_operations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_dispatches" ADD CONSTRAINT "commerce_dispatches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_dispatches" ADD CONSTRAINT "commerce_dispatches_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "commerce_carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_dispatches" ADD CONSTRAINT "commerce_dispatches_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_invoices" ADD CONSTRAINT "commercial_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_invoice_lines" ADD CONSTRAINT "commercial_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_payments" ADD CONSTRAINT "commerce_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_payments" ADD CONSTRAINT "commerce_payments_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "commerce_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_payments" ADD CONSTRAINT "commerce_payments_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_receipts" ADD CONSTRAINT "commerce_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "commerce_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_documents" ADD CONSTRAINT "commerce_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_documents" ADD CONSTRAINT "commerce_documents_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_quantity_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "reservation_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "allocation_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_damage_records" ADD CONSTRAINT "damage_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "commerce_payments" ADD CONSTRAINT "commerce_payment_amount_positive" CHECK ("amount" > 0);

CREATE SEQUENCE IF NOT EXISTS "commerce_order_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "commerce_payment_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "commerce_receipt_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "stock_movement_number_seq" START 1;
CREATE OR REPLACE FUNCTION "assign_commerce_numbers"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' AND (NEW."orderNumber" IS NULL OR NEW."orderNumber" = '') THEN NEW."orderNumber" := 'MUV-ORD-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_order_number_seq')::TEXT,6,'0'); END IF;
  IF TG_TABLE_NAME = 'commercial_invoices' AND (NEW."invoiceNumber" IS NULL OR NEW."invoiceNumber" = '') THEN NEW."invoiceNumber" := 'MUV-INV-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT,6,'0'); END IF;
  IF TG_TABLE_NAME = 'commerce_payments' AND (NEW."paymentNumber" IS NULL OR NEW."paymentNumber" = '') THEN NEW."paymentNumber" := 'MUV-PAY-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_payment_number_seq')::TEXT,6,'0'); END IF;
  IF TG_TABLE_NAME = 'commerce_receipts' AND (NEW."receiptNumber" IS NULL OR NEW."receiptNumber" = '') THEN NEW."receiptNumber" := 'MUV-RCP-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_receipt_number_seq')::TEXT,6,'0'); END IF;
  IF TG_TABLE_NAME = 'stock_ledger_entries' AND (NEW."movementNumber" IS NULL OR NEW."movementNumber" = '') THEN NEW."movementNumber" := 'MUV-STK-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('stock_movement_number_seq')::TEXT,8,'0'); END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "commerce_order_number_before_insert" BEFORE INSERT ON "orders" FOR EACH ROW EXECUTE FUNCTION "assign_commerce_numbers"();
CREATE TRIGGER "invoice_number_before_insert" BEFORE INSERT ON "commercial_invoices" FOR EACH ROW EXECUTE FUNCTION "assign_commerce_numbers"();
CREATE TRIGGER "payment_number_before_insert" BEFORE INSERT ON "commerce_payments" FOR EACH ROW EXECUTE FUNCTION "assign_commerce_numbers"();
CREATE TRIGGER "receipt_number_before_insert" BEFORE INSERT ON "commerce_receipts" FOR EACH ROW EXECUTE FUNCTION "assign_commerce_numbers"();
CREATE TRIGGER "movement_number_before_insert" BEFORE INSERT ON "stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "assign_commerce_numbers"();

CREATE OR REPLACE FUNCTION "reject_commerce_history_mutation"() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION '% is immutable',TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "stock_ledger_immutable" BEFORE UPDATE OR DELETE ON "stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "reject_commerce_history_mutation"();
CREATE TRIGGER "commerce_status_history_immutable" BEFORE UPDATE OR DELETE ON "commerce_order_status_history" FOR EACH ROW EXECUTE FUNCTION "reject_commerce_history_mutation"();
CREATE OR REPLACE FUNCTION "protect_invoice_snapshot"() RETURNS TRIGGER AS $$ BEGIN
IF TG_OP = 'DELETE' OR NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber" OR
NEW."customerName" IS DISTINCT FROM OLD."customerName" OR NEW."gstNumber" IS DISTINCT FROM OLD."gstNumber" OR
NEW."taxableValue" IS DISTINCT FROM OLD."taxableValue" OR NEW."cgst" IS DISTINCT FROM OLD."cgst" OR NEW."sgst" IS DISTINCT FROM OLD."sgst" OR
NEW."igst" IS DISTINCT FROM OLD."igst" OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal"
THEN RAISE EXCEPTION 'invoice commercial snapshot is immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "commercial_invoice_immutable" BEFORE UPDATE OR DELETE ON "commercial_invoices" FOR EACH ROW EXECUTE FUNCTION "protect_invoice_snapshot"();
CREATE TRIGGER "commercial_invoice_lines_immutable" BEFORE UPDATE OR DELETE ON "commercial_invoice_lines" FOR EACH ROW EXECUTE FUNCTION "reject_commerce_history_mutation"();
CREATE TRIGGER "commerce_receipts_immutable" BEFORE UPDATE OR DELETE ON "commerce_receipts" FOR EACH ROW EXECUTE FUNCTION "reject_commerce_history_mutation"();
CREATE TRIGGER "commerce_documents_immutable" BEFORE UPDATE OR DELETE ON "commerce_documents" FOR EACH ROW EXECUTE FUNCTION "reject_commerce_history_mutation"();
