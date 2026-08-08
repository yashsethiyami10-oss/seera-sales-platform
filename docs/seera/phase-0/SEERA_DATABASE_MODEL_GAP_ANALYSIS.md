# Seera Database Model Gap Analysis

## Current findings

- Identity is global and single-role (`User.role`, `salesRoleId`, `territoryId`); no organisation membership.
- Enterprise models from `EnterpriseSequence` onward frequently have `organizationKey`; core storefront, Sales OS, CRM, catalog, inventory and institutional models mostly do not.
- `NetworkPartner`, effective-dated `NetworkPartnerHierarchy`, `NetworkTerritory` and assignments are strong channel foundations (`prisma/schema.prisma:6390-6611`).
- Finance supplies an organisation-keyed GL/ledger/AR/AP/banking/expense foundation (`prisma/schema.prisma:6197-9255`).
- `InstVisit` has check-in/out coordinates/times (`prisma/schema.prisma:7325-7356`), but no location-event stream, beat, device/fake-GPS evidence or offline identity.
- `BusinessOrder` is organisation-keyed but its items do not record lifecycle quantities/events (`prisma/schema.prisma:7674-7787`).

## Proposed migration waves (no migration created)

| Change | Reason / affected models | Backfill | MUV regression risk | Rollback strategy |
|---|---|---|---|---|
| Add `Organization` | Real legal/business boundary | Seed MUV only; Seera after gate | Medium | Additive table can remain dormant |
| Add `OrganizationMembership`, membership roles | Same identity/multi-role/status | Create memberships for existing staff/customers based on approved mapping | High | Compatibility adapter reads legacy role; no destructive column removal |
| Active-context/session version | Prevent stale/switch bypass | Initialize membership version | High | Feature flag new resolver; revert to MUV-only adapter |
| Add org FK to Customer/Product/Territory/Sales aggregates | Close global-data leakage | Batched MUV backfill, validate, then NOT NULL | Critical | Expand/contract; dual-read verification; retain legacy indexes until cutover |
| Composite uniques/indexes | Permit separate codes/numbers safely | Resolve duplicates before constraint | High | Create concurrently where supported; drop new index only if rollback |
| Org asset/document metadata | Isolate files/branding/sequences | Tag legacy assets MUV; inventory orphans | High | Keep existing URLs read-only behind MUV adapter |
| Channel Party/Retailer profile | Model legal channel actors safely | Optional governed Customer mappings, never implicit | Medium | New additive tables |
| Territory/Beat/assignment history | Retail execution and attribution | Convert approved MUV territories only if needed | Medium | Additive; disable Seera routes |
| PriceList/PriceListLine/Scheme snapshots | Multi-level effective pricing | No MUV conversion until parity proved | High | New engine behind feature flag |
| ChannelOrder/attribution snapshots | Unambiguous four order flows | None initially; do not auto-convert MUV orders | High | Additive aggregate/adapter decision |
| ItemFulfilmentEvent/Delivery/Proof | Net delivered truth | Existing orders remain legacy/non-Seera | Medium | Additive; event rows immutable |
| PaymentProof/Verification/Allocation link | Maker-checker and bank match | None | Medium | Additive; no release automation initially |
| Party ledger mappings | Connect network parties to finance accounts | Controlled account-opening migration | High | Ledger remains authoritative; mappings reversible, postings are reversed not deleted |
| Visit/GpsEvent/Device/SyncOperation | Field/offline integrity | None | High privacy risk | Disable collection, retain governed records per policy |
| Expense/target extensions | Approved distance and delivered metrics | None | Medium | Additive versions/snapshots |
| Notification inbox/preference/outbox | Reliable scoped messaging | Existing NotificationLog remains historical | Medium | Disable channels; keep queued history |

## Required database safeguards

- Prefer opaque `organizationId` FKs. If frozen modules retain `organizationKey`, add a registry FK and adapters.
- Composite parent identity or transaction assertions must prevent a Seera child referencing a MUV parent.
- Add organisation to all natural and idempotency keys. Do not reuse global document numbers.
- Event, audit and ledger rows are append-only; correction uses counter-events/reversals.
- Consider PostgreSQL row-level security only as defence in depth after connection/session-pooling design; application scoping remains mandatory.
- Store money in approved minor-unit/Decimal convention consistently; current schema mixes whole-rupee `Int` commerce fields and `Decimal` enterprise finance, requiring a documented conversion boundary.

## Retailer recommendation

Use a separate organisation-owned channel `Party` plus `RetailerProfile`, optionally mapped to an existing Customer. Extending `Customer` directly is unsafe because it currently has global unique email, user and customer code and is shared with MUV storefront/CRM semantics.

