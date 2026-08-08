# Seera Sales & Distribution OS — Master Architecture

Status: **Architecture baseline complete; infrastructure and Phase 1 implementation blocked**  
Version: 1.0  
Last reviewed: 2026-08-08

## 1. Authority and boundary

This document implements the Founder’s Seera Master Development Constitution. Seera Detergent is an independent business entity and application. The prior Phase 0 direction that proposed organisation-scoped Seera tables inside the MUV platform is superseded.

- Active development workspace: `C:\Users\KE\seera-sales-platform`
- Read-only reference: `C:\Users\KE\muv-platform-deployment-package`
- MUV supplies patterns only. Seera has no runtime import, symlink, database, migration, auth, deployment, or data dependency on MUV.
- Copied source is owned by Seera but remains unadapted until Phase 1.
- Architecture may proceed without credentials. No live infrastructure or Phase 1 implementation may begin under this document.

## 2. Current-state finding

The Seera workspace is a byte-for-byte path copy of the scoped MUV application tree, not yet an independent application baseline:

- package identity remains `muv`;
- the Prisma schema contains the MUV domain (413 models and 75 enums);
- Seera has no Git repository;
- `.env` and `.env.local` reference known MUV database hosts;
- production and test URLs in `.env.local` resolve to the same database;
- no source import, package link, or reparse point targets the MUV repository.

Therefore the copied tree is reference material inside the Seera workspace. It must be selectively retained, adapted, or removed only through reviewed Phase 1 changes after infrastructure isolation. It must not be executed while MUV credentials are present.

## 3. System context

```text
Employees and partners
        |
        v
Seera web/PWA portals
  Founder/Admin | Accounts | Manager | Field | Distributor | S.S. | Retailer
        |
        v
Application boundary (Next.js server actions/API + authorization policy engine)
        |
        +--> Domain services and transactional outbox
        +--> Background workers (notifications, documents, reports)
        +--> File-storage adapter (private objects and signed access)
        |
        v
Independent Seera PostgreSQL database
```

External providers—email, approved WhatsApp Business, maps/routing, object storage, error tracking—are accessed only through Seera-owned interfaces and credentials. Business correctness never depends on AI or notification delivery.

## 4. Deployment and code boundaries

V1 remains a modular monolith unless measured scale requires extraction. This preserves transactional correctness while enforcing explicit modules:

- `foundation`: identity, sessions, RBAC/ABAC, settings, feature flags, audit, idempotency;
- `network`: territories, beats, parties, assignments, lifecycle;
- `catalog`: products, SKUs, packs, tax metadata, pricing, schemes;
- `field`: attendance, visits, GPS, collections, market intelligence;
- `orders`: commercial orders, snapshots, approvals, fulfilment events;
- `inventory`: stock transactions, allocation, dispatch, returns;
- `documents`: quotations, invoices, challans, receipts, secure files;
- `finance`: accounts, immutable postings, allocations, reconciliation;
- `expenses`: travel estimates, TA claims, approvals;
- `communications`: inbox, templates, consent, provider delivery;
- `reporting`: scoped read models and reconciled exports;
- `sync`: offline commands, idempotent replay, conflict policy.

Modules communicate through typed application services and domain events. They may not query another module’s tables from UI code. Financial posting, fulfilment, document issuance, and lifecycle transitions use transactions and an outbox where external work follows.

## 5. Identity, authentication, and sessions

- A Seera `User` is independent of any MUV user.
- Authentication supports password and optional approved identity providers through Seera credentials.
- Passwords use a current adaptive hash; reset and verification tokens are hashed at rest, single-use, and expiring.
- Sessions are server-revocable and carry an authorization version. Role, permission, suspension, closure, or security changes invalidate affected sessions.
- Bootstrap Founder creation is an explicit one-time deployment operation; no default production password is seeded.
- Partner owners may administer their own subordinate operators only within governed permission and party scope.
- Login, failed authentication thresholds, recovery, session revocation, and privileged re-authentication are audited without logging secrets.

## 6. Authorization model

Authorization is deny-by-default and evaluated server-side for every action, API, file, export, search, aggregate, and background job.

```text
allow = authenticated
    AND account/session active
    AND lifecycle permits action
    AND permission granted by active role assignment
    AND data scope matches territory/reporting-line/party/ownership
    AND record state permits transition
```

Base roles:

| Role | Default scope |
|---|---|
| Founder / Super Admin | Global, with break-glass audit for exceptional access |
| Company Admin | Company administration excluding reserved Founder controls |
| Accounts Manager | Financial oversight, approvals, reconciliation |
| Accounts Executive | Maker operations subject to approval limits |
| Sales Head | Assigned sales hierarchy and territories |
| Sales Manager | Assigned team, territories, beats, and network |
| Sales Executive | Self, assigned beat/retailers, attributed activity |
| Super Stockist Owner | Own party, users, assigned distributors, transactions |
| Super Stockist Operator | Delegated own-party operations |
| Distributor Owner | Own party, users, assigned retailers, transactions |
| Distributor Operator | Delegated own-party operations |
| Distributor Delivery User | Assigned deliveries and proof only |
| Retailer User | Own retailer/account records only |
| Read-only Auditor | Explicitly assigned read scopes; no mutation |

Permissions are stable codes grouped by resource/action. Role assignments and data-scope assignments are effective-dated and auditable. UI visibility is convenience only; application services enforce access. No scattered role-name checks constitute an authority boundary.

## 7. Canonical data model

All primary keys are opaque IDs; display codes are separately governed. Timestamps are UTC with business timezone rendering. Quantities and money use decimal types with explicit unit/currency rules—never floating point.

### Foundation

`User`, `Credential`, `Session`, `Role`, `Permission`, `RolePermission`, `UserRoleAssignment`, `DataScopeAssignment`, `FeatureFlag`, `SystemSetting`, `IdempotencyRecord`, `AuditEvent`, `OutboxEvent`.

### Network and parties

`BusinessParty` is the legal/commercial party root. Profiles specialize it as Company, Super Stockist, Distributor, or Retailer without deleting history. `PartnerRelationship`, `PartnerLifecycleEvent`, `Territory`, `TerritoryClosure`, `Beat`, `BeatStop`, `PartyTerritoryAssignment`, `EmployeeReportingAssignment`, and `SalesAssignment` are effective-dated.

Party codes, mobile, GSTIN, and normalized names use governed duplicate-detection rules. Nearby GPS is a review signal, not an automatic identity merge. Closure changes capability, never historical ownership.

### Catalog and commercial policy

`Product`, `SKU`, `PackConversion`, `TaxClassification`, `PriceList`, `PriceListItem`, `Scheme`, and `SchemeRule` are date-effective. Every order item stores issuance-time price, scheme, tax, pack, and unit snapshots.

### Field activity

`AttendanceSession`, `LocationEvent`, `SalesVisit`, `VisitOutcome`, `CollectionCapture`, `MarketIntelligence`, and `FollowUp`. Location collection is permitted only for declared purposes and approved work states. Start Day and checkout store permission/accuracy context. Raw location retention is configurable and disputes/corrections append events.

### Orders and fulfilment

`CommercialOrder` explicitly identifies seller, buyer, source, assisted actor, distributor, territory, beat, payment terms, and independent order/payment/fulfilment states. `OrderItem` owns immutable commercial snapshots.

`FulfilmentEvent` is append-only and item-level: accepted, allocated, dispatched, delivered, refused, returned, cancelled, corrected, or reversed. Projections calculate current quantities; events are never overwritten. Delivery proof is separately authorized and may contain OTP, signature, photo, GPS, receiver, operator, invoice, or challan evidence.

Constitutional performance formulas are derived only from fulfilment evidence:

```text
Net eligible quantity = booked - cancelled - undelivered - refused - approved returned
Net eligible sales = gross booked - cancelled - undelivered - refused - approved return - reversal/invalid
```

### Inventory

`InventoryAccount`, `InventoryTransaction`, `StockReservation`, and `StockLot` where batch control is required. Append-only movements support receipt, allocation, dispatch, delivery, return, damage, and governed adjustment. Constraints prevent fulfilment above available/accepted quantities and prevent duplicate idempotent movements.

### Finance

`LedgerAccount`, `Journal`, `JournalLine`, `Payment`, `PaymentProof`, `PaymentAllocation`, `Reconciliation`, `CreditNote`, `DebitNote`, and `FinancialDispute`. Posted journals balance and cannot be edited; corrections use linked reversals/counter-entries. Uploaded proof remains unverified until Accounts review. UTR uniqueness/detection is normalized and scoped by bank/account policy.

### Documents and tax

`BillingProfile`, `TaxRegistration`, `CommercialDocument`, `DocumentLine`, `BillingSnapshot`, `DocumentVersion`, `DocumentFile`, `DocumentSequence`, and `DocumentShareGrant`.

The legal seller is determined by the transaction: Super Stockist bill uses verified Super Stockist identity; Distributor bill uses its profile; Company bill uses Seera Company. Issued snapshots and numbers are immutable. Manual upload, receipt/supporting document, and bill-pending paths coexist with system generation. Secure links are random, hashed at rest, expiring, revocable, scoped, and audited.

### Expenses, notifications, and sync

`TravelEstimate`, `ExpenseClaim`, `ExpenseLine`, `ExpenseApproval`, `Notification`, `NotificationPreference`, `MessageTemplate`, `ConsentRecord`, `DeliveryAttempt`, `SyncDevice`, `SyncCommand`, and `SyncConflict`. GPS estimates never create automatic entitlement. Offline commands use client-generated idempotency keys and return the original result on replay.

## 8. Database integrity rules

- Independent production and test databases; runtime/test startup refuses equal identities or known MUV hosts.
- Foreign keys protect ownership. Legal, financial, fulfilment, audit, and lifecycle history use restrict/soft status rather than cascade deletion.
- Unique constraints cover codes, document sequences, normalized payment references, and idempotency keys at the correct scope.
- Check constraints and transactional locks prevent negative quantities, over-allocation, unbalanced journals, invalid date ranges, and duplicate active assignments.
- Optimistic concurrency or version columns protect mutable masters and workflow transitions.
- Read models are rebuildable from authoritative transactions/events and must reconcile before report acceptance.
- Forward-only migrations are tested against a disposable Seera test database with backup and rollback/runbook evidence.

## 9. Workflow contracts

### Field day and visit

`Start Day → assigned beat cache → retailer check-in → visit activity/order/collection/no-order → checkout → next counter → End Day`.

No location is silently collected before Start Day or after End Day. A retailer has at most one open visit per salesperson. Checkout validates an open visit, end location, outcome, and linked actions. No-order visits remain reportable.

### Retailer order to delivery

`Draft → submitted → distributor acknowledgement → accepted/partial → allocated → ready → out for delivery → delivered/partial/refused/failed/rescheduled → closed`.

Header status is a projection; item events are authoritative. Retried commands are idempotent. Assisted replenishment never implies distributor financial acceptance.

### Super Stockist company order

`Order → pricing snapshot → quotation/pro-forma → confirmation → proof or credit path → Accounts review → approval → allocation → dispatch → delivery → ledger posting`.

Proof upload never marks payment verified.

### Billing and documents

`Draft → validate seller/buyer/tax snapshot → reserve number → issue → render/store → share/download audit → optional superseding version`.

Issued documents are never mutated. Cancellation/supersession preserves prior files and audit evidence.

### Partner lifecycle

`Active ↔ Suspended → Deactivated → Closed`, with governed reactivation where allowed. Pre-closure review lists open orders, stock, outstanding, payments, claims, returns, documents, users, assignments, quotations, and disputes. Force-close requires elevated permission, reason, approval, and unresolved-obligation acknowledgement. Sessions are revoked; history remains.

## 10. API and service conventions

- Validate every input at the boundary and return stable typed errors without internals.
- Mutations require authentication, permission, scope, state-transition checks, idempotency where retryable, and audit metadata.
- Never accept authoritative actor, party, territory, price, tax, total, or role values from the client; resolve them server-side.
- Routes use opaque IDs and still verify object scope to prevent IDOR.
- Pagination is mandatory for unbounded lists; exports are asynchronous for large datasets and preserve caller scope.
- Uploads use allowlisted MIME/extension, size limits, private storage keys, malware strategy, and post-upload authorization.
- Provider callbacks verify raw signatures, deduplicate events, and never bypass domain transitions.

## 11. Portal architecture and UX

| Portal | Primary home | Constitutional UX |
|---|---|---|
| Founder/Admin | business control and exceptions | control without clutter |
| Accounts | verification, outstanding, reconciliation | maker-checker and exceptions first |
| Sales Manager | team, targets, network, exceptions | territory-scoped operational view |
| Sales Executive | today’s work and next retailer | mobile-first, few taps, visible sync |
| Distributor | orders, delivery, stock, outstanding | operational actions first |
| Super Stockist | distributor orders, stock, company order, payment | network and replenishment first |
| Retailer | own orders, delivery, documents, account | strictly own-party scope |

The Sales Executive flow targets 30–40 visits/day: large touch targets, cached today view, fast retailer search, minimal typing, explicit offline/sync state, and no oversized payloads.

## 12. Privacy and security architecture

- Threat model covers horizontal/vertical escalation, IDOR, territory/party crossover, insecure files, payment/ledger manipulation, fake delivery, unsafe upload, replay, session persistence, and sensitive logging.
- GPS purpose, consent/notice, retention, manager visibility, dispute, and off-duty behavior require Founder/legal approval before implementation.
- Bank statements and privileged financial exports use narrow permissions, access audit, and step-up authentication.
- Secrets remain server-only and are rotated independently of MUV.
- Rate limits protect authentication, recovery, sharing, uploads, exports, and abuse-prone mutations.
- Audit events are append-only/tamper-evident in policy, record actor, action, target, outcome, reason, request correlation, and safe before/after fields.

## 13. File, notification, and background-job contracts

Storage exposes `putPrivate`, `getSignedRead`, `revoke`, `deleteUncommitted`, and metadata validation. Financial/legal files are never public permanent URLs.

Notifications use an internal inbox as the durable business channel. Email and WhatsApp are optional delivery adapters with approved templates, consent, retry limits, status tracking, and dead-letter handling. Provider failure does not roll back an already committed business transaction.

Jobs use an outbox, stable idempotency key, bounded retries, observable failure, correct user/party scope, and a replay/dead-letter runbook.

## 14. Reporting and intelligence

Reports distinguish primary sales, secondary booked sales, and secondary delivered sales. Every total traces to source orders, fulfilment events, journals, or approved expenses. Search and export share the same authorization scope as the portal.

Phase 10 begins with deterministic, explainable rules for overdue visits, dormant retailers, reorder opportunities, delivery risk, targets, collections, and service scoring. AI is optional and may not authorize, post, price, tax, pay, or determine authoritative sales.

## 15. Test architecture

- Unit: calculations, pricing snapshots, delivered-sales formula, permissions, state machines.
- Integration: constraints, transactions, outbox, storage/provider contracts, database identity guard.
- Authorization: every role × action × own/unrelated territory/party matrix.
- Workflow: full field day, partial fulfilment, refusal, return, payment review, billing, closure, TA.
- Integrity: over-delivery, duplicate replay, journal imbalance, historical snapshot mutation, sequence races.
- Security: IDOR, upload abuse, expired/revoked links, session revocation, log redaction.
- Offline: repeated/out-of-order commands, conflict, attachment retry, lost acknowledgement.
- Performance: realistic party/order/visit volumes, 30–40-call field day, indexed dashboards, pagination.
- Regression: every frozen prior phase before the next phase passes.

Tests may connect only through `TEST_DATABASE_URL`; startup must compare normalized host/database identity against `DATABASE_URL`, reject known MUV fingerprints, and require an explicit Seera-test marker.

## 16. Observability, backup, and recovery

Structured logs use correlation IDs and redact credentials, tokens, financial proofs, and sensitive GPS. Metrics cover latency, errors, auth denial, outbox lag, notification/document failures, sync conflicts, and payment workflow exceptions. Phase 11 verifies alerting, backup schedules, point-in-time recovery where available, restore drills, RPO/RTO, incident response, and deployment rollback.

## 17. Phase allocation

The phase names and order in `SEERA_FROZEN_ROADMAP.md` are binding. Foundation mechanisms are introduced only when their frozen phase requires them. Later-phase workflows must not leak into Phase 1 merely because their schema is described here. Cross-phase architecture is a contract, not authorization to implement early.

## 18. Architecture decisions requiring Founder/legal confirmation

The architecture does not decide commercial or legal policy. Before the affected implementation, approval is required for:

- GST/tax treatment and document compliance;
- credit limits, approval thresholds, discounts, schemes, incentives;
- GPS consent, visibility, retention, correction, and optional selfie policy;
- partner liability and force-closure policy;
- TA rates and eligibility;
- WhatsApp sender, template, and consent policy;
- financial retention, bank access, RPO/RTO, and deployment jurisdiction.

## 19. Architecture gate verdict

The target architecture is **READY** as a Phase 1 planning contract. Implementation is **BLOCKED** because repository and data isolation are not ready:

1. Seera has no independent Git history.
2. Seera environment files contain known MUV database credentials.
3. production and test database identities are not separate.
4. application identity and copied schema/code are still MUV.
5. Seera production/test databases, secrets, storage, providers, and deployment are not configured.

The exact safe handoff is documented in `SEERA_INFRASTRUCTURE_SETUP_CHECKLIST.md`. Stop before live initialization and await Founder confirmation.

## 20. Pre-Phase 1 package and schema preparation

Infrastructure isolation was reverified after independent `.env` and `.env.test` configuration. The copied application now has an independent package identity and Seera top-level metadata, while deep MUV modules remain classified rather than blindly renamed.

The active `prisma/schema.prisma` and its 60 copied migration directories remain unchanged and must not be executed. The schema is preserved as a hashed reference snapshot under `docs/seera/pre-phase-1/reference/`. The approved transition direction is a clean Seera foundation schema and a new Seera-only migration history after the copied migrations are archived outside Prisma’s active path.

Preparation evidence and remaining gates are maintained in `docs/seera/pre-phase-1/`. This work does not start Phase 1 and does not authorize Prisma generation, migration creation/application, `db push`, builds, tests, seeds, or database access.
