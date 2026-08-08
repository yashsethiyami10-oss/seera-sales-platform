# Database Integrity Review

All 16 foundation models retain primary keys; expected unique identities, 12 foreign keys and 55 indexes are present. Delete behavior is deliberate: auth records cascade, role assignments and notification recipients restrict, optional audit/uploader actors set null. Session, audit, notification, settings/flags, idempotency and outbox polling indexes cover Phase 1 access. Idempotency has `(scope,key)` uniqueness and lifecycle/expiry indexes; outbox has status/availability, attempts and aggregate ordering. No forward migration is justified.
