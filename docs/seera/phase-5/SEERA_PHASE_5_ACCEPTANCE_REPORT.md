# Seera Phase 5 — Super Stockist Portal

## Executive summary

Phase 5 activates a separate Super Stockist experience for distributor replenishment, configurable S.S.-to-Distributor credit, reminder scheduling, grace and promise visibility, movement-ledger stock, reconciliation, company replenishment, payment proof states, claims, and notifications.

## Commercial integrity

Company-to-Super-Stockist is advance only. Company fulfilment rejects nonzero credit days and any payment proof state other than `VERIFIED`. Payment proof submission never verifies itself. S.S.-to-Distributor credit remains per-distributor, effective-dated, threshold-driven, and override-governed.

Original contractual due date, grace-until, promised payment date, formal term version, payment date, and underlying overdue are separate facts. Promise and grace may alter escalation severity but cannot rewrite contractual due date.

## Permissions and UX

The S.S. portal navigation is Distributor Orders, Dispatch, Inventory, Credit, and Company Orders. Membership scope prevents access to another S.S. or distributor network. Accounts verification remains Phase 8; notification automation delivery remains Phase 10.

## Tests and security

Tests cover advance-only rejection, verified-advance acceptance, configurable credit, underlying overdue during grace/promise, relative reminder schedules, scope separation, inventory integrity, and payment-proof status semantics.

## Acceptance verdict

Requirements implemented in the authorized Phase 5 scope. Final freeze depends on the combined regression and freeze report.
