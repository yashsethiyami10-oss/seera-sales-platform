-- Attribution is immutable provenance. Finalized calculation and target
-- children inherit the immutability of their parent record.
CREATE OR REPLACE FUNCTION prevent_network_evidence_mutation()
RETURNS TRIGGER AS $$
DECLARE parent_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'network_partner_order_sources' THEN
    RAISE EXCEPTION 'Enterprise Business Network source attribution is immutable';
  ELSIF TG_TABLE_NAME = 'network_royalty_lines' THEN
    SELECT status INTO parent_status FROM "network_royalty_runs" WHERE id = OLD."runId";
  ELSIF TG_TABLE_NAME = 'network_commission_lines' THEN
    SELECT status INTO parent_status FROM "network_commission_runs" WHERE id = OLD."runId";
  ELSIF TG_TABLE_NAME = 'network_target_lines' THEN
    SELECT status INTO parent_status FROM "network_target_plans" WHERE id = OLD."planId";
  END IF;
  IF parent_status IN ('FINALIZED','REVERSED','APPROVED','ACTIVE') THEN
    RAISE EXCEPTION 'Finalized Enterprise Business Network child evidence is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER network_order_sources_immutable BEFORE UPDATE OR DELETE ON "network_partner_order_sources"
FOR EACH ROW EXECUTE FUNCTION prevent_network_evidence_mutation();
CREATE TRIGGER network_royalty_lines_immutable BEFORE UPDATE OR DELETE ON "network_royalty_lines"
FOR EACH ROW EXECUTE FUNCTION prevent_network_evidence_mutation();
CREATE TRIGGER network_commission_lines_immutable BEFORE UPDATE OR DELETE ON "network_commission_lines"
FOR EACH ROW EXECUTE FUNCTION prevent_network_evidence_mutation();
CREATE TRIGGER network_target_lines_immutable BEFORE UPDATE OR DELETE ON "network_target_lines"
FOR EACH ROW EXECUTE FUNCTION prevent_network_evidence_mutation();
