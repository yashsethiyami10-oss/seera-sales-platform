# Seera Entity Isolation Audit

## Finding

There is no complete tenant boundary. Newer enterprise modules use `organizationKey`, generally filter it in services, and use composite indexes. However, the authenticated principal always resolves to `MUV`; keys are strings rather than organisation foreign keys; identity has no membership; and core MUV/Sales/commerce models are global. A second string key cannot safely activate Seera.

## Major-table scope matrix

| Model/Table | Existing Tenant Field | Current Scope Enforcement | Risk | Required Change |
|---|---|---|---|---|
| User/Auth Account/Session | None | Global email identity and JWT base role | Critical | Add organisation + membership + membership version/active context; retain global identity |
| SalesRole/Permission | None | Global role assignment via `User.salesRoleId` | Critical | Membership-scoped role grants; organisation-owned/custom roles or governed templates |
| Territory | None | Owner/territory filters are optional business filters | Critical | Organisation ownership, composite code, scoped hierarchy and assignments |
| Customer/contacts/documents/addresses | None | Global unique email/code; mixed owner checks | Critical | Organisation party model or tenant keys and composite uniqueness; isolate documents |
| Product/Variant/Category/Brand | None | Public/global catalog queries | Critical | Organisation catalog, SKUs/prices, explicit public publication boundary |
| Storefront Order/OrderItem/PaymentAttempt | None | Customer/staff ownership; no tenant | Critical | Keep MUV-only behind adapter or add immutable org ownership and scoped numbers |
| SalesInquiry/Opportunity/Quotation | None | Sales permission/owner/territory controls | Critical | Organisation keys on aggregate/children, scoped repositories/exports/sequences |
| Institutional Inst* | Mostly none | User/territory scope (`lib/inst-sales/scope.ts`), not tenant | Critical | Organisation ownership throughout or isolate as MUV-only; scoped sequences/files |
| BusinessOrder | `organizationKey` default MUV | Some actions filter MUV/key; Customer/Product parents remain global | High | FK organisation, membership context, parent consistency, item/event hardening |
| BusinessOrderItem | No explicit key | Reached through order | High | Add organisation key for defence/indexing; fulfilment event model |
| Commerce Order extension (`Order`) | None | Sales permissions/owner/territory | Critical | MUV-only or tenant migration; do not confuse with storefront header status |
| Warehouse/StockLedger/Reservation/Allocation/Dispatch | None | Global warehouse/product references | Critical | Organisation inventory and composite scope; explicit fulfilment party |
| Enterprise Network* | `organizationKey` | Services usually use `principal.organizationKey` | High | Replace hard-coded principal; FK org; membership/partner portal scope; DB parent consistency |
| Enterprise Finance* | `organizationKey` | Services commonly scope; posting validates organisation | High | Replace literal MUV context; FK org; channel party subledger mappings; cross-key constraints |
| EnterpriseSequence | `organizationKey` | Composite document type | Medium | FK org, legal-entity sequences/format/config, concurrency validation |
| SalesAuditLog | None | Append-only trigger policy; global reads | Critical | Organisation key, scoped viewer, actor membership snapshot and hash/trigger verification |
| NotificationLog | None | Operational send log, no tenant inbox | Critical | Org sender/recipient/template scope; separate inbox/read state |
| FounderNotification | `organizationKey` | Recipient + org indexes | High | Real membership context and notification-recipient validation |
| MediaAsset/attachments/files | Mostly none or parent-only | Cloudinary/public URLs and permission checks vary | Critical | Organisation namespace, private signed delivery, parent/org validation, malware/type limits |
| AI/Support/Enterprise production | `organizationKey` on many | Mixed: many services scoped; some definitions/global queries | High | Catalogue global-vs-org classification and systematic query audit |
| Reports/saved views | Mixed | Some org-scoped; Sales/global aggregates exist | Critical | Org-required reporting contract and export tests |

## Application enforcement evidence

- Positive pattern: enterprise network services repeatedly use `findFirst({ id, organizationKey: principal.organizationKey })`, for example `lib/enterprise-network/partner-service.ts` and `operations-service.ts`.
- Positive pattern: finance posting validates accounts and dimensions belong to the passed organisation in `lib/enterprise-finance/validation-engine.ts`; the ledger is generated through governed posting in `posting-engine.ts`.
- Blocking pattern: `lib/platform-core/context.ts` returns only `MUV`; `lib/validations/enterprise-phase2.ts` uses `z.literal("MUV")`.
- Blocking pattern: `lib/rbac.ts` knows only global `ADMIN/STAFF/CUSTOMER`; `lib/platform-core/authorization.ts` loads one global SalesRole.
- Blocking pattern: storefront/admin APIs and actions operate on global Product/Customer/Order tables. A tenant key on only enterprise tables cannot contain their data.
- UI evidence: `components/os-shell/Header/CompanySwitcher.tsx` states tenant support is intentionally absent.

## Leakage paths and severity

| Path | Severity | Evidence/impact | Mitigation |
|---|---|---|---|
| Global catalog/customer/order queries and selectors | Critical | Core models have no org key | MUV-only adapter during migration; scoped repositories; composite FK strategy |
| Role check without membership | Critical | `requireAdmin/Staff` and Sales principal are global | `requireOrgPermission` with active membership and assignment scope |
| Exports/search/count/groupBy | Critical | Many Sales APIs aggregate global models | Mandatory org argument from principal; lint/query wrapper; isolation tests |
| File/document URL | Critical | Media and multiple attachment tables lack uniform org boundary | Private asset registry, signed download action, storage prefix and parent validation |
| Document numbers/branding | High | Global quotation/order/catalog configuration | Org sequence/template/legal identity; forbid fallback across orgs |
| Notifications | High | `NotificationLog` has no inbox/org recipient boundary | Org-scoped template, sender, recipient resolution, outbox/inbox |
| Background jobs | High | Finance jobs scope MUV context; no general tenant fan-out lease | Per-org jobs with idempotency, lease, audit and explicit org list |
| Cache/SSR | High | No tenant-aware cache-key contract | Include org in keys/tags; never cache private data globally |
| URL/ID manipulation | High | IDs plus role checks can reach global records | Query by `{id, organizationId}`; return not found; assignment predicates |
| Cross-key child references | High | String org keys do not ensure parent key equality | Composite keys/FKs where feasible; transaction assertions otherwise |

## Required Phase 1 controls

1. Create organisation and membership records; backfill only MUV records before Seera exists.
2. Resolve active organisation server-side from a signed session/cookie plus live membership; never trust client org input.
3. Add a central scoped principal and permission/assignment policy. Invalidate sessions after membership, role, status or hierarchy changes.
4. Establish repository contracts requiring organisation ID; instrument/log missing scope during migration; prohibit direct Prisma access in Seera services.
5. Classify every Prisma model as global, organisation-owned, organisation-derived, or forbidden cross-domain.
6. Isolate files, document sequences, notification senders, exports, caches and jobs before UI switching.
7. Add adversarial two-organisation fixtures and denial tests before any Seera seed/import.

