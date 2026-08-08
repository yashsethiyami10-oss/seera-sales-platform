# MUV Enterprise Architecture™ v3.0

## Phase 1 — Enterprise Operations verification report

Date: 27 July 2026  
Specification: frozen Requirement Analysis, Architecture Design Parts 1–2, Production Codex Parts 1–4  
Final result: implemented, tested, verified, passed, and frozen

## Repository inspection and gap analysis

The implementation inventory is recorded in `docs/enterprise-phase1/IMPLEMENTATION_INVENTORY.md`.

The platform is Next.js 15 App Router with React 19, Auth.js/NextAuth v5, Prisma 5/PostgreSQL, data-driven Sales RBAC, shared Business Service conventions, shared Sales timeline and immutable audit, notification logs, central reporting/dashboard services, server-side search/export patterns, organization-scoped configuration, and the governed MUV AI platform.

There is no separate Organization master in the frozen platform. Governed MUV AI already establishes the trusted server-side `MUV` organization key. Enterprise Operations reuses that organization convention and never accepts a client-supplied organization as authority.

Existing authoritative records are reused:

- User and Sales roles/permissions
- Product and ProductVariant
- Inventory, Warehouse, and StockLedgerEntry
- SalesTimelineEvent and immutable SalesAuditLog
- NotificationLog
- Workflow definitions, workflow instances, checkpoints, and governed approvals
- Reporting, navigation, search, export, feature configuration, and AI governance

No parallel authentication, RBAC, workflow, approval, timeline, audit, notification, reporting, search, export, inventory, warehouse, or AI system was introduced.

## Schema

The additive data foundation covers:

- Vendor registry, contacts, documents, agreements, lifecycle, risk, and deterministic performance snapshots
- Purchase requisitions/items, RFQs/invitations, quotations/items, comparisons, purchase orders/items, goods receipts/items, returns/items, and vendor invoice references
- Formula families, immutable revisions, ingredients, packaging, alternate materials, and yield definitions
- Machines, work centers, production lines, plans, orders, schedules, steps, material allocation, execution, and exceptions
- Batches, material/packaging lot traceability, status history, quality references, and exceptions
- Quality parameters, inspection plans/parameters, inspections, samples, results, finalized decisions, holds, corrective actions, and preventive actions
- Existing warehouses plus additive zones, bins, reservations, and immutable operational movements
- Demand plans/items, material plans, procurement plans, safety-stock rules, immutable planning snapshots, and audited overrides

Every organization-owned record carries `organizationKey`. Human-readable numbers are separate from database identifiers and issued by an organization-scoped sequence from a serializable Business Service transaction.

## Migration

Applied migrations:

- `20260727100000_enterprise_operations_v3_phase1`
- `20260727101000_enterprise_operations_supporting_records`

The changes are additive. They contain no table or column drops and do not rename or replace existing schema.

The original repository baseline cannot replay into an empty Prisma shadow database because its first historical Sales migration expects the pre-existing storefront schema. No reset was performed. The migrations were generated using Prisma’s live-database-to-datamodel diff, inspected, and deployed through `prisma migrate deploy`.

Final migration status:

- 13 migrations found
- Database schema is up to date
- Existing production records remained present

SQL foreign keys protect authoritative User, ProductVariant, and Warehouse references. Organization scoping is additionally validated by Business Services on every lookup.

## Immutability

Database triggers reject direct updates or deletes to controlled operational history, including:

- Approved/active/superseded formula revisions
- Quality decisions
- Batch-lot associations
- Batch status history
- Warehouse movements
- Planning snapshots
- Vendor performance snapshots
- Planning overrides
- Inspection samples

Direct-database update and delete attempts against planning snapshots and warehouse movements were executed by the acceptance verifier and rejected.

## Seed

The seed completed twice after migration with identical results:

- 17 roles
- 176 total permissions
- 48 Enterprise Operations permissions
- 11 Enterprise feature flags
- 6 advisory Enterprise AI tools
- Existing admin retained the Founder role

Seed writes use safe create-only/upsert behavior and do not create vendors, purchase transactions, production orders, batches, QC results, warehouse movements, or planning snapshots.

All Enterprise feature flags default disabled:

- Enterprise Operations
- Vendor Management
- Procurement
- Manufacturing
- Formula and BOM
- Batch Management
- Quality Management
- Warehouse Operations
- Supply Planning
- Operational Reporting
- Enterprise AI Extensions

## RBAC

Founder has every Enterprise permission.

New operational roles:

- System Administrator: operational configuration and administration
- Procurement Manager: vendor, procurement, and reporting
- Production Manager: formula visibility, production/batch execution, planning, and reporting
- Quality Manager: inspection, decisions, release/rejection, and reporting
- Warehouse Manager: controlled warehouse operations and related visibility

The following frozen Sales roles received no Enterprise permission:

- Sales Manager
- Sales Officer
- Institutional Sales Officer
- Customer Support

Navigation is generated on the server from both database permissions and organization feature flags. Disabled modules are absent and their services/routes still reject access server-side.

## Business Services and workflows

Stateless governed services implement the mandatory pipeline:

1. authenticate
2. derive trusted organization
3. authorize permission
4. validate feature flag
5. validate input and references
6. validate lifecycle and approval state
7. validate version/concurrency
8. persist inside a serializable transaction
9. append timeline
10. append immutable audit
11. register notification
12. return typed entity state and correlation identifier

Implemented service domains:

- Vendor lifecycle and duplicate prevention
- Procurement requisition lifecycle
- Formula/revision lifecycle
- Production-order lifecycle
- Batch creation and traceability
- Finalized quality decisions and controlled batch release/rejection
- Warehouse movements through the existing authoritative stock ledger
- Deterministic material-requirement snapshots
- Operational KPI/report datasets
- Idempotent background refresh

Operational lifecycle states and transitions remain deterministic. Central workflow/approval references are retained on controlled entities; no module-specific engine was created.

## Timeline, audit, and notifications

Operational mutations append the existing `SalesTimelineEvent`, `SalesAuditLog`, and `NotificationLog` records in the same transaction. Events contain the actor, entity, state, organization, and correlation identifier. Notification delivery remains decoupled so delivery failure does not reverse a completed business transaction.

## APIs, Server Actions, search, exports, and UI

Server Actions call Business Services and contain no Prisma operational writes.

API routes:

- `/api/enterprise/vendors`
- `/api/enterprise/requisitions`
- `/api/enterprise/search`
- `/api/enterprise/reports`

The API uses existing typed safe-error conventions. Operational mutation endpoints call Business Services.

Search is organization-scoped, permission-aware, audited, indexed, and server-paged across vendor, requisition, RFQ, purchase order, goods receipt, formula, production order, batch, inspection, and planning snapshots.

Operational reports reuse service datasets. JSON and audited CSV are implemented. The existing export architecture remains the extension boundary for Excel, PDF, and future asynchronous large-report delivery.

Production UI routes:

- `/enterprise`
- `/enterprise/vendors`
- `/enterprise/procurement`
- `/enterprise/manufacturing`
- `/enterprise/formulas`
- `/enterprise/batches`
- `/enterprise/quality`
- `/enterprise/warehouses`
- `/enterprise/planning`
- `/enterprise/reports`

The module uses the existing application styling, responsive server components, accessible forms/tables, permission-generated navigation, server search, filters, and pagination.

## Enterprise AI

Six advisory, read-only tools were registered:

- Vendor Insights
- Procurement Assistant
- Production Assistant
- Quality Assistant
- Inventory Assistant
- Executive Manufacturing Insights

They are guarded by `ENTERPRISE_AI_EXTENSIONS_ENABLED`, organization context, and Enterprise read permissions. The Enterprise AI adapter exposes reads only. It has no create, update, delete, approval, release, transfer, production, or planning mutation method. Business Services remain authoritative.

## Testing

Enterprise Phase 1 acceptance:

- 82 passed
- 0 failed

Frozen Sales regression:

- Phase 1: 31/31
- Phase 2: 22/22
- Phase 3: 30/30
- Phase 4: 32/32
- Phase 5: 21/21
- Phase 6: 44/44
- Phase 7 integrity: 59/59
- Phase 7 integration: 12/12

Sales regression total: 251 passed, 0 failed.

Combined Enterprise and frozen Sales verification: **333 passed, 0 failed**.

Coverage includes schema/integrity, lifecycle rules, RBAC, organization guards, feature flags, service-only mutations, audit/timeline/notification reuse, advisory AI, immutable database records, production-data preservation, and Sales regression.

## Toolchain and build

- Prisma format: passed
- Prisma validate: passed
- Prisma generate: passed
- Prisma migrate deploy: passed
- Prisma migration status: up to date
- Seed execution: passed twice
- TypeScript `tsc --noEmit`: passed
- Next production framework lint/type validity stage: passed
- Optimized production compilation: passed
- Page-data collection: passed
- Static generation: 89/89
- Build trace collection: passed
- Enterprise UI and API routes: emitted successfully

The standalone `npm run lint` command cannot run non-interactively because this existing Next.js repository has no ESLint configuration and `next lint` opens the first-time configuration prompt. No lint configuration was invented during this frozen implementation. The production build’s integrated lint/type validity stage passed.

## Resolved issues

- Prisma shadow replay was incompatible with the legacy first migration; resolved safely using live-schema diff without reset.
- The host `tsx` launcher encountered `uv_os_get_passwd` ENOMEM before seed execution; the unchanged seed was compiled and run directly.
- Phase 2 regression required its generated CommonJS routing artifact; regenerated for the test.
- Phase 7 baseline count checks were made additive-safe after Enterprise configuration/tools extended the same governed registries.
- A corrupt `.next` cache caused missing manifests; generated build output was removed and a clean build passed.
- Sandboxed font fetching failed; the approved network-enabled build fetched the existing `next/font` assets and passed.

## Known non-critical issues

- Auth.js’s `jose` dependency emits existing Edge Runtime warnings for `CompressionStream` and `DecompressionStream`. The build completes and this warning predates Enterprise Operations.
- Standalone ESLint awaits a separately approved repository-wide lint-policy decision.
- Feature flags intentionally remain disabled pending controlled production enablement.

## Outstanding blockers

None.

## Final recommendation

The migration is additive, production data is preserved, seed behavior is idempotent, organization and RBAC controls pass, immutable operational history is database-protected, Enterprise AI remains advisory, all frozen Sales regressions pass, and the final production build succeeds.

**PHASE 1**

**IMPLEMENTED**

**TESTED**

**VERIFIED**

**PASSED**

**FROZEN**

