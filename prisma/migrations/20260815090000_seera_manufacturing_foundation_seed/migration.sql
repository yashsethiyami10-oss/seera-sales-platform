-- Minimal, purely additive data migration for the Manufacturing release.
-- Applied via `prisma migrate deploy` (not gated by the application-level
-- production-write guard, which has no override for ad-hoc scripts by
-- design) because the two preceding schema migrations only create tables —
-- they do not populate the Role/Permission/RolePermission/FeatureFlag rows
-- the new Manufacturing roles and portal.manufacturing.enabled depend on at
-- runtime.
--
-- Every statement is idempotent (ON CONFLICT DO NOTHING) and strictly
-- additive: no UPDATE, no DELETE, no existing role's permission grants are
-- touched. No demo/test/business data of any kind is created here.

-- 24 new Manufacturing permissions.
INSERT INTO "permissions" ("id","code","resource","action","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text,'portal:manufacturing','portal','manufacturing',now(),now()),
  (gen_random_uuid()::text,'mfg_material:manage','mfg_material','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_location:manage','mfg_location','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_ledger:view','mfg_ledger','view',now(),now()),
  (gen_random_uuid()::text,'mfg_bom:manage','mfg_bom','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_bom:approve','mfg_bom','approve',now(),now()),
  (gen_random_uuid()::text,'mfg_sop:manage','mfg_sop','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_sop:approve','mfg_sop','approve',now(),now()),
  (gen_random_uuid()::text,'mfg_plan:manage','mfg_plan','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_order:manage','mfg_order','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_batch:execute','mfg_batch','execute',now(),now()),
  (gen_random_uuid()::text,'mfg_batch:supervise','mfg_batch','supervise',now(),now()),
  (gen_random_uuid()::text,'mfg_qc:enter','mfg_qc','enter',now(),now()),
  (gen_random_uuid()::text,'mfg_qc:release','mfg_qc','release',now(),now()),
  (gen_random_uuid()::text,'mfg_wastage:record','mfg_wastage','record',now(),now()),
  (gen_random_uuid()::text,'mfg_deviation:manage','mfg_deviation','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_grn:manage','mfg_grn','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_stock_transfer:manage','mfg_stock_transfer','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_stock_adjustment:manage','mfg_stock_adjustment','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_stock_count:manage','mfg_stock_count','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_machine_shift:manage','mfg_machine_shift','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_approval_policy:manage','mfg_approval_policy','manage',now(),now()),
  (gen_random_uuid()::text,'mfg_cost:view','mfg_cost','view',now(),now()),
  (gen_random_uuid()::text,'mfg_reports:view','mfg_reports','view',now(),now()),
  (gen_random_uuid()::text,'mfg_settings:manage','mfg_settings','manage',now(),now())
ON CONFLICT ("code") DO NOTHING;

-- 5 new Manufacturing roles.
INSERT INTO "roles" ("id","code","name","status","isSystem","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text,'MANUFACTURING_MANAGER','Manufacturing Manager','ACTIVE',false,now(),now()),
  (gen_random_uuid()::text,'PRODUCTION_SUPERVISOR','Production Supervisor','ACTIVE',false,now(),now()),
  (gen_random_uuid()::text,'STORE_EXECUTIVE','Store / Inventory Executive','ACTIVE',false,now(),now()),
  (gen_random_uuid()::text,'QC_USER','Quality / QC User','ACTIVE',false,now(),now()),
  (gen_random_uuid()::text,'PRODUCTION_OPERATOR','Production Operator','ACTIVE',false,now(),now())
ON CONFLICT ("code") DO NOTHING;

-- Role -> Permission grants for ONLY these 5 new roles, matching
-- ROLE_PERMISSION_MATRIX in lib/foundation/rbac-catalog.ts exactly.
-- No existing role's role_permissions rows are read, inserted, or deleted.
INSERT INTO "role_permissions" ("roleId","permissionId","grantedAt")
SELECT r.id, p.id, now()
FROM (VALUES
  ('MANUFACTURING_MANAGER','portal:manufacturing'),
  ('MANUFACTURING_MANAGER','mfg_material:manage'),
  ('MANUFACTURING_MANAGER','mfg_location:manage'),
  ('MANUFACTURING_MANAGER','mfg_ledger:view'),
  ('MANUFACTURING_MANAGER','mfg_bom:manage'),
  ('MANUFACTURING_MANAGER','mfg_bom:approve'),
  ('MANUFACTURING_MANAGER','mfg_sop:manage'),
  ('MANUFACTURING_MANAGER','mfg_sop:approve'),
  ('MANUFACTURING_MANAGER','mfg_plan:manage'),
  ('MANUFACTURING_MANAGER','mfg_order:manage'),
  ('MANUFACTURING_MANAGER','mfg_batch:execute'),
  ('MANUFACTURING_MANAGER','mfg_batch:supervise'),
  ('MANUFACTURING_MANAGER','mfg_qc:enter'),
  ('MANUFACTURING_MANAGER','mfg_wastage:record'),
  ('MANUFACTURING_MANAGER','mfg_deviation:manage'),
  ('MANUFACTURING_MANAGER','mfg_grn:manage'),
  ('MANUFACTURING_MANAGER','mfg_stock_transfer:manage'),
  ('MANUFACTURING_MANAGER','mfg_stock_adjustment:manage'),
  ('MANUFACTURING_MANAGER','mfg_stock_count:manage'),
  ('MANUFACTURING_MANAGER','mfg_machine_shift:manage'),
  ('MANUFACTURING_MANAGER','mfg_approval_policy:manage'),
  ('MANUFACTURING_MANAGER','mfg_cost:view'),
  ('MANUFACTURING_MANAGER','mfg_reports:view'),
  ('MANUFACTURING_MANAGER','mfg_settings:manage'),
  ('MANUFACTURING_MANAGER','document:view_scoped'),
  ('MANUFACTURING_MANAGER','document:upload'),
  ('MANUFACTURING_MANAGER','notifications:view'),
  ('MANUFACTURING_MANAGER','files:view'),
  ('MANUFACTURING_MANAGER','session:revoke_self'),

  ('PRODUCTION_SUPERVISOR','portal:manufacturing'),
  ('PRODUCTION_SUPERVISOR','mfg_ledger:view'),
  ('PRODUCTION_SUPERVISOR','mfg_order:manage'),
  ('PRODUCTION_SUPERVISOR','mfg_batch:execute'),
  ('PRODUCTION_SUPERVISOR','mfg_batch:supervise'),
  ('PRODUCTION_SUPERVISOR','mfg_wastage:record'),
  ('PRODUCTION_SUPERVISOR','mfg_deviation:manage'),
  ('PRODUCTION_SUPERVISOR','mfg_stock_transfer:manage'),
  ('PRODUCTION_SUPERVISOR','mfg_reports:view'),
  ('PRODUCTION_SUPERVISOR','document:view_scoped'),
  ('PRODUCTION_SUPERVISOR','document:upload'),
  ('PRODUCTION_SUPERVISOR','notifications:view'),
  ('PRODUCTION_SUPERVISOR','files:view'),
  ('PRODUCTION_SUPERVISOR','session:revoke_self'),

  ('STORE_EXECUTIVE','portal:manufacturing'),
  ('STORE_EXECUTIVE','mfg_ledger:view'),
  ('STORE_EXECUTIVE','mfg_grn:manage'),
  ('STORE_EXECUTIVE','mfg_stock_transfer:manage'),
  ('STORE_EXECUTIVE','mfg_stock_count:manage'),
  ('STORE_EXECUTIVE','mfg_batch:execute'),
  ('STORE_EXECUTIVE','mfg_reports:view'),
  ('STORE_EXECUTIVE','document:view_scoped'),
  ('STORE_EXECUTIVE','document:upload'),
  ('STORE_EXECUTIVE','notifications:view'),
  ('STORE_EXECUTIVE','files:view'),
  ('STORE_EXECUTIVE','session:revoke_self'),

  ('QC_USER','portal:manufacturing'),
  ('QC_USER','mfg_ledger:view'),
  ('QC_USER','mfg_qc:enter'),
  ('QC_USER','mfg_qc:release'),
  ('QC_USER','mfg_reports:view'),
  ('QC_USER','document:view_scoped'),
  ('QC_USER','document:upload'),
  ('QC_USER','notifications:view'),
  ('QC_USER','files:view'),
  ('QC_USER','session:revoke_self'),

  ('PRODUCTION_OPERATOR','portal:manufacturing'),
  ('PRODUCTION_OPERATOR','mfg_ledger:view'),
  ('PRODUCTION_OPERATOR','mfg_batch:execute'),
  ('PRODUCTION_OPERATOR','mfg_wastage:record'),
  ('PRODUCTION_OPERATOR','mfg_reports:view'),
  ('PRODUCTION_OPERATOR','notifications:view'),
  ('PRODUCTION_OPERATOR','files:view'),
  ('PRODUCTION_OPERATOR','session:revoke_self')
) AS grant_list(role_code, permission_code)
JOIN "roles" r ON r.code = grant_list.role_code
JOIN "permissions" p ON p.code = grant_list.permission_code
ON CONFLICT ("roleId","permissionId") DO NOTHING;

-- Feature flag gating the dedicated /portal/manufacturing route.
INSERT INTO "feature_flags" ("id","key","description","enabled","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'portal.manufacturing.enabled','Manufacturing portal availability',true,now(),now())
ON CONFLICT ("key") DO NOTHING;
