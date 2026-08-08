# Phase 8 — Accounts and Financial Control

Implemented organisation-scoped accounting periods, append-only financial entries and reversals, payment proof verification, payment records, partial allocations, unapplied balances/advances, formal credit extensions, reconciliation, claim settlement, ageing helpers, and a separate bilingual Accounts portal. Proof submission is not settlement; allocations cannot exceed verified payment value. Promise, grace, and formal extension dates remain distinct.

Verification: allocation, ageing, extension, reversal, portal, and RBAC rules are covered by local tests and the guarded TEST migration checkpoint.

Status: IMPLEMENTED / TESTED / VERIFIED / PASSED / FROZEN. Transactional posting/reversal, verified advances, partial allocation, distinct ageing dates, ledger read model, reconciliation, claim settlement, APIs and bilingual Accounts controls are executable and E2E verified.
