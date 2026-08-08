# AD-007 — Financial Book Segregation

Status: Founder-approved direction; legal books/account mappings open.

## Decision

Reuse the enterprise finance engine only with strict organisation segregation of books, accounts, journals, ledger entries, receipts/payments, allocations, invoices, notes, sequences, reconciliation and exports. MUV and Seera never share a running balance.

## Context and alternatives

The existing finance engine has organisation-keyed posting, reversal, AR/AP and banking capabilities but uses the MUV-only principal. A parallel Seera ledger would duplicate high-risk accounting; a shared chart/balance would violate entity separation.

## Reasons and consequences

One engine retains proven balanced posting and idempotency while every book and subledger is organisation-bound. Shared global account templates may seed separate books but never hold balances.

## Migration/security impact

Replace static context, add organisation FK/consistency checks, party-account mappings and organisation sequences. Payment proof remains unverified until maker-checker review, receipt posting and allocation/reconciliation.

## MUV regression risk

Critical. Existing MUV journals are never rewritten or moved without reconciled migration batches; corrections use reversals.

## Acceptance tests

- Cross-organisation account/journal/allocation references fail.
- Trial balances and exports reconcile independently.
- Proof upload never marks paid or releases a controlled order.
- Reversal is traceable and duplicate UTR/idempotency is detected within approved scope.

