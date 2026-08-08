# Phase 11 Hardening

- Mutating APIs receive origin checks and correlation IDs.
- Portal and operational routes receive CSP, content-type, referrer and permissions headers.
- Login cookies are HTTP-only, production-secure and SameSite Strict.
- Upload size, metadata, extension and file-signature checks reject active/executable content.
- Readiness checks database connectivity, database identity and rate-limit topology.
- Multi-replica launch is rejected while the in-memory rate-limit backend is selected.

Launch configuration must remain `APP_REPLICA_COUNT=1` and `RATE_LIMIT_BACKEND=memory` until a real distributed backend is implemented and verified.
