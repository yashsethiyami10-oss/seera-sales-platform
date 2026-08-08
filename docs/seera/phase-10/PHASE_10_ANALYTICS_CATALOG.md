# Phase 10 Analytics Catalog

Sales facts distinguish booked quantity from delivered quantity and net eligible delivered quantity. Cancelled/rejected orders do not count as booked; refused quantities do not count as delivered; returns reduce eligible delivered performance. Financial values use immutable price snapshots.

The shared framework supplies current range, previous comparable range, absolute/percentage change, financial-year range, target gap/run-rate, movement-derived closing stock, reconciliation variance, productive-call rate, retailer coverage and deduplicated joint-work order credits. Month series emit every calendar month, including zero months and cross-year/FY boundaries.

Dashboard queries are scoped before aggregation: self for Sales Executive, active assignments for Manager, active party links for Distributor/S.S., and authorized company scope for Founder/Admin and Accounts.
