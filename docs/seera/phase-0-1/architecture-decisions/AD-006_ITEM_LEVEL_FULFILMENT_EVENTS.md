# AD-006 — Immutable Item-Level Fulfilment Events

Status: Founder-approved architecture direction; event vocabulary/opening balances open.

## Decision

Eligible sales and incentive truth derive from immutable item-level fulfilment events. Booked value alone never counts as delivered performance.

## Context and alternatives

Current order items do not hold a complete accepted/allocated/dispatched/delivered/refused/returned/cancelled event history. Header status and mutable counters cannot prove partial delivery or reversal.

## Reasons and consequences

Events capture quantity/value basis, reason, party, actor/membership, attribution snapshot, occurred/recorded time, evidence and reversal link. Read models calculate booked minus cancelled, undelivered, refused, returned and reversed amounts.

## Migration/security impact

Append-only database enforcement, idempotency keys, over-fulfilment checks and authorized counter-events are required. Legacy MUV orders remain legacy unless a separately validated opening projection is approved.

## MUV regression risk

Medium if additive; high if old status semantics are silently reinterpreted.

## Acceptance tests

- Partial delivery counts only delivered quantity/value.
- Refusal, approved return and reversal reduce eligibility exactly once.
- Duplicate/offline/out-of-order events are safe.
- Reassignment never rewrites historical salesperson/distributor/territory attribution.

