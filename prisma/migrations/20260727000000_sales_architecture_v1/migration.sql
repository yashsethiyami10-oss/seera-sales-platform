ALTER TABLE "users"
  ADD COLUMN "salesRoleId" TEXT,
  ADD COLUMN "territoryId" TEXT,
  ADD COLUMN "reportingManagerId" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "sales_roles" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "sales_permissions" (
  "id" TEXT PRIMARY KEY, "permissionKey" TEXT NOT NULL UNIQUE, "displayName" TEXT NOT NULL,
  "module" TEXT NOT NULL, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "sales_role_permissions" (
  "roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL,
  PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "sales_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "sales_roles"("id") ON DELETE CASCADE,
  CONSTRAINT "sales_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "sales_permissions"("id") ON DELETE CASCADE
);
CREATE TABLE "territories" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "code" TEXT NOT NULL UNIQUE, "parentTerritoryId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "territories_parentTerritoryId_fkey" FOREIGN KEY ("parentTerritoryId") REFERENCES "territories"("id") ON DELETE RESTRICT
);
CREATE TABLE "sales_audit_logs" (
  "id" TEXT PRIMARY KEY, "userId" TEXT, "module" TEXT NOT NULL, "action" TEXT NOT NULL,
  "recordType" TEXT, "recordId" TEXT, "previousValue" JSONB, "newValue" JSONB,
  "ipAddress" TEXT, "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
);
ALTER TABLE "users" ADD CONSTRAINT "users_salesRoleId_fkey" FOREIGN KEY ("salesRoleId") REFERENCES "sales_roles"("id") ON DELETE SET NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX "users_salesRoleId_idx" ON "users"("salesRoleId");
CREATE INDEX "users_territoryId_idx" ON "users"("territoryId");
CREATE INDEX "users_reportingManagerId_idx" ON "users"("reportingManagerId");
CREATE INDEX "sales_permissions_module_idx" ON "sales_permissions"("module");
CREATE INDEX "territories_parentTerritoryId_idx" ON "territories"("parentTerritoryId");
CREATE INDEX "sales_audit_logs_userId_createdAt_idx" ON "sales_audit_logs"("userId", "createdAt");
CREATE INDEX "sales_audit_logs_module_action_createdAt_idx" ON "sales_audit_logs"("module", "action", "createdAt");

CREATE FUNCTION reject_sales_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'sales audit logs are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "sales_audit_logs"
FOR EACH ROW EXECUTE FUNCTION reject_sales_audit_mutation();
