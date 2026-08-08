-- Permit the one governed mutation that links an immutable agreement to its
-- successor while continuing to reject changes to finalized commercial data.
CREATE OR REPLACE FUNCTION prevent_finalized_network_mutation()
RETURNS TRIGGER AS $$
DECLARE protected BOOLEAN := FALSE;
BEGIN
  protected := CASE TG_TABLE_NAME
    WHEN 'network_agreements' THEN OLD.status IN ('APPROVED','PENDING_EXECUTION','ACTIVE','EXPIRED','TERMINATED','SUPERSEDED')
    WHEN 'network_royalty_runs' THEN OLD.status IN ('FINALIZED','REVERSED')
    WHEN 'network_commission_runs' THEN OLD.status IN ('FINALIZED','REVERSED')
    WHEN 'network_claims' THEN OLD.status IN ('APPROVED','PARTIALLY_APPROVED','SETTLED')
    WHEN 'network_target_plans' THEN OLD.status IN ('APPROVED','FINALIZED','ACTIVE')
    WHEN 'network_training_assignments' THEN OLD.status IN ('COMPLETED','EXPIRED')
    WHEN 'network_compliance_records' THEN OLD.status IN ('COMPLIANT','NON_COMPLIANT','EXPIRED')
    ELSE FALSE
  END;
  IF TG_TABLE_NAME = 'network_agreements' AND TG_OP = 'UPDATE'
     AND OLD.status IN ('APPROVED','PENDING_EXECUTION','ACTIVE')
     AND NEW.status = 'SUPERSEDED'
     AND (to_jsonb(NEW) - 'status' - 'supersededById' - 'updatedAt') =
         (to_jsonb(OLD) - 'status' - 'supersededById' - 'updatedAt') THEN
    protected := FALSE;
  END IF;
  IF protected THEN
    RAISE EXCEPTION 'Finalized Enterprise Business Network history is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
