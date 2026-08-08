# Seera Phase 1 Schema Design

## Boundary

The active schema is independent and foundation-only. It has 16 models and 14 enums.

### Identity/auth

`User`, `Account`, `Session`, `VerificationToken`. Users have active/inactive/suspended state and an authorization version. Sessions support explicit revocation. No MUV identity or role enum is referenced.

### Governed RBAC

`Role`, `Permission`, `RolePermission`, `UserRoleAssignment`. Codes are data, users may hold multiple effective-dated assignments, grant/revocation actor and reasons are retained, and permissions remain separate from future territory/party scopes.

### Governance

`AuditLog`, `AppSetting`, `FeatureFlag`, `IdempotencyKey`, `OutboxEvent`. Audit intent is append-only; settings/flags are typed/versioned; flags do not authorize; idempotency and outbox records support retry-safe future workflows.

### Storage and notifications

`StoredFile`, `Notification`, `NotificationDelivery`. Files store private provider keys, hash/type/size/classification/scan/lifecycle metadata—not public URLs. Notifications provide inbox/read/archive/priority/entity linkage and separate channel delivery state; no WhatsApp implementation is included.

### Enums

`UserStatus`, `RoleStatus`, `RoleAssignmentStatus`, `AuditOutcome`, `SettingValueType`, `IdempotencyStatus`, `OutboxStatus`, `FileClassification`, `FileScanStatus`, `FileLifecycleStatus`, `NotificationPriority`, `NotificationStatus`, `NotificationChannel`, and `NotificationDeliveryStatus`.

## Explicit exclusions

No Retailer, Distributor, SuperStockist, Beat, SalesVisit, CommercialOrder, Ledger, Payment, BillingProfile, CommercialDocument, ExpenseClaim, PartnerLifecycleEvent, GST, TA, field or fulfilment model exists. Those remain in their frozen later phases.

No initial migration SQL exists. Local Prisma binaries were absent, so Prisma validation/generation was not run. Static structure checks passed; Prisma validation is a Block 2 prerequisite before migration generation.
