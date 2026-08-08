# Seera Phase 2 — Master Data & Sales Network

## Executive summary

Phase 2 establishes Seera-owned SKU, governed price and scheme versions, geography, retailer, distributor, super-stockist, credit, assignment, prospect, approval, target-ready work classifications, and movement-ledger stock foundations. It is isolated from MUV and represented by forward migrations 003–005.

## Architecture and models

The domain is under `lib/sales-distribution/` and `seera_*` database tables. Commercial transactions reference immutable SKU, pack, MRP, price, scheme, tax, partner, and credit snapshots. `SeeraPriceVersion` and `SeeraCreditTerm` are effective-dated; history is appended, never overwritten. Distributor and super-stockist identities are separate `SeeraPartner` types. `SeeraPartyUser` is the explicit partner-scope boundary.

## Workflows and permissions

Founder/Admin and Sales Head master operations require `master:manage`, `network:manage`, or `credit:manage`. Partner onboarding remains a governed prospect-to-approved lifecycle. Assignment rows are effective-dated. Duplicate constraints cover SKU code, retailer identity, prospect identity, assignments, and idempotent operational records.

## UX

Master and network operations appear only in the Founder/Admin experience. Manager primitives are exposed in the separate Sales Manager experience; partner portals do not receive master-edit controls.

## Tests and security

Phase-specific tests cover credit configuration, disabled credit, reminder offsets, price snapshots, price overlap rejection, membership scope, and duplicate/idempotency constraints. Production DB and MUV are never targeted.

## Acceptance verdict

Requirements implemented in the authorized Phase 2 scope. Final freeze depends on the combined regression and freeze report.
