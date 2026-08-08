# Phase 10 Architecture

- `lib/phase-10/time-intelligence.ts`: reusable calendar, comparable-period and zero-month series.
- `analytics-engine.ts` and `dashboard-service.ts`: canonical calculations over frozen order-line, movement, visit, target, collection and reconciliation truth.
- `scope.ts`: employee/team and party scope applied before aggregation.
- `reporting-engine.ts`: allowlisted catalog, CSV injection defence, printable HTML and PDF.
- `automation-engine.ts`: persistent rule evaluation, unique event/recipient deduplication and notification queue creation.
- `delivery-adapters.ts`: email and WhatsApp Business provider contracts with safe test adapters and retry policy.
- `intelligence-engine.ts`: deterministic, timestamped, expiring, explainable insights that never mutate orders, credit or stock.
- `app/api/phase-10/*`: authenticated, no-store analytics, exports and audited Founder rule controls.
- `Phase10Dashboard.tsx`: role-distinct, responsive bilingual presentation for Founder/Admin, Manager, Executive, Distributor, S.S. and Accounts.

Canonical transaction tables remain the source of truth; Phase 10 stores only rule configuration, execution evidence, insights and export audit evidence.
