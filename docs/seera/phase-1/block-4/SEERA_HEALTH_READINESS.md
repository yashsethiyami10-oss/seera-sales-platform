# Health and Readiness

`/api/health/live` reports process liveness only. `/api/health/ready` performs structural configuration and database-identity classification without connecting or exposing endpoint/fingerprint/credentials. Both are no-store. Database connectivity monitoring may be added later through an explicitly read-only, guarded operator probe.
