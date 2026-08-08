-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Stage B — Accounts
-- Receivable. Additive only. Reuses the existing `customers` table directly
-- (finance_customer_accounts.customerId -> customers.id) — no duplicate
-- customer identity. As with the two prior Finance migrations, the
-- `prisma migrate diff` output's proposed DROPs of the hand-written
-- users(id) foreign keys on finance_* tables are deliberately excluded.

CREATE TABLE "finance_customer_accounts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creditLimit" DECIMAL(18,2),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_customer_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_receivable_invoices" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "sourceOrderId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "outstandingAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_receivable_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_receivable_invoice_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_receivable_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_customer_receipts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "unallocatedAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_customer_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_receipt_allocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversalOfAllocationId" TEXT,
    "allocatedById" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_receipt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_customer_accounts_customerId_key" ON "finance_customer_accounts"("customerId");
CREATE INDEX "finance_customer_accounts_organizationKey_status_idx" ON "finance_customer_accounts"("organizationKey", "status");
CREATE UNIQUE INDEX "finance_customer_accounts_organizationKey_customerId_key" ON "finance_customer_accounts"("organizationKey", "customerId");

CREATE UNIQUE INDEX "finance_receivable_invoices_journalId_key" ON "finance_receivable_invoices"("journalId");
CREATE INDEX "finance_receivable_invoices_organizationKey_customerAccount_idx" ON "finance_receivable_invoices"("organizationKey", "customerAccountId", "status");
CREATE INDEX "finance_receivable_invoices_organizationKey_status_dueDate_idx" ON "finance_receivable_invoices"("organizationKey", "status", "dueDate");
CREATE INDEX "finance_receivable_invoices_organizationKey_sourceOrderId_idx" ON "finance_receivable_invoices"("organizationKey", "sourceOrderId");
CREATE UNIQUE INDEX "finance_receivable_invoices_organizationKey_invoiceNumber_key" ON "finance_receivable_invoices"("organizationKey", "invoiceNumber");

CREATE UNIQUE INDEX "finance_receivable_invoice_lines_organizationKey_invoiceId__key" ON "finance_receivable_invoice_lines"("organizationKey", "invoiceId", "lineNumber");

CREATE UNIQUE INDEX "finance_customer_receipts_journalId_key" ON "finance_customer_receipts"("journalId");
CREATE INDEX "finance_customer_receipts_organizationKey_customerAccountId_idx" ON "finance_customer_receipts"("organizationKey", "customerAccountId", "status");
CREATE UNIQUE INDEX "finance_customer_receipts_organizationKey_receiptNumber_key" ON "finance_customer_receipts"("organizationKey", "receiptNumber");

CREATE UNIQUE INDEX "finance_receipt_allocations_reversalOfAllocationId_key" ON "finance_receipt_allocations"("reversalOfAllocationId");
CREATE INDEX "finance_receipt_allocations_organizationKey_receiptId_idx" ON "finance_receipt_allocations"("organizationKey", "receiptId");
CREATE INDEX "finance_receipt_allocations_organizationKey_invoiceId_idx" ON "finance_receipt_allocations"("organizationKey", "invoiceId");

ALTER TABLE "finance_customer_accounts" ADD CONSTRAINT "finance_customer_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "finance_customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoice_lines" ADD CONSTRAINT "finance_receivable_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "finance_receivable_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoice_lines" ADD CONSTRAINT "finance_receivable_invoice_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_customer_receipts" ADD CONSTRAINT "finance_customer_receipts_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "finance_customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_customer_receipts" ADD CONSTRAINT "finance_customer_receipts_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "finance_customer_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "finance_receivable_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_reversalOfAllocationId_fkey" FOREIGN KEY ("reversalOfAllocationId") REFERENCES "finance_receipt_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_customer_accounts" ADD CONSTRAINT "finance_customer_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_customer_receipts" ADD CONSTRAINT "finance_customer_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non-negative / positive-amount guards.
ALTER TABLE "finance_receivable_invoices" ADD CONSTRAINT "finance_receivable_invoices_totals_non_negative" CHECK ("subtotal" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0 AND "outstandingAmount" >= 0);
ALTER TABLE "finance_customer_receipts" ADD CONSTRAINT "finance_customer_receipts_amount_positive" CHECK ("amount" > 0 AND "unallocatedAmount" >= 0);
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_amount_positive" CHECK ("allocatedAmount" > 0);
ALTER TABLE "finance_receipt_allocations" ADD CONSTRAINT "finance_receipt_allocations_no_self_reversal" CHECK ("reversalOfAllocationId" IS NULL OR "reversalOfAllocationId" <> "id");

-- Receipt allocations are append-only (reversal is a new row, never an
-- update/delete of the original) — reuses the same unconditional-reject
-- function already installed for finance_ledger_entries.
CREATE TRIGGER finance_receipt_allocations_immutable
  BEFORE UPDATE OR DELETE ON "finance_receipt_allocations"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_ledger_mutation();

-- Once an invoice leaves DRAFT, its commercial content is immutable
-- (issued financial amounts become immutable — Section 17); status,
-- outstandingAmount, journalId (once), and the actor/timestamp columns for
-- later lifecycle steps are still allowed to change.
CREATE OR REPLACE FUNCTION finance_reject_issued_invoice_mutation() RETURNS trigger AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'A non-draft receivable invoice cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' THEN
    old_row := to_jsonb(OLD) - 'status' - 'outstandingAmount' - 'journalId' - 'updatedById' - 'updatedAt' - 'version'
             - 'issuedById' - 'issuedAt' - 'cancelledById' - 'cancelledAt';
    new_row := to_jsonb(NEW) - 'status' - 'outstandingAmount' - 'journalId' - 'updatedById' - 'updatedAt' - 'version'
             - 'issuedById' - 'issuedAt' - 'cancelledById' - 'cancelledAt';
    IF old_row IS DISTINCT FROM new_row THEN
      RAISE EXCEPTION 'A non-draft receivable invoice''s commercial content is immutable; use a credit note or successor document';
    END IF;
    IF OLD."journalId" IS NOT NULL AND NEW."journalId" IS DISTINCT FROM OLD."journalId" THEN
      RAISE EXCEPTION 'A receivable invoice''s journal reference cannot be changed once set';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_receivable_invoices_issued_immutable
  BEFORE UPDATE OR DELETE ON "finance_receivable_invoices"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_issued_invoice_mutation();

-- Invoice lines are immutable once the parent invoice has left DRAFT.
CREATE OR REPLACE FUNCTION finance_reject_issued_invoice_line_mutation() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status FROM "finance_receivable_invoices" WHERE "id" = COALESCE(NEW."invoiceId", OLD."invoiceId");
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Lines of a non-draft receivable invoice are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_receivable_invoice_lines_immutable
  BEFORE UPDATE OR DELETE ON "finance_receivable_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_issued_invoice_line_mutation();

-- Organization-consistent references: invoice lines' accounts, and
-- allocations' receipt/invoice pairing, must share the same organization
-- and (for allocations) the same customer account.
CREATE OR REPLACE FUNCTION finance_assert_invoice_line_organization() RETURNS trigger AS $$
DECLARE
  account_org TEXT;
BEGIN
  SELECT "organizationKey" INTO account_org FROM "finance_accounts" WHERE "id" = NEW."accountId";
  IF account_org IS NULL OR account_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Invoice line account must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_receivable_invoice_lines_org_guard
  BEFORE INSERT OR UPDATE ON "finance_receivable_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_invoice_line_organization();

CREATE OR REPLACE FUNCTION finance_assert_allocation_same_customer() RETURNS trigger AS $$
DECLARE
  receipt_customer TEXT;
  invoice_customer TEXT;
BEGIN
  SELECT "customerAccountId" INTO receipt_customer FROM "finance_customer_receipts" WHERE "id" = NEW."receiptId";
  SELECT "customerAccountId" INTO invoice_customer FROM "finance_receivable_invoices" WHERE "id" = NEW."invoiceId";
  IF receipt_customer IS DISTINCT FROM invoice_customer THEN
    RAISE EXCEPTION 'A receipt may only be allocated to an invoice belonging to the same customer account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_receipt_allocations_customer_guard
  BEFORE INSERT ON "finance_receipt_allocations"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_allocation_same_customer();
