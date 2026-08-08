-- Milestone 4 — Order Management OS: safe, sequential BusinessOrder numbering.
--
-- Mirrors the exact, already-proven single-table-function pattern from
-- 20260801100000_commerce_number_trigger_remediation: one dedicated
-- sequence, one function referencing only this table's own field, one
-- BEFORE INSERT trigger. Deliberately NOT sharing a function across tables
-- (that shared-function-with-per-table-branches shape was the root cause
-- remediated in that earlier migration) and NOT touching
-- commerce_order_number_seq / assign_order_number() / any of their
-- triggers, which remain exactly as they are.
--
-- Format: ORD-YYYY-NNNNNN (no "MUV-" prefix — this repository remains
-- single-company/single-organization; the format matches the requested
-- human-readable shape directly, since no org-disambiguation prefix is
-- needed with only one organization in play).
--
-- The trigger only assigns a number when the application supplies an empty
-- string for "orderNumber" (the same opt-in sentinel convention already
-- established by assign_order_number()) — never overrides an
-- explicitly-supplied value.

CREATE SEQUENCE IF NOT EXISTS "business_order_number_seq";

CREATE OR REPLACE FUNCTION "assign_business_order_number"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."orderNumber" IS NULL OR NEW."orderNumber" = '' THEN
    NEW."orderNumber" := 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('"business_order_number_seq"')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_order_number_before_insert"
BEFORE INSERT ON "business_orders"
FOR EACH ROW
EXECUTE FUNCTION "assign_business_order_number"();
