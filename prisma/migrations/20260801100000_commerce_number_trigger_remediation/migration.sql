-- Production-safety remediation: the shared `assign_commerce_numbers()`
-- BEFORE INSERT trigger function (introduced in
-- 20260727060000_commerce_operations_v2, migration.sql lines 468-481) is
-- called by five separate triggers, one each on "orders",
-- "commercial_invoices", "commerce_payments", "commerce_receipts", and
-- "stock_ledger_entries". Its body contains five independent `IF
-- TG_TABLE_NAME = '<table>' AND (NEW."<field>" IS NULL ...)` statements —
-- one per table, each referencing a field name that only exists on that
-- one table.
--
-- Root cause: PL/pgSQL must parse and resolve every `NEW."field"`
-- reference in a statement it reaches during control flow, against the
-- actual row type bound to NEW for that specific trigger firing — this
-- resolution happens at parse/analyze time, before any AND short-circuit
-- evaluation. Every trigger firing on a shared, generically-typed NEW
-- record reaches all five IF statements in sequence, so it always tries
-- to resolve four field names that do not exist on the row currently
-- firing (e.g., when NEW is an "orders" row, the second statement's
-- `NEW."invoiceNumber"` has no such field to resolve). The condition's
-- own TG_TABLE_NAME guard never gets a chance to short-circuit that
-- resolution. Confirmed via direct reproduction: every insert into any
-- of the five tables fails unconditionally with `record "new" has no
-- field "invoiceNumber"` (or the equivalent for whichever branch is
-- reached first for a non-"orders" table) — this does not depend on
-- session history, connection pooling, or insert ordering; it is a
-- 100%-reproducible parse-time failure on every single invocation,
-- confirmed against both a clean schema-replica database and the
-- populated development database, and confirmed to affect the real
-- checkout path (actions/orders.ts's createOrder, which supplies its own
-- non-empty orderNumber and would never rely on this trigger's
-- assignment branch even if it worked, but is still blocked because the
-- shared function fails regardless of which branch would apply).
--
-- This exact anti-pattern, and this exact fix, was already identified
-- and corrected once before in this codebase for a different domain: see
-- 20260727070100_phase6_number_triggers, which replaced
-- customer_growth_intelligence_v2's equivalent shared
-- `phase6_assign_numbers()` function with three per-table functions.
-- This migration applies the identical, already-proven pattern to the
-- five commerce tables that were never given the same fix.
--
-- Preserved exactly, unchanged: every number format/prefix
-- ('MUV-ORD-YYYY-NNNNNN', 'MUV-INV-YYYY-NNNNNN', 'MUV-PAY-YYYY-NNNNNN',
-- 'MUV-RCP-YYYY-NNNNNN', 'MUV-STK-YYYY-NNNNNNNN' — note stock_ledger's
-- own 8-digit padding, unchanged), every sequence (reused by name, none
-- recreated, none reset), every uniqueness constraint (unchanged —
-- defined on the columns themselves in the original migration, untouched
-- here), trigger timing (BEFORE INSERT FOR EACH ROW, unchanged), and the
-- separate immutability triggers ("reject_commerce_history_mutation",
-- "protect_invoice_snapshot" and everything bound to them) — none of
-- that is touched by this migration at all.
--
-- Data safety: confirmed via direct inspection before writing this
-- migration that commercial_invoices/commerce_payments/commerce_receipts/
-- stock_ledger_entries have zero rows in the development database (the
-- trigger has never once succeeded since it was introduced, so nothing
-- was ever written through it), and all existing "orders" rows predate
-- 20260727060000_commerce_operations_v2 entirely (created before this
-- trigger existed, numbered by application-level logic in
-- actions/orders.ts that has never depended on this trigger's assignment
-- branch). No row is renumbered, updated, or deleted by this migration.

DROP TRIGGER IF EXISTS "commerce_order_number_before_insert" ON "orders";
DROP TRIGGER IF EXISTS "invoice_number_before_insert" ON "commercial_invoices";
DROP TRIGGER IF EXISTS "payment_number_before_insert" ON "commerce_payments";
DROP TRIGGER IF EXISTS "receipt_number_before_insert" ON "commerce_receipts";
DROP TRIGGER IF EXISTS "movement_number_before_insert" ON "stock_ledger_entries";
DROP FUNCTION IF EXISTS "assign_commerce_numbers"();

CREATE OR REPLACE FUNCTION "assign_order_number"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."orderNumber" IS NULL OR NEW."orderNumber" = '' THEN
    NEW."orderNumber" := 'MUV-ORD-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_order_number_seq')::TEXT,6,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "assign_invoice_number"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."invoiceNumber" IS NULL OR NEW."invoiceNumber" = '' THEN
    NEW."invoiceNumber" := 'MUV-INV-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT,6,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "assign_payment_number"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."paymentNumber" IS NULL OR NEW."paymentNumber" = '' THEN
    NEW."paymentNumber" := 'MUV-PAY-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_payment_number_seq')::TEXT,6,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "assign_receipt_number"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."receiptNumber" IS NULL OR NEW."receiptNumber" = '' THEN
    NEW."receiptNumber" := 'MUV-RCP-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('commerce_receipt_number_seq')::TEXT,6,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "assign_stock_movement_number"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."movementNumber" IS NULL OR NEW."movementNumber" = '' THEN
    NEW."movementNumber" := 'MUV-STK-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(NEXTVAL('stock_movement_number_seq')::TEXT,8,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "commerce_order_number_before_insert" BEFORE INSERT ON "orders" FOR EACH ROW EXECUTE FUNCTION "assign_order_number"();
CREATE TRIGGER "invoice_number_before_insert" BEFORE INSERT ON "commercial_invoices" FOR EACH ROW EXECUTE FUNCTION "assign_invoice_number"();
CREATE TRIGGER "payment_number_before_insert" BEFORE INSERT ON "commerce_payments" FOR EACH ROW EXECUTE FUNCTION "assign_payment_number"();
CREATE TRIGGER "receipt_number_before_insert" BEFORE INSERT ON "commerce_receipts" FOR EACH ROW EXECUTE FUNCTION "assign_receipt_number"();
CREATE TRIGGER "movement_number_before_insert" BEFORE INSERT ON "stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "assign_stock_movement_number"();
