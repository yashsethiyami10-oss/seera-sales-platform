# MUV Sales Architecture™ v1.0 — Phase 2 Implementation Report

## 1. Architecture Summary

Phase 2 extends the verified Phase 1 foundation with one customer master, one inquiry aggregate, one routing service, one assignment service, one identity-matching service, one chronological timeline, one reporting layer, and the existing immutable audit framework. The legacy `BusinessInquiry` table remains untouched for historical compatibility; every new sales form uses `SalesInquiry`.

## 2. Database Changes

All changes are additive. `Customer`, `User`, `Territory`, `SalesRole`, and `NotificationLog` are reused and extended. No ecommerce table was removed or replaced. A PostgreSQL sequence generates concurrency-safe `MUV-INQ-YYYY-000001` references.

## 3. Prisma Models Added

Configuration: `CustomerType`, `SalesChannel`, `SalesChannelCustomerType`, `LeadSource`, `AssignmentQueue`, `SalesInquiryStatus`, `SalesInquiryStatusTransition`, and `SalesApplicationStatus`.

CRM: `SalesInquiry`, nine channel-specific detail models, `InquiryAttachment`, `SalesTimelineEvent`, `SalesFollowUpTask`, `SalesInquiryNote`, and `CustomerClassificationHistory`.

## 4. Services Added

- Central routing and transaction orchestration
- Ordered identity matching with manual-review outcomes
- Deterministic priority and assignment services
- Scope-aware inquiry repository
- Channel reporting and reusable dashboard aggregation

## 5. Server Actions Added

Assignment/reassignment, inquiry status transitions, application review, notes, follow-ups, customer classification changes, Founder-only customer merge, channel configuration, and lead-source management.

## 6. API Endpoints Added

- `GET/POST /api/sales/inquiries`
- `GET /api/sales/inquiries/export`
- Existing Phase 1 permission and navigation APIs are reused.

## 7. UI Modules Added

Nine public form variants at `/inquire/[channel]`; internal inquiry list/detail, customer list/profile/timeline, channel management, reports, assignment dashboard, and queue dashboard.

## 8. RBAC Changes

Fourteen Phase 2 permissions were added. Founder receives all permissions. Sales Manager receives team/queue/report/assignment capabilities without Founder configuration. Sales Officer and Institutional Sales Officer remain assignment-scoped. Customer Support receives no confidential application permissions.

## 9. Dashboard Components

Reusable database-backed widgets cover inquiry totals, today/month totals, assignment, follow-ups, responses, priority, application pipelines, samples, quotations, bulk orders, and institutional pipeline. Assignment and queue dashboards use authorized data.

## 10. Reports Added

Authorized reporting aggregates by channel, lead source, priority, status, queue, owner, and territory. CSV export uses the same server-side scope. Revenue metrics are not fabricated when attributable data is unavailable.

## 11. Notification Integration

Inquiry transactions register dashboard and email notifications in the existing `NotificationLog`. WhatsApp, SMS, and push remain delivery extension points.

## 12. Timeline Integration

Inquiry, assignment, status, application, notes, follow-ups, customer classification, D2C registration, profile updates, orders, and repeat orders write to the shared chronological timeline.

## 13. Audit Integration

Critical inquiry, assignment, status, application, follow-up, note, channel, lead-source, classification, and merge operations use the immutable Phase 1 audit table.

## 14. Migration Summary

- `20260727030000_sales_channel_architecture_v1`
- `20260727031000_phase2_queue_defaults`

Both were applied through `prisma migrate deploy`. Final database-to-schema diff reports no difference.

## 15. Seed Summary

Idempotent seed data includes 18 channels (10 active, 8 reserved), 7 customer types, 11 lead sources, 8 assignment queues, 13 inquiry statuses, 8 application statuses, valid status transitions, and 14 additional permissions. Repeated seed execution produced no duplicates.

## 16. Tests Executed

- Phase 2 transactional integration: 22 passed, 0 failed
- Phase 1 regression/security: 31 passed, 0 failed
- Nine channel workflows and detail tables
- Exact and possible identity matching
- Duplicate prevention and transaction rollback
- Assignment, follow-up, timeline, notification, audit, role restrictions
- Audit update/delete rejection
- Prisma validation and migration drift
- TypeScript compile and production build
- Live unauthenticated API/export checks

## 17. Acceptance Checklist

One Customer, CRM, Timeline, Product Catalog, Reporting Engine, Routing Service, Assignment Service, Identity Matching Service, shared inquiry architecture, detail models, notification/audit/permission frameworks, and ecommerce preservation are implemented.

## 18. Known Limitations

- Advanced workload balancing, round robin, CAPTCHA, and automated escalation execution remain explicitly reserved.
- File metadata and validation are implemented; actual upload availability depends on the existing external storage configuration.
- The repository's pre-existing `next lint` command launches interactive ESLint setup and cannot run in CI until the project adopts an ESLint configuration.
- The normal `tsx` seed launcher fails on this Windows host with `uv_os_get_passwd` ENOMEM; compiling and executing the same seed succeeds.

## 19. Future Extension Points

Reserved channels, workload balancing, round robin, CAPTCHA, WhatsApp, SMS, push, export/international workflows, and the disabled `MUV AI Integration` interface/event/feature flag.

## 20. Architectural Conformance

All six frozen Phase 2 parts were implemented without replacing Phase 1, duplicating customers or routing, hardcoding user/role/queue IDs, or implementing MUV AI business logic.
