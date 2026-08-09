# Seera V1 Final Product Architecture

**Status:** Authoritative consolidated product-surface contract  
**Scope:** Seera V1 phases 1–11; no Phase 12  
**Execution model:** Preserve and reuse the existing Seera domain, API, RBAC, audit, offline, document, finance, analytics and automation foundations. Add human-usable portal workflows without duplicating authoritative business logic.

## 1. Product principles

- One shared responsive application shell serves every role; navigation and actions are permission- and scope-derived.
- Every operational list uses business names/codes and searchable selectors. Internal UUIDs remain opaque route parameters and never become the primary input method.
- Lists provide search, relevant filters, pagination or a bounded result set, empty/loading/error states and a detail route.
- Mutations reuse existing governed APIs/services and preserve server-side authorization, scope, idempotency, audit and state-transition checks.
- English and Hindi are presentation choices only. Canonical codes, GSTINs, SKUs, document/order numbers, partner names and user-entered text are never translated or mutated.
- Desktop is primary for Founder, administration, Accounts and audit; mobile is primary for field and delivery roles; Distributor, Super Stockist and Retailer are responsive on both.
- Company → Super Stockist remains advance-payment-only. Standard company credit to a Super Stockist is prohibited.
- Booked sales and delivered sales remain distinct. Partial, cancelled, refused and returned quantities affect delivered performance.
- Issued financial/legal documents and posted inventory/ledger records are immutable; corrections use governed superseding, reversal or adjustment workflows.

## 2. Shared route and interaction model

| Structure | Route contract | Behavior |
|---|---|---|
| Login | `/login` | Branded EN/HI authentication and safe next-route handling |
| Portal home | `/portal/{portal}` | Role-scoped command centre and current work |
| Section list | `/portal/{portal}/{section}` | Search, filters, status/time controls, responsive list/cards |
| Create | `/portal/{portal}/{section}/new` | Governed form using business entity selectors |
| Detail | `/portal/{portal}/{section}/{id}` | Summary, timeline, related records and allowed actions |
| Edit/action | detail-page panels or governed modal | Permission and state-sensitive; confirmation and result feedback |
| Profile | `/portal/{portal}/profile` | Identity and language preference |
| Notifications | `/portal/{portal}/notifications` | Durable inbox, read/archive behavior |

The shared shell owns the logo, mobile drawer, desktop sidebar, header, breadcrumbs, active navigation, global entity search where authorized, profile, language, notifications and sign-out. Section definitions are data-driven; roles do not receive duplicated applications.

## 3. Role and portal contracts

### 3.1 Founder / Super Admin

| Field | Contract |
|---|---|
| Portal / landing | Founder Admin — `/portal/founder-admin` |
| Purpose | Organization-wide command centre, governed control, exceptions and audit |
| Navigation | Dashboard; Sales; Distribution; Field Force; Finance; Documents; Analytics; Approvals; Administration; Audit; Notifications; Profile |
| Pages/sub-pages | Sales overview, orders, delivered sales, returns, collections; Super Stockists, Distributors, Retailers, prospects, network stock; Heads, Managers, Executives, daily working, attendance, visits, joint working, beats/territories; outstanding, ageing, ledgers, payments, claims, TA; invoice/challan/note/receipt/supporting-document centre; sales/product/territory/team/distribution/financial/month analytics; approval queues; users, roles, masters, pricing, territories, beats, partners, settings; activity/financial/stock/security audit |
| Primary actions | Review and approve governed exceptions; manage identities/configuration/masters; inspect organization-wide business records; issue or share documents where permitted |
| Filters/search | Global period and organization scope; party, territory, team, status, risk, document and business-number search |
| Backend reused | Foundation services/APIs; master/network services; manager operations; document APIs/services; finance operations/ledger; partner lifecycle; Phase 10 analytics/report/automation APIs |
| RBAC/scope | `system:super_admin` plus explicit domain permissions; organization-wide scope |
| Priority / language | Desktop first, responsive tablet/mobile; EN/HI |
| Frozen phases | 1, 2, 6, 7, 8, 9, 10, 11 |

### 3.2 Company Admin

| Field | Contract |
|---|---|
| Portal / landing | Shared Admin — `/portal/founder-admin` |
| Purpose | Authorized administration, network/team configuration and operational oversight without Founder-only authority |
| Navigation/pages | Permission-filtered subset of Founder Administration, Distribution, Field Force, Approvals, Audit, Notifications and Profile |
| Actions | Manage permitted users, roles, masters, territories, beats, partners and settings; process permitted approvals |
| Backend reused | Same Founder/Admin services and routes; no duplicate APIs |
| RBAC/scope | Effective Company Admin permissions; organization or assigned network scope; direct Founder-only routes return Access Denied |
| Priority / language | Desktop first; EN/HI |
| Frozen phases | 1, 2, 7, 9, 11 |

### 3.3 Accounts Manager

| Field | Contract |
|---|---|
| Portal / landing | Accounts — `/portal/accounts` |
| Purpose | Maker-checker financial control and exception management |
| Navigation | Dashboard; Payments; Receipts; Payment Inbox; Ledgers; Outstanding; Ageing; Allocation; Reconciliation; Claims; Credit Exposure; Credit Exceptions; Reversals; TA/Expenses; Documents; Reports; Audit; Notifications; Profile |
| List/detail/actions | Search parties and business references; verify funds; allocate/reallocate; reconcile; settle claims; approve/post/reverse where authorized; approve reimbursement; inspect immutable posting history |
| Backend reused | `/api/finance/operations`, `/api/finance/ledger`, document APIs, travel operations, existing finance/document services |
| RBAC/scope | Accounts view/verify/approve/post/reverse permissions; maker-checker enforced; organization finance scope |
| Priority / language | Desktop first; EN/HI |
| Frozen phases | 6, 8, 9, 10, 11 |

### 3.4 Accounts Executive

| Field | Contract |
|---|---|
| Portal / landing | Accounts — `/portal/accounts` |
| Purpose | Transaction preparation, evidence review and queue processing |
| Navigation/pages | Manager workbench subset: payments, receipts, inbox, ledgers, outstanding, ageing, allocations, reconciliation preparation, claims, TA/expenses, documents, reports, notifications |
| Actions | Create/prepare/verify only where granted; no managerial approval, reversal or policy override controls |
| Backend reused | Same Accounts APIs/services |
| RBAC/scope | Effective Accounts Executive permissions and assigned organization/party scope |
| Priority / language | Desktop first; EN/HI |
| Frozen phases | 6, 8, 9, 10, 11 |

### 3.5 Sales Head

| Field | Contract |
|---|---|
| Portal / landing | Sales Manager shell — `/portal/sales-manager` |
| Purpose | Multi-manager hierarchy, territory performance, targets, exceptions and approvals |
| Navigation | Dashboard; My Daily Working; Retailing; Joint Working; Partner Visits; Distributor Search; Collections; Team Review; Managers/Executives; Attendance; Visits; Targets; Delivered Sales; Prospects; TA Verification; Approvals; Alerts; Analytics; Notifications; Profile |
| Actions | Start/end own day; record governed field work; review hierarchy; assign/review targets; verify subordinate TA and permitted exceptions |
| Backend reused | `/api/manager/operations`, travel operations, partner/network services, Phase 10 analytics and reports |
| RBAC/scope | Sales Head permissions; hierarchy and territory descendants |
| Priority / language | Desktop/tablet with mobile field support; EN/HI |
| Frozen phases | 2, 7, 9, 10, 11 |

### 3.6 Sales Manager

| Field | Contract |
|---|---|
| Portal / landing | Sales Manager — `/portal/sales-manager` |
| Purpose | Own field activity plus assigned-team execution and joint work |
| Navigation/pages | Same operational set as Sales Head, restricted to assigned team/territory |
| Actions | Start/end day, retailing, joint working, S.S./Distributor visit, prospect/follow-up, collection, team review, TA verification and permitted approvals |
| Integrity | Joint work is linked once and is not double-counted; own TA routes to higher authority |
| Backend reused | Manager operations, travel, network, analytics/report services |
| RBAC/scope | Manager permissions; own plus directly assigned team/territory |
| Priority / language | Tablet/mobile and desktop; EN/HI |
| Frozen phases | 2, 7, 9, 10, 11 |

### 3.7 Sales Executive

| Field | Contract |
|---|---|
| Portal / landing | Sales Executive — `/portal/sales-executive` |
| Purpose | Fast mobile field-day execution with resilient offline sync |
| Navigation | Today; Beat/Route; Retailers; Orders; Collections; Prospects; Targets; Delivered Sales; History/DSR; Sync; Notifications; Profile |
| Primary journey | Start Day → Today’s Beat → Retailer List → Retailer Detail → Check-in → Order/Collection/Notes → Checkout → Next Retailer → End Day |
| Supporting pages/actions | GPS permission/status; retailer search/create where governed; order and collection history; distributor search/prospect; queued operations, conflicts and retry status |
| Backend reused | Offline bootstrap/queue/sync APIs, Phase 3 field services, analytics and notification services |
| RBAC/scope | Own user, assigned beat/territory/retailers and permitted partner prospect scope |
| Priority / language | Mobile first with large touch targets; EN/HI |
| Frozen phases | 2, 3, 10, 11 |

### 3.8 Super Stockist Owner

| Field | Contract |
|---|---|
| Portal / landing | Super Stockist — `/portal/super-stockist` |
| Purpose | Company replenishment and Distributor fulfilment/credit operations |
| Navigation | Dashboard; Company Orders; Incoming Receipts; Inventory; Distributor Orders; Allocation; Dispatch; Delivery; Distributor Credit; Collections; Outstanding; Ledger; Returns; Damage/Adjustment; Documents; Reports; Notifications; Profile |
| Actions | Place advance-payment company orders, acknowledge receipts, allocate/dispatch to scoped Distributors, govern S.S.→Distributor credit, collect and reconcile, issue own-identity documents |
| Backend reused | Master/network, inventory/order/fulfilment, finance/ledger, document and analytics services |
| RBAC/scope | Owner permissions; own Super Stockist and downstream authorized Distributor network |
| Priority / language | Responsive desktop/tablet/mobile; EN/HI |
| Frozen phases | 2, 5, 6, 8, 10, 11 |

### 3.9 Super Stockist Operator

Uses `/portal/super-stockist` and the same page system. Navigation/actions are limited to delegated order, receipt, stock, allocation, dispatch, delivery, document and report permissions. Credit policy, owner administration and high-risk adjustments are hidden unless explicitly granted. Scope is the assigned Super Stockist only. EN/HI; Phase 5/6/8/10/11.

### 3.10 Distributor Owner

| Field | Contract |
|---|---|
| Portal / landing | Distributor — `/portal/distributor` |
| Purpose | Retailer fulfilment, stock, delivery and own financial operations |
| Navigation | Dashboard; Orders; Order Inbox; Retailer Fulfilment; Inventory; Incoming Stock; Stock Movement; Replenishment; Deliveries; Returns; Damage/Shortage; Credit; Outstanding; Ledger; Payments; Documents; Claims; Reports; Notifications; Profile |
| Actions | Accept/partially accept retailer orders, allocate/dispatch/deliver, receive stock, record governed returns/damage, pay/allocate, inspect credit and ledger, issue own-identity documents |
| Backend reused | Order/fulfilment, inventory, finance/ledger, document, claim and analytics services |
| RBAC/scope | Owner permissions; own Distributor, assigned retailers and delivery staff |
| Priority / language | Responsive; EN/HI |
| Frozen phases | 2, 4, 6, 8, 10, 11 |

### 3.11 Distributor Operator

Uses `/portal/distributor` and the same page system with delegated operational navigation. Owner administration, credit-policy changes, sensitive finance and high-risk stock adjustment controls are omitted unless granted. Own Distributor scope; EN/HI; Phase 4/6/8/10/11.

### 3.12 Distributor Delivery User

| Field | Contract |
|---|---|
| Portal / landing | Restricted Delivery experience — `/portal/distributor` |
| Purpose | Assigned last-mile execution only |
| Navigation | Today’s Deliveries; Route; Pending; Delivery Detail; Sync; Notifications; Profile |
| Actions | Mark delivered/partial/refused, capture proof of delivery, record authorized collection, preserve offline payload and replay idempotently |
| Backend reused | Fulfilment/delivery and offline queue/sync services |
| RBAC/scope | `distributor_delivery:execute`; assigned delivery/retailer records only; no full finance, credit, owner administration or unrelated inventory |
| Priority / language | Mobile first; EN/HI |
| Frozen phases | 4, 6, 11 |

### 3.13 Retailer User

| Field | Contract |
|---|---|
| Portal / landing | Retailer — `/portal/retailer` |
| Purpose | Simple own-account ordering and service visibility |
| Navigation | Dashboard; Orders; Order History/Status; Documents; Outstanding; Reorder; Notifications; Profile |
| Actions | View own records, reorder eligible items and access authorized documents |
| Backend reused | Order, document, finance read-model and notification services |
| RBAC/scope | Strictly own Retailer/party records |
| Priority / language | Mobile/responsive; EN/HI |
| Frozen phases | 2, 4, 6, 8, 10, 11 |

### 3.14 Read-only Auditor

| Field | Contract |
|---|---|
| Portal / landing | Auditor — `/portal/auditor` |
| Purpose | Independent governed inspection without mutation controls |
| Navigation | Audit Overview; Activity Log; Financial Audit; Stock Audit; Security/Access Audit; Reports; Notifications; Profile |
| Pages/actions | Search/filter events and business references, open detail and related immutable history, run authorized read-only reports/exports |
| Backend reused | Foundation audit, finance ledger/history, inventory movement and report services |
| RBAC/scope | Audit/report view permissions only; configured organization scope; all mutation routes deny |
| Priority / language | Desktop first, responsive; EN/HI |
| Frozen phases | 1, 6, 8, 10, 11 |

## 4. Cross-role workflow contracts

### Documents and GST

Document list/detail/create/upload routes select the business transaction and verified issuer; users do not enter internal Document IDs. Supported types are tax/non-tax invoice, pro-forma, challan, receipt/payment receipt, credit note, debit note and supporting documents. Detail exposes immutable version, PDF/print/download, expiring secure share, delivery abstraction and audit history. Existing document issue/upload/download/share APIs remain authoritative. Phase 6.

### TA and expense

`Submission → correction → manager verification → Accounts/Admin approval → reimbursement posting → payment`, with evidence and status timeline. Own-manager claims escalate. GPS distance is evidence/estimate only. Existing travel API/service remains authoritative. Phase 9.

### Partner lifecycle

Partner detail exposes `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `CLOSED`, `REACTIVATED` history and only valid next actions. Reason, effective date, actor and approval are governed; history and linked business records remain. Existing lifecycle API remains authoritative. Phase 9.

### Credit governance

Distributor credit detail exposes limit, days, original due date, grace, overdue, warning/block, exceptions, promises, approved extension and exposure. Original due date is immutable. Company→S.S. remains advance-only. Existing finance/credit services remain authoritative. Phases 5 and 8.

### Inventory

Stock summary, SKU detail and movement history distinguish receipt, allocation, dispatch, delivery, return, damage, system movement and governed manual adjustment. Physical reconciliation records counted quantity, variance, approval and resulting append-only movements; stock is never silently overwritten. Phases 4, 5 and 8.

### Analytics and intelligence

Role dashboards share time presets: Today, Yesterday, This/Last Week, This/Last Month, Month-by-Month, Quarter, YTD, FY and Custom. Every metric is scope-safe and traceable. Existing Phase 10 dashboards, reports, exports, notifications, automation rules and deterministic insights are reused. Phase 10.

## 5. Implementation sequence

1. Extend the shared shell, route registry, section metadata, reusable list/detail/form/state components and permission-aware navigation.
2. Complete Founder/Admin/Auditor surfaces as the broadest reusable view layer.
3. Complete Sales Executive and Delivery mobile workflows.
4. Complete Manager/Head, Distributor, Super Stockist, Accounts and Retailer portals by configuring shared patterns and connecting existing services.
5. Close documents, lifecycle, TA, credit, inventory, analytics, automation and notification workflow gaps.
6. Create one coherent guarded TEST dataset only after the major surface is complete.
7. Declare `READY FOR INTEGRATED SYSTEM VERIFICATION`, then run the single consolidated verification cycle and defect register.

## 6. Traceability index

| Frozen phase | Product surface |
|---|---|
| Phase 1 | Login, shell, identity, RBAC, users, roles, settings, audit, profile, notifications and global states |
| Phase 2 | Masters, sales network, parties, territories, beats, assignments and pricing |
| Phase 3 | Sales Executive mobile field day, visit, order, collection and offline operations |
| Phase 4 | Distributor, Retailer and Delivery operations |
| Phase 5 | Super Stockist operations and S.S.→Distributor credit |
| Phase 6 | Billing, documents, GST, PDF, secure access and issuer identity |
| Phase 7 | Sales Head/Manager field and team operations |
| Phase 8 | Accounts, ledger, payments, allocation, ageing, reconciliation, claims and financial control |
| Phase 9 | TA/expense and partner lifecycle |
| Phase 10 | Analytics, reporting, automation, notifications and deterministic intelligence |
| Phase 11 | Offline hardening, security, performance, recovery and launch verification |

This document supersedes phase-by-phase UI assumptions but does not alter frozen domain rules, authorization boundaries, data ownership or production safety constraints.
