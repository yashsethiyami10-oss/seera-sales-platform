# MUV Enterprise Architecture v3.0 — Phase 1 implementation inventory

## Repository inspection

- Runtime: Next.js 15 App Router, React 19, TypeScript 5.6.
- Persistence: PostgreSQL with Prisma 5.20 and additive timestamped SQL migrations.
- Authentication: Auth.js/NextAuth v5 using the existing `User`, JWT session, and Prisma adapter.
- Authorization: data-driven `SalesRole`, `SalesPermission`, and `SalesRolePermission`; Founder bypass is centralized in `lib/sales/authorization.ts`.
- Organization context: the frozen platform uses the trusted server-derived `MUV` organization key for governed AI. There is no separate Organization master. Enterprise Operations reuses this convention and never trusts an organization key supplied by a client.
- Shared records: `Product`, `ProductVariant`, `Inventory`, `Warehouse`, `StockLedgerEntry`, `SalesTimelineEvent`, `SalesAuditLog`, and `NotificationLog`.
- Governed workflow/approval: frozen AI workflow definitions, workflow instances, checkpoints, action requests, and immutable approval decisions.
- Reporting/dashboard: server-side reporting services consumed by App Router server components.
- Search/export: permission-checked server/API operations with server pagination and audited export routes.
- Feature configuration: organization-scoped `AiConfiguration`, reused for additive enterprise feature flags and policies.
- Background operations: idempotent service functions; the repository has no external queue or scheduler dependency.
- Observability: structured logger plus immutable audit and telemetry records.

## Capability classification

| Capability | Classification | Implementation decision |
| --- | --- | --- |
| Authentication/session | Existing and reusable | Reuse unchanged |
| Organization context | Existing but requires additive extension | Reuse server-derived `MUV` key |
| RBAC/permissions | Existing and reusable | Add enterprise permissions and roles only |
| Products/variants/inventory | Existing and reusable | Reference existing IDs |
| Warehouses | Existing and reusable | Add zones/bins, do not duplicate warehouse |
| Stock movements | Existing but requires extension | Enterprise movements also write the stock ledger |
| Vendors/procurement | Missing | Add organization-scoped operational domain |
| Manufacturing/formula/batches/QC/planning | Missing | Add version-aware operational domains |
| Approval framework | Existing and reusable | Reference governed approval/action records |
| Workflow engine | Existing and reusable | Seed enterprise definitions; no second engine |
| Timeline/audit/notifications | Existing and reusable | Write through the shared records in the service transaction |
| Reports/dashboards/search/exports | Existing but requires extension | Add enterprise service adapters and routes |
| Background operations | Partially implemented | Add idempotent refresh entry points |
| MUV AI | Existing and governed | Add advisory tools only |

## Gap and risk decisions

- All new records carry `organizationKey`; every service query includes it.
- Human-readable numbers are issued by an organization-scoped sequence inside a serializable transaction.
- Existing master records are referenced by ID. No Product, ProductVariant, Warehouse, User, audit, timeline, notification, approval, workflow, or AI master is duplicated.
- Final decisions, approved formula revisions, planning snapshots, batch-lot history, and warehouse movement history are protected by database immutability triggers.
- Feature flags default disabled and seeds use create-only upserts.
- Sales roles remain unchanged. New enterprise roles receive only their explicit enterprise grants.
- API routes, actions, background operations, and AI adapters call Business Services; none performs direct operational mutations.

