# Seera Phase 0 — Executive Summary

## Verdict

The platform has substantial reusable domain machinery but is **not currently safe for Seera data**. It is a single-company MUV application with partial organisation-keyed enterprise modules, not an end-to-end multi-organisation system. Phase 1 is **not safe to start without Founder review and the prerequisites below**, and no Seera record should be created in current production tables.

## Repository reviewed

Reviewed the 10,000+ line Prisma schema, Auth.js/session and middleware boundaries, RBAC/Sales principal, Sales OS/CRM/opportunities/quotations, institutional sales, storefront and business orders, commerce fulfilment/inventory, enterprise network, enterprise finance, audit, notifications/messaging, media, reporting, route/action/service structure, tests, package/deployment configuration, status/freeze reports, and PWA/offline indicators. Evidence is recorded across the Phase 0 documents.

Phase 0.1 later resolved the source path and ADR direction. Phase 0.2 makes the missing primary Knowledge Library a separate governance concern, not a Seera readiness dependency, and establishes the additive Zero-Harm MUV strategy. Phase 0 is technically complete but not formally frozen because the MUV regression/build baseline remains incomplete.

## Readiness and reuse estimate

| Domain | Estimated reuse | Assessment |
|---|---:|---|
| Shared UI/action/validation/provider core | 75% | Patterns are mature; context hardening required |
| Identity and RBAC | 35% | Auth reusable; memberships and scoped multi-role grants absent |
| CRM/master data | 35% | Fields reusable; global uniqueness and ownership unsafe |
| Network/channel hierarchy | 65% | Strong effective-dated model; hard-coded MUV principal blocks Seera |
| Orders/quotations/pricing | 50% | Several engines exist; channel semantics/item delivery missing |
| Finance/ledger/accounts | 75% | Strongest reusable engine; proof/party integration missing |
| Field sales/GPS/offline | 30% | Institutional check-in exists; beat/offline/GPS governance absent |
| Notifications/WhatsApp | 45% | Provider adapters/logging exist; inbox/preferences/retry/tenant sender absent |
| Reporting/dashboards | 45% | Infrastructure exists; Seera delivery-adjusted read models absent |

These are engineering estimates, not effort commitments.

## Critical blockers

1. No `Organization` or `OrganizationMembership`; `User` has global roles and territory.
2. Enterprise organisation context is the compile-time literal `MUV` (`lib/platform-core/context.ts`).
3. Core Product, Customer, Territory, storefront Order/OrderItem, media, roles, institutional models and notification log lack an organisation boundary.
4. No active-organisation switch/session claim; the “CompanySwitcher” is intentionally static.
5. No universal query guard/RLS; mixed scoped and unscoped Prisma access allows leakage if a second key is introduced naively.
6. No item-level immutable delivery/refusal/return event model; booked orders cannot yield the required Seera performance metric.
7. The grouped MUV regression and production-build baselines must complete or be explicitly accepted before implementation.

## High-risk gaps

- Global selectors, counts, exports, files and notification recipients.
- Role-only checks (`requireStaff`, `requireAdmin`) without entity membership.
- Organisation strings are not foreign keys and child-parent organisation consistency is not database-enforced.
- Payment proof/UTR verification and partial bank matching are not connected to channel order release.
- Institutional GPS is a point-in-time check-in/out, not governed route tracking or offline execution.
- No PWA/service worker/local database/outbox/conflict protocol.
- Financial and GPS separation-of-duty/privacy policies require approval.

## Immediate reuse

Auth.js credential machinery, Zod validation and normalized errors, server-action mutation boundary, append-only audit pattern, enterprise sequence pattern, shipping/messaging provider interfaces, Cloudinary/media primitives, OS shell components, Vitest infrastructure, and finance posting/reversal/idempotency techniques.

## Requires modification

Enterprise principal/context, user/session/RBAC, enterprise network, finance integration, Sales OS, Customer/Product/Territory, quotations/PDF/numbering, business orders/commerce fulfilment, file access, notification dispatch/logs, reporting/exports, middleware and every selector/aggregation.

## New development

Organisation memberships and switching; scoped grants/assignments; Seera party/retailer profiles; beats and plans; visit/GPS events; offline outbox; channel prices/schemes; channel orders; item fulfilment/delivery proofs; payment-proof review; party ledgers; distributor/super-stockist/delivery portals; notification inbox/preferences; Seera read models.

## Database impact

Large but additive: new shared organisation/membership/RBAC tables; organisation keys/backfills and composite constraints on global business tables; new Seera channel/field/delivery/proof models; finance mappings. No migration was created. Existing MUV rows require a deterministic `MUV` backfill and compatibility adapters before NOT NULL/constraint enforcement.

## Recommendation

Phase 0.2 is the final zero-harm gate between audit and implementation. The next implementation phase is **Phase 1 — Multi-Entity Foundation and Seera Isolation**. It cannot begin until the Founder approves the additive strategy and closes or explicitly accepts the test/build baseline blockers.
