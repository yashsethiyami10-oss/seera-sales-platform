# Seera Phase 1 Zero-Harm Boundary Confirmation

Founder-approved Option C+D remains authoritative.

Phase 1, if later authorized, is limited to new additive organisation/membership/role-assignment/settings/feature-flag/sequence records, a Seera organisation, new Seera-only context/guards/routes or adapters, isolation tests and reversible migration scaffolding. All new paths fail closed without an explicit active membership and never default to MUV.

Phase 1 excludes Customer/Product/Order/BusinessOrder conversion, Role enum replacement, MUV finance-key changes, legacy backfill and every Seera business workflow. Existing MUV routes continue using existing authoritative behavior.

An optional `User` relation may be proposed only as an additive relation declaration: no scalar, unique constraint, authentication lookup, creation flow, role or Phase 1 user backfill may change. If even that cannot pass the full MUV baseline, use scalar IDs/new tables without modifying User.

Rollback remains feature-flag/code rollback with new tables dormant; no existing MUV row is rewritten. This boundary is approved architecture documentation, not Phase 1 authorization.

