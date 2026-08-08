# Seera Risk Register

Last reviewed: 2026-08-08

| ID | Risk | Severity | Current control | Required closure/evidence | Status |
|---|---|---:|---|---|---|
| R-001 | Seera commands reach a MUV database. | Critical | Non-connecting denylist/equality/fallback guard; DB scripts blocked. | Maintain static vectors and require guard in every future DB entrypoint. | Mitigated |
| R-002 | Production and test DB are the same. | Critical | Separate identities verified; normalized equality rejected. | Add database-resident marker before DB-backed tests. | Mitigated |
| R-003 | No independent Seera Git history. | High | Independent root baseline commit `0192067`. | Maintain reviewed commits/rollback evidence. | Closed |
| R-004 | Copied MUV application is mistaken for Seera-ready code. | High | Routes/scripts/schema/migrations archived; active surface Seera-only. | Selective adaptation with dependency proof. | Mitigated |
| R-022 | A migration command accidentally targets production or MUV. | Critical | Atomic target guard, explicit test URL injection, known-MUV rejection, production-write denial, and destructive reset confirmation. | Keep all schema writes behind the guarded wrapper. | Mitigated |
| R-023 | Browser-forged role/session reaches protected Seera authority. | Critical | HttpOnly hash-stored sessions, state/version checks, DB-derived permissions, page/API enforcement. | Preserve centralized authorization and adversarial regression. | Mitigated |
| R-024 | Admin escalation removes last Founder or grants system authority. | Critical | Super-admin grant restriction, self-lockout denial, last-Founder protection and audit. | Require explicit future governance for authority-policy changes. | Mitigated |
| R-025 | Errors, health or logs disclose credentials/infrastructure. | High | Stable safe error taxonomy, correlation IDs, redacted structured logs and disclosure tests. | Preserve redaction tests for new integrations. | Mitigated |
| R-026 | In-memory rate limits are mistaken for horizontally scaled protection. | High | Explicit process-local classification and adapter boundary. | Add distributed backing before multi-instance production. | Accepted deployment dependency |
| R-005 | Cross-party/territory authorization leakage. | Critical | Deny-by-default policy architecture. | Authorization matrix and adversarial integration tests every phase. | Planned |
| R-006 | Booked orders counted as actual sales. | Critical | Item fulfilment events and constitutional formula. | Partial/refused/return/reversal reconciliation tests. | Planned |
| R-007 | Payment proof treated as verified funds. | Critical | Separate proof/review/allocation states. | Duplicate UTR and maker-checker workflow tests. | Planned |
| R-008 | Ledger history edited or unbalanced. | Critical | Append-only balanced journals and reversals. | DB constraints, transactional tests, reconciliation. | Planned |
| R-009 | Wrong legal seller/GST profile on invoice. | Critical | Transaction seller and immutable billing snapshot. | Current Indian GST review and seller-identity test matrix. | Policy dependency |
| R-010 | Document/file exposure through URLs or IDOR. | Critical | Private storage, scoped signed grants, audit. | Upload/download/share penetration tests and malware strategy. | Planned |
| R-011 | GPS over-collection or off-duty surveillance. | High | Work-state gating and configurable retention. | Founder/legal-approved privacy policy and device tests. | Policy dependency |
| R-012 | Offline retry duplicates business events. | High | Idempotency records and sync command protocol. | Loss/retry/reorder/conflict test suite. | Planned |
| R-013 | Partner closure erases or strands obligations. | Critical | Lifecycle events and pre-closure review. | Force-close policy and historical-retention workflow tests. | Policy dependency |
| R-014 | Notification/provider failure corrupts workflow. | Medium | Outbox and optional delivery adapters. | Retry/dead-letter observability and failure tests. | Planned |
| R-015 | Reports diverge from source transactions. | High | Rebuildable scoped read models. | Reconciliation tests against events/journals. | Planned |
| R-016 | Tax, credit, incentive, or TA policy is fabricated. | Critical | Explicit decision gate. | Written Founder/legal approval before affected implementation. | Open when phase reached |
| R-017 | Secrets or sensitive GPS/financial data leak to logs. | High | Structured redaction contract. | Security tests and observability review. | Planned |
| R-018 | Migration causes irreversible loss. | Critical | Forward-only governance. | Disposable test rehearsal, backup/restore and rollback evidence per migration. | Planned |
| R-019 | Large field/network datasets cause unusable UX. | High | Pagination, caching, indexes, mobile budgets. | Realistic-volume and 30–40-call-day performance tests. | Planned |
| R-020 | Copied historical Seera docs direct work back into MUV. | High | New constitution and decision register supersede them. | Mark historical docs superseded during Phase 1 documentation cleanup without deleting evidence. | Open |
| R-021 | MUV changes concurrently during Seera zero-harm verification. | High | No Seera write path found; external divergence record and current hash baseline captured. | Re-baseline and re-check Seera write paths when future differences appear; never revert unrelated MUV work. | Mitigated |
