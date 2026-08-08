CREATE OR REPLACE FUNCTION "protect_quotation_number"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."quotationNumber" <> OLD."quotationNumber" THEN
    RAISE EXCEPTION 'quotation number is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "quotation_number_immutable"
BEFORE UPDATE ON "quotations"
FOR EACH ROW EXECUTE FUNCTION "protect_quotation_number"();

CREATE OR REPLACE FUNCTION "protect_locked_quotation_commercial_values"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."commercialLocked" AND (
    NEW."pricingPolicyId" IS DISTINCT FROM OLD."pricingPolicyId" OR
    NEW."issueDate" IS DISTINCT FROM OLD."issueDate" OR
    NEW."validUntil" IS DISTINCT FROM OLD."validUntil" OR
    NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR
    NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR
    NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal" OR
    NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal" OR
    NEW."termsSnapshot" IS DISTINCT FROM OLD."termsSnapshot"
  ) THEN
    RAISE EXCEPTION 'locked quotation commercial values are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "quotation_commercial_values_immutable"
BEFORE UPDATE ON "quotation_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_locked_quotation_commercial_values"();
