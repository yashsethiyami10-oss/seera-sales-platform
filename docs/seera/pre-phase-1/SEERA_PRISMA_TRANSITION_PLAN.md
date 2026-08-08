# Seera Prisma Transition Plan

Status: **Design only — active copied schema unchanged**  
Date: 2026-08-08

## Current schema classification

`prisma/schema.prisma` is a copied MUV schema containing 413 models and 75 enums. It includes MUV storefront, CMS, customer, catalog, commerce, AI, enterprise manufacturing, finance, support, knowledge, and sales domains. It is not a Seera schema and must never be migrated or pushed into either Seera database.

An exact reference snapshot is preserved at `docs/seera/pre-phase-1/reference/MUV_COPIED_SCHEMA_SNAPSHOT.prisma`, with its SHA-256 recorded in `MUV_COPIED_SCHEMA_SNAPSHOT.sha256`. The active schema remains byte-identical to that snapshot during this preparation pass.

## Transition strategy

1. Preserve and hash the copied schema and migration history.
2. Keep production/test database commands prohibited.
3. In a separately authorized Phase 1 schema-implementation preparation step, move copied migrations outside Prisma’s active migration path without editing their contents.
4. Replace the active schema with a clean, independently reviewed Seera foundation schema—not by deleting MUV models one by one.
5. Validate the new schema statically and generate only a reviewed initial migration against a disposable, identity-guarded Seera test database.
6. Inspect generated SQL before execution; confirm it contains only approved Seera tables/enums/indexes.
7. Apply to test only after Founder approval and rollback evidence. Production remains untouched until a later deployment gate.

## Phase 1 foundation model design

Names are proposed contracts and may be refined before implementation. Later-phase models are described only as boundaries; they are not Phase 1 implementation scope.

### Identity and authorization

#### `User`

- opaque ID, normalized unique email and optional normalized phone;
- display name, authentication/lifecycle state, authorization version;
- password hash only where credential auth is enabled;
- verified timestamps, last-login/security timestamps, created/updated timestamps;
- no MUV user import, foreign key, lookup, or fallback.

#### Auth.js support

`Account`, `Session`, and `VerificationToken` may follow the proven Auth.js adapter shape. Sessions must be revocable and tied to the Seera user authorization version. Tokens are single-use, expiring, and hashed where applicable.

#### `Role`, `Permission`, `RolePermission`, `UserRoleAssignment`

- stable unique codes and human labels;
- role-permission many-to-many with explicit grant metadata;
- user-role assignment is effective-dated, active/inactive, assigned/revoked by, and reasoned;
- future data-scope assignment remains separate from the permission grant;
- role-name checks alone never authorize a resource.

Seed reference roles cover Founder/Super Admin, Company Admin, Accounts Manager/Executive, Sales Head/Manager/Executive, S.S. Owner/Operator, Distributor Owner/Operator/Delivery User, Retailer User, and Read-only Auditor. Bootstrap is controlled and contains no default production password.

### Governance and configuration

#### `AuditLog`

Append-only actor/action/entity/outcome/reason/request correlation and safe before/after fields. Sensitive secrets, raw tokens, protected documents, and excessive GPS data are excluded.

#### `AppSetting`

Typed key/value configuration with category, sensitivity classification, version, active/effective dates, and audit metadata. Secrets remain in the environment/secret manager, not this table.

#### `FeatureFlag`

Stable key, enabled state, optional audience/rule JSON, effective dates, change reason, and audit actor. Flags cannot replace authorization.

#### `IdempotencyRecord` and `OutboxEvent`

Foundation support for retry-safe commands and post-commit jobs. Unique scope/key constraints, request/result fingerprints, lifecycle/expiry, attempts, and observable failure are required.

### Files and notifications

#### `StoredFile`

Private provider/key, safe original name, MIME/extension/size/hash, classification, owner context, upload/scan status, retention state, and timestamps. No permanent public URL is stored.

#### `Notification`, `NotificationDelivery`, `NotificationPreference`, `MessageTemplate`

Durable internal inbox plus optional provider attempts, retries, template versions, consent context, recipient scope, and read/delivery states. Provider failure does not invalidate committed business data.

## Future-ready domain boundaries

The following names reserve architecture seams only. They must be introduced in their frozen phases.

| Phase | Boundary | Candidate entities/invariants |
|---:|---|---|
| 2 | Catalog | `Product`, `SKU`, `PackConversion`, `TaxClassification`, `PriceList`, `Scheme`; date-effective and snapshot-ready |
| 2 | Network | `BusinessParty`, `RetailerProfile`, `DistributorProfile`, `SuperStockistProfile`, `Territory`, `Beat`, effective assignments and lifecycle foundation |
| 3 | Field | `AttendanceSession`, `LocationEvent`, `SalesVisit`, outcomes, collection, intelligence, follow-up; work-state GPS privacy |
| 4–5 | Orders/fulfilment | `CommercialOrder`, `OrderItem`, append-only `FulfilmentEvent`, delivery/proof, inventory movements; buyer/seller and item snapshots explicit |
| 6 | Billing/documents | `BillingProfile`, `TaxRegistration`, `CommercialDocument`, `BillingSnapshot`, `DocumentSequence`, share grants; legal seller and issued snapshot immutable |
| 8 | Finance | `LedgerAccount`, balanced `Journal`/lines, `Payment`, proof, allocation, reconciliation, notes; corrections by counter-entry |
| 9 | Expense/lifecycle | `ExpenseClaim`, approval chain, `PartnerLifecycleEvent`; closure preserves history and revokes access |

## Foundation integrity constraints

- normalized unique user identity;
- unique role/permission/setting/flag codes;
- no overlapping duplicate active role assignments for the same governed scope;
- append-only audit/outbox semantics;
- private storage keys unique per environment/provider;
- idempotency key uniqueness in its command scope;
- foreign keys use restrict/soft lifecycle for audit/security history;
- UTC timestamps and decimal types for future quantity/money;
- no table, enum, default, seed, or index may contain a MUV hostname, MUV organization default, MUV user, MUV document sequence, or MUV business assumption.

## Database identity guard required before migration

The migration/test entry point must fail closed when the required URL is missing/unparseable, production and test identities are equal, either endpoint matches a known MUV fingerprint, test lacks a Seera-test marker, a destructive command targets production, or migration SQL contains unapproved copied MUV table names.

This guard is required Phase 1 preparation; it is not implemented in this pass.

## Rollback contract

Before the initial migration: preserve SQL, schema hash, migration hash, empty-database identity, backup/branch restore point, and a teardown procedure applicable only to the disposable Seera test branch. After production use begins, use forward corrections; never rewrite deployed migrations.

