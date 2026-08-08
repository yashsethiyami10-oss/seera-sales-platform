# MUV Sales Architecture™ v2.0

## Phase 6 — Customer Growth & Intelligence implementation report

Date: 27 July 2026  
Status: Implemented and verified

### 1. Architecture summary

Phase 6 extends the existing Customer, CRM, commerce, order, billing, payment, product, RBAC, timeline, notification, audit, report, export, and dashboard infrastructure. It adds one deterministic customer-intelligence layer, one internal loyalty foundation, and one centralized KPI service. It does not duplicate customer identity or any Phase 0–5 engine.

### 2. Database changes

Two additive migrations were applied. They add configuration, profile, assignment, immutable history/snapshot/ledger, KPI, and executive-report tables. Existing tables were not dropped, rebuilt, or reset. Foreign keys, unique constraints, partial unique indexes, idempotency keys, sequences, check constraints, and database immutability triggers enforce integrity.

### 3. Prisma models added

CustomerIntelligenceProfile, CustomerStatusDefinition, CustomerSegment, CustomerSegmentAssignment, CustomerIntelligenceSnapshot, LoyaltyProfile, RewardTransactionType, RewardLedgerEntry, MembershipLevel, MembershipHistory, ReferralStatusDefinition, CustomerReferral, ReferralHistory, LoyaltySnapshot, KpiDefinition, ExecutiveReportTemplate, ExecutiveReport, and Phase6Configuration.

### 4. Services added

- `customer-intelligence.ts`: deterministic historical metrics, configuration-driven status, recalculation, snapshots, manual segment assignment, timeline, audit, and notification registration.
- `loyalty.ts`: ledger-derived balances, membership history, referral lifecycle, idempotency, validation, timeline, and audit.
- `analytics.ts`: centralized scoped KPI calculations and reproducible versioned executive reports.
- `repository.ts`: scoped server-side search, filters, sorting, pagination, and customer access enforcement.
- `extensions.ts`: disabled Phase 7 MUV AI interface only.

### 5. Server actions added

Authorized actions cover intelligence recalculation, manual segment assignment, reward adjustment, membership assignment, referral creation and transition, executive report generation, and intelligence export authorization. Inputs use server-side Zod validation.

### 6. API endpoints added

- `GET /api/sales/intelligence`
- `GET /api/sales/intelligence/export`

Both authenticate and authorize server-side, apply record scope, and return safe standardized 401/403/500 responses without leaking database details.

### 7. UI modules added

- `/sales/intelligence`: scoped customer intelligence list with search, status filtering, sorting support, pagination, detail links, and authorized CSV export.
- `/sales/loyalty`: role-scoped internal loyalty summary and immutable ledger view.
- Existing sales navigation now exposes these modules from database permissions.

### 8. RBAC changes

Twenty Phase 6 permissions were added to the existing permission infrastructure. Founder receives all permissions. Sales Manager receives authorized team/territory intelligence and loyalty operations. Sales Officer is assignment-only. Institutional Sales Officer is assignment/institution-only. Customer Support receives read-only support-safe intelligence, loyalty, and operational analytics.

### 9. Dashboard enhancements

All existing role dashboards reuse `centralKpis` for net revenue, collections, outstanding, repeat purchase rate, collection rate, and opportunity conversion. Scope is applied for Founder, team/territory users, assigned users, institutional users, and support users.

### 10. Reports added

Fourteen configurable report templates cover daily, weekly, monthly, quarterly, yearly, custom, organization, sales, customer growth, commerce, loyalty, warehouse, collection, and outstanding summaries. Report instances retain filters, KPI versions, source reference, generation metadata, and immutable versions.

### 11. Customer intelligence summary

Metrics derive from completed orders, commercial invoices, paid payment records, order items, variants, products, and categories. Calculations include value, order, purchase-frequency, repeat-purchase, payment-time, collection, outstanding, overdue, preferred-product, and preferred-category measures. Derived values cannot be directly entered through actions.

### 12. Loyalty summary

One loyalty profile exists per customer. Reward balances derive only from append-only ledger movements. Manual operations require permission and reason. Membership and referral histories are immutable. Customer-facing reward earning, redemption, and automatic expiration remain disabled.

### 13. Sales intelligence summary

The KPI service aggregates authorized order, customer, opportunity, collection, and conversion data and accepts owner, territory, and institutional scopes.

### 14. Business intelligence summary

Central KPIs cover gross/net/collected/outstanding revenue, orders, customer counts, AOV, repeat purchase, collection, and opportunity conversion. The same formulas are consumed by dashboards and reports.

### 15. Executive reporting summary

Reports are deterministic and reproducible: period, filters, KPI-definition versions, report version, source reference, actor, and generation time are retained. Historical report rows reject update and delete at database level.

### 16. Timeline integration

The existing unified customer timeline receives intelligence recalculation, status/segment, reward, membership, and referral events. No separate Phase 6 timeline was created.

### 17. Notification integration

The existing NotificationLog registers status, intelligence, and executive-report notifications. Delivery remains permission-aware and no duplicate notification engine was introduced.

### 18. Audit integration

The existing immutable SalesAuditLog records recalculations, segment operations, reward movements, membership changes, referral changes, report generation, and configuration-sensitive operations. No separate audit store was created.

### 19. Migration summary

- `20260727070000_customer_growth_intelligence_v2`: additive Phase 6 structures and integrity enforcement.
- `20260727070100_phase6_number_triggers`: table-specific concurrency-safe sequence triggers.
- `prisma migrate deploy`: passed; all ten migrations applied.
- Pre-migration core counts: 4 customers, 12 orders, 13 products, 5 users, 82 audit rows.
- Existing core records remained present after migration.

### 20. Seed summary

The seed was executed twice successfully through direct compiled execution after the local `tsx` launcher hit an operating-system ENOMEM error before seed execution. Counts remained unique: 7 statuses, 15 segments, 4 membership levels, 8 reward types, 7 referral statuses, 17 KPI definitions, 14 report templates, 107 total permissions, and 12 roles. Customized values are preserved because Phase 6 uses `upsert` with empty updates.

### 21. Tests executed

- Phase 6 verification: 44 passed, 0 failed.
- Phase 5 regression: 21 passed, 0 failed.
- Phase 4 regression: 32 passed, 0 failed.
- Phase 3 regression: 30 passed, 0 failed.
- Phase 2 regression: 22 passed, 0 failed.
- Phase 1/final architecture verification: 31 passed, 0 failed.
- Prisma validate: passed.
- Prisma generate: passed.
- TypeScript `tsc --noEmit`: passed.
- Next.js production build: passed; 79 routes generated.
- Lint: not independently runnable because this repository has no ESLint configuration and `next lint` launches an interactive setup. The production build’s built-in lint/type validity stage passed.

### 22. Acceptance checklist

All “one engine/framework” constraints are preserved. Existing CRM, commerce, billing, inventory, customer services, reports, permissions, timeline, notifications, and audit remain operational. Server-side authorization, scoped analytics, ledger/snapshot/history immutability, safe migration, idempotent seed, deterministic metrics, centralized KPI reuse, and reserved AI boundaries passed verification.

### 23. Known limitations

- Scheduled recalculation/report generation and automatic reward expiration are extension points only, as required.
- Loyalty remains internal and customer-facing earning/redemption is disabled, as required.
- The repository’s historical migration chain lacks the original baseline tables, so shadow-database `migrate dev --create-only` cannot replay from empty. Production-safe `migrate diff` against the deployed schema plus `migrate deploy` was used without resetting data.
- ESLint has not been configured in the repository; no configuration was introduced because that would exceed the frozen Phase 6 scope.

### 24. Future extension points

Disabled feature flags, interfaces, and events are reserved for Phase 7 MUV AI Integration. No prediction, recommendation, churn scoring, AI segmentation, forecasting, LLM, or automated decision logic is implemented.

### 25. Frozen-specification confirmation

All six Phase 6 parts were implemented against the existing architecture without redesigning the CRM, duplicating business infrastructure, modifying frozen Phase 0–5 decisions, or implementing MUV AI.
