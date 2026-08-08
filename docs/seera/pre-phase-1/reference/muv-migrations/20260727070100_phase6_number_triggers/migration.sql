DROP TRIGGER IF EXISTS "reward_ledger_number_trigger" ON "reward_ledger_entries";
DROP TRIGGER IF EXISTS "referral_reference_code_trigger" ON "customer_referrals";
DROP TRIGGER IF EXISTS "executive_report_number_trigger" ON "executive_reports";
DROP FUNCTION IF EXISTS phase6_assign_numbers();

CREATE OR REPLACE FUNCTION phase6_reward_ledger_number() RETURNS trigger AS $$
BEGIN
  IF NEW."ledgerNumber" IS NULL OR NEW."ledgerNumber" = '' THEN
    NEW."ledgerNumber" := 'RWD-' || LPAD(nextval('reward_ledger_number_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION phase6_referral_number() RETURNS trigger AS $$
BEGIN
  IF NEW."referenceCode" IS NULL OR NEW."referenceCode" = '' THEN
    NEW."referenceCode" := 'REF-' || LPAD(nextval('referral_reference_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION phase6_report_number() RETURNS trigger AS $$
BEGIN
  IF NEW."reportNumber" IS NULL OR NEW."reportNumber" = '' THEN
    NEW."reportNumber" := 'EXR-' || LPAD(nextval('executive_report_number_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "reward_ledger_number_trigger" BEFORE INSERT ON "reward_ledger_entries" FOR EACH ROW EXECUTE FUNCTION phase6_reward_ledger_number();
CREATE TRIGGER "referral_reference_code_trigger" BEFORE INSERT ON "customer_referrals" FOR EACH ROW EXECUTE FUNCTION phase6_referral_number();
CREATE TRIGGER "executive_report_number_trigger" BEFORE INSERT ON "executive_reports" FOR EACH ROW EXECUTE FUNCTION phase6_report_number();
