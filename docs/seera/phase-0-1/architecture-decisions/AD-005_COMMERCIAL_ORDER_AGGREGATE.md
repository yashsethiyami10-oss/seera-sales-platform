# AD-005 — Governed Commercial Order Aggregate

Status: Founder-approved direction; extend `BusinessOrder` versus additive aggregate unresolved.

## Decision

Use one governed commercial-order aggregate with typed retailer-secondary, distributor-replenishment, assisted-distributor and super-stockist-primary workflows. Keep MUV commerce operational until compatibility is proven.

## Context and alternatives

Consumer `Order`, commerce extensions and `BusinessOrder` have different semantics. Four new engines would duplicate pricing, approval and fulfilment; forcing channel flows into consumer Order would create ambiguous nullable fields.

## Reasons and consequences

The aggregate requires buyer/seller/fulfilment/billing/delivery parties, source/assisted user, attribution snapshots, price/scheme/tax snapshots and independent order, approval, payment and fulfilment states.

## Migration/security impact

Organisation and party keys are mandatory. Commands are idempotent and state transitions authorized by membership/partner scope. Exact aggregate reuse, numbering and legacy conversion remain Phase 1/2 design decisions.

## MUV regression risk

High if existing order code is generalized in place. Prefer additive adapters and parity tests.

## Acceptance tests

- All four types use one invariant/state framework without cross-party access.
- Assisted creator and commercial owner are separately retained.
- Price/tax/scheme and attribution remain immutable after reassignment.
- Existing MUV checkout/order lifecycle is unchanged.

