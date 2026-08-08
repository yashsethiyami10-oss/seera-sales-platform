# Seera Test Database Inventory

Guarded read-only inventory after migration:

`_prisma_migrations`, `app_settings`, `audit_logs`, `auth_accounts`, `auth_sessions`, `auth_verification_tokens`, `feature_flags`, `idempotency_keys`, `notification_deliveries`, `notifications`, `outbox_events`, `permissions`, `role_permissions`, `roles`, `stored_files`, `user_role_assignments`, `users`.

- Tables: 17 total (16 foundation + migration metadata).
- Applied migrations: 1.
- Primary keys: 16; foreign keys: 12; indexes: 55.
- Missing/unexpected/MUV/later-phase tables: none.
- Rows in every foundation table: zero.
