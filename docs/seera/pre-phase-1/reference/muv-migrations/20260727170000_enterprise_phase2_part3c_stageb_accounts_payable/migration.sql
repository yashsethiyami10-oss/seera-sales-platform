-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Stage B — Accounts
-- Payable. Additive only. Reuses the existing Phase 1 `enterprise_vendors`
-- table directly (finance_vendor_accounts.vendorId -> enterprise_vendors.id)
-- — no duplicate supplier master. As with every prior Finance migration,
-- `prisma migrate diff`'s proposed DROPs of hand-written users(id) foreign
-- keys on finance_* tables are deliberately excluded.

CREATE TABLE "finance_vendor_accounts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_vendor_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_vendor_bills" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "vendorAccountId" TEXT NOT NULL,
    "supplierInvoiceNo" TEXT NOT NULL,
    "sourcePurchaseOrderId" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "outstandingAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_vendor_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_vendor_payments" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "vendorAccountId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "unallocatedAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "journalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_vendor_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_vendor_payment_allocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversalOfAllocationId" TEXT,
    "allocatedById" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_vendor_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_vendor_accounts_vendorId_key" ON "finance_vendor_accounts"("vendorId");
CREATE INDEX "finance_vendor_accounts_organizationKey_status_idx" ON "finance_vendor_accounts"("organizationKey", "status");
CREATE UNIQUE INDEX "finance_vendor_accounts_organizationKey_vendorId_key" ON "finance_vendor_accounts"("organizationKey", "vendorId");

CREATE UNIQUE INDEX "finance_vendor_bills_journalId_key" ON "finance_vendor_bills"("journalId");
CREATE INDEX "finance_vendor_bills_organizationKey_status_dueDate_idx" ON "finance_vendor_bills"("organizationKey", "status", "dueDate");
CREATE UNIQUE INDEX "finance_vendor_bills_organizationKey_billNumber_key" ON "finance_vendor_bills"("organizationKey", "billNumber");
-- Duplicate-vendor-invoice detection (Section 21): the same supplier
-- invoice number cannot be billed twice for the same vendor.
CREATE UNIQUE INDEX "finance_vendor_bills_organizationKey_vendorAccountId_suppli_key" ON "finance_vendor_bills"("organizationKey", "vendorAccountId", "supplierInvoiceNo");

CREATE UNIQUE INDEX "finance_vendor_bill_lines_organizationKey_billId_lineNumber_key" ON "finance_vendor_bill_lines"("organizationKey", "billId", "lineNumber");

CREATE UNIQUE INDEX "finance_vendor_payments_journalId_key" ON "finance_vendor_payments"("journalId");
CREATE INDEX "finance_vendor_payments_organizationKey_vendorAccountId_sta_idx" ON "finance_vendor_payments"("organizationKey", "vendorAccountId", "status");
CREATE UNIQUE INDEX "finance_vendor_payments_organizationKey_paymentNumber_key" ON "finance_vendor_payments"("organizationKey", "paymentNumber");

CREATE UNIQUE INDEX "finance_vendor_payment_allocations_reversalOfAllocationId_key" ON "finance_vendor_payment_allocations"("reversalOfAllocationId");
CREATE INDEX "finance_vendor_payment_allocations_organizationKey_paymentI_idx" ON "finance_vendor_payment_allocations"("organizationKey", "paymentId");
CREATE INDEX "finance_vendor_payment_allocations_organizationKey_billId_idx" ON "finance_vendor_payment_allocations"("organizationKey", "billId");

ALTER TABLE "finance_vendor_accounts" ADD CONSTRAINT "finance_vendor_accounts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "enterprise_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "finance_vendor_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bill_lines" ADD CONSTRAINT "finance_vendor_bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "finance_vendor_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bill_lines" ADD CONSTRAINT "finance_vendor_bill_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payments" ADD CONSTRAINT "finance_vendor_payments_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "finance_vendor_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payments" ADD CONSTRAINT "finance_vendor_payments_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "finance_vendor_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_billId_fkey" FOREIGN KEY ("billId") REFERENCES "finance_vendor_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_reversalOfAllocationId_fkey" FOREIGN KEY ("reversalOfAllocationId") REFERENCES "finance_vendor_payment_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_vendor_accounts" ADD CONSTRAINT "finance_vendor_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payments" ADD CONSTRAINT "finance_vendor_payments_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payments" ADD CONSTRAINT "finance_vendor_payments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance_vendor_bills" ADD CONSTRAINT "finance_vendor_bills_totals_non_negative" CHECK ("subtotal" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0 AND "outstandingAmount" >= 0);
ALTER TABLE "finance_vendor_payments" ADD CONSTRAINT "finance_vendor_payments_amount_positive" CHECK ("amount" > 0 AND "unallocatedAmount" >= 0);
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_amount_positive" CHECK ("allocatedAmount" > 0);
ALTER TABLE "finance_vendor_payment_allocations" ADD CONSTRAINT "finance_vendor_payment_allocations_no_self_reversal" CHECK ("reversalOfAllocationId" IS NULL OR "reversalOfAllocationId" <> "id");

-- Payment allocations are append-only, same as finance_receipt_allocations.
CREATE TRIGGER finance_vendor_payment_allocations_immutable
  BEFORE UPDATE OR DELETE ON "finance_vendor_payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_ledger_mutation();

-- Once a bill leaves DRAFT its commercial content is immutable, mirroring
-- finance_receivable_invoices' own trigger.
CREATE OR REPLACE FUNCTION finance_reject_approved_bill_mutation() RETURNS trigger AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'A non-draft vendor bill cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' THEN
    old_row := to_jsonb(OLD) - 'status' - 'outstandingAmount' - 'journalId' - 'approvedById' - 'approvedAt'
             - 'postedById' - 'postedAt' - 'updatedAt' - 'version';
    new_row := to_jsonb(NEW) - 'status' - 'outstandingAmount' - 'journalId' - 'approvedById' - 'approvedAt'
             - 'postedById' - 'postedAt' - 'updatedAt' - 'version';
    IF old_row IS DISTINCT FROM new_row THEN
      RAISE EXCEPTION 'A non-draft vendor bill''s commercial content is immutable; use a vendor credit or successor document';
    END IF;
    IF OLD."journalId" IS NOT NULL AND NEW."journalId" IS DISTINCT FROM OLD."journalId" THEN
      RAISE EXCEPTION 'A vendor bill''s journal reference cannot be changed once set';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_vendor_bills_approved_immutable
  BEFORE UPDATE OR DELETE ON "finance_vendor_bills"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_approved_bill_mutation();

CREATE OR REPLACE FUNCTION finance_reject_approved_bill_line_mutation() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status FROM "finance_vendor_bills" WHERE "id" = COALESCE(NEW."billId", OLD."billId");
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Lines of a non-draft vendor bill are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_vendor_bill_lines_immutable
  BEFORE UPDATE OR DELETE ON "finance_vendor_bill_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_approved_bill_line_mutation();

CREATE OR REPLACE FUNCTION finance_assert_vendor_bill_line_organization() RETURNS trigger AS $$
DECLARE
  account_org TEXT;
BEGIN
  SELECT "organizationKey" INTO account_org FROM "finance_accounts" WHERE "id" = NEW."accountId";
  IF account_org IS NULL OR account_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Vendor bill line account must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_vendor_bill_lines_org_guard
  BEFORE INSERT OR UPDATE ON "finance_vendor_bill_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_vendor_bill_line_organization();

CREATE OR REPLACE FUNCTION finance_assert_vendor_allocation_same_vendor() RETURNS trigger AS $$
DECLARE
  payment_vendor TEXT;
  bill_vendor TEXT;
BEGIN
  SELECT "vendorAccountId" INTO payment_vendor FROM "finance_vendor_payments" WHERE "id" = NEW."paymentId";
  SELECT "vendorAccountId" INTO bill_vendor FROM "finance_vendor_bills" WHERE "id" = NEW."billId";
  IF payment_vendor IS DISTINCT FROM bill_vendor THEN
    RAISE EXCEPTION 'A payment may only be allocated to a bill belonging to the same vendor account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_vendor_payment_allocations_vendor_guard
  BEFORE INSERT ON "finance_vendor_payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_vendor_allocation_same_vendor();
