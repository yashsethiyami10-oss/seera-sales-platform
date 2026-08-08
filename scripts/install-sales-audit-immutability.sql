CREATE OR REPLACE FUNCTION reject_sales_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sales audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_audit_logs_immutable ON "sales_audit_logs";
CREATE TRIGGER sales_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "sales_audit_logs"
FOR EACH ROW EXECUTE FUNCTION reject_sales_audit_mutation();
