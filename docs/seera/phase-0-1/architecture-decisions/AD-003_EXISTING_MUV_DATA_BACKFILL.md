# AD-003 — Existing MUV Data Backfill

Status: Founder-approved controlled migration direction; model inventory and batches open.

## Decision

Backfill existing MUV data model by model into the MUV organisation. No blanket update is permitted. Classify every model as platform-global, organisation-owned, MUV-owned, user identity, shared infrastructure with organisation-bound access, or legacy/ambiguous.

## Context and alternatives

Core models are global while newer enterprise models carry string `organizationKey`. A blanket key addition is fast but cannot distinguish global definitions, identity or ambiguous legacy records. Rebuilding MUV was rejected.

## Reasons and consequences

Classification enables correct keys, composite uniqueness, parent consistency and rollback. Expand/backfill/validate/enforce/contract occurs in auditable batches with counts and orphan reports.

## Migration/security impact

Each batch needs pre/post counts, deterministic mapping, nullable expansion, validation queries, indexes, constraint activation and a rollback/compatibility plan. No Seera data enters a model before its MUV backfill and enforcement pass.

## MUV regression risk

Critical: codes, numbers, public catalog and foreign keys may change behavior. Preserve old indexes and adapters until parity/build/tests pass.

## Acceptance tests

- Every row is classified and reconciled by count/hash/sample.
- Child and parent organisation match.
- MUV routes return the same authorized records before/after.
- Re-run is idempotent; rollback does not delete business data.

