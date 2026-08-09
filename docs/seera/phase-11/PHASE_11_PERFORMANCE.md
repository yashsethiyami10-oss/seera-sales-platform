# Phase 11 Performance Closure

Guarded direct TEST fingerprint `66ac54459d07d2c1` was used only for controlled probes. Guarded pooled TEST fingerprint `0df3ed0f625087ff` remained the application runtime path.

Ten `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` probes covered orders, manager analytics, retailer lists, Distributor/Super Stockist stock, ledger, ageing, notifications, reports and insights. Scoped stock, ledger, ageing, notifications, reports and insights used indexes. Evidence showed missing order/retailer time-scope indexes, so additive migration `20260809043000_phase_11_query_indexes` added ten reversible indexes. It is finished and not rolled back on TEST; production was untouched. Post-migration manager analytics and ageing selected the new indexes. Empty-table company order/retailer probes retained planner-chosen sequential scans with zero rows and no shared reads.

Bounded pooled runtime load used concurrency 2 then 5 across authenticated dashboard analytics, notifications and portal rendering: 14/14 responses succeeded; p50 2,792 ms; p95/max 14,423 ms; timeouts 0; P2024/P2028 0. The prior eight-read dashboard fan-out remains sequential to bound pooled connection use.
