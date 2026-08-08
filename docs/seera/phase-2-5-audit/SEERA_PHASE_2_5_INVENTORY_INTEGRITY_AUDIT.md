# Inventory Integrity Audit

Distributor and S.S. inventory use the same movement ledger with separate party scope. There is no mutable balance field. Opening, receipt, allocation, release, dispatch, delivery, return, damage, shortage, adjustment, reconciliation, off-system issue, and correction events are traceable to actor, source, reference, reason, time, and idempotency key.

Movement replay rejects negative on-hand, negative reserved, or reserved above on-hand. Month-end reconciliation stores opening, receipts, issues, system closing, physical closing, variance, reason, actor, and approval state; corrective stock requires an explicit adjustment movement.
