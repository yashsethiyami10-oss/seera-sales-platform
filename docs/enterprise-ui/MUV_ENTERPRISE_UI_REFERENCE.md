# MUV Enterprise UI — Reference (Stage 0: Baseline Inventory)

**Status: Stage 0 only. No UI implementation has occurred yet.** This document is the capability
matrix and infrastructure inventory required before Stages 1–20 can begin. It will be extended, not
replaced, as each subsequent stage lands.

## How to read this document

Each row states what exists today, verified by direct repository inspection (not assumed from prior
session summaries). "Backend Ready" means a real, tested, permission-checked service/action exists.
"UI Exists" and "Route" reflect the state confirmed in the prior Admin UI Audit, re-confirmed here.

## 1. Capability Matrix

| Platform | Capability | Source service | Server action | Permission | Route (current) | UI status |
|---|---|---|---|---|---|---|
| 3A Foundations | Idempotency, SoD, provenance, policy versioning | `lib/enterprise-phase2/foundation.ts` | none exported (internal to other Parts) | n/a (shared substrate) | none | No UI — not a customer-facing capability, correctly so |
| 3B Business Network | Partner CRUD/lifecycle | `lib/enterprise-network/partner-service.ts` | none | `network.partners.*` | none | **Missing** |
| 3B Business Network | Agreements | `governance-service.ts` | none | `network.agreements.*` | none | **Missing** |
| 3B Business Network | Commercial (royalty/commission) | `commercial-service.ts` | none | `network.royalties.*`/`network.commissions.*` | none | **Missing** |
| 3B Business Network | Attribution, enablement, ops | `attribution-service.ts`, `enablement-service.ts`, `operations-service.ts` | none | various `network.*` | none | **Missing** |
| 3C Finance | GL/Journal/Posting | `journal-service.ts`, `posting-engine.ts`, `ledger-service.ts` | none | `finance.journals.*` | none | **Missing** |
| 3C Finance | AR/AP | `ar-service.ts`, `ap-service.ts` | none | `finance.receivables.*`/`finance.payables.*` | none | **Missing** |
| 3C Finance | Banking/Reconciliation | `banking-service.ts` | none | `finance.banking.*` | none | **Missing** |
| 3C Finance | Periods, Expenses | `period-service.ts`, `expense-service.ts` | none | `finance.periods.*`/`finance.expenses.*` | none | **Missing** |
| 3D Founder OS | Dashboard/KPI/Health/Alerts | `kpi-engine.ts`, `company-health-service.ts`, `alert-engine.ts` | `actions/founder-os.ts` (exists) | `founder_os.access` | none | **Missing** (action layer exists, zero UI callers) |
| 3D Founder OS | Approval/Exception/Monitoring | `approval-center-service.ts`, `exception-center-service.ts`, `monitoring-service.ts` | `actions/founder-os.ts` | `founder_os.access` | none | **Missing** |
| 3D Founder OS | Saved Views/Layouts/Reports/Prefs | `saved-view-service.ts`, `dashboard-layout-service.ts`, `report-workspace-service.ts`, `workspace-preference-service.ts` | `actions/founder-os.ts` | `founder_os.workspace.manage` | none | **Missing** |
| Sales Architecture | CRM (customers/opps/inquiries/quotations) | `lib/sales/*`, `actions/*.ts` | Yes | various | `/sales/customers` etc. | Live |
| Sales Architecture | Leads | *not located as a distinct backend model this pass* | — | `LEADS_VIEW_ALL`/`LEADS_VIEW_ASSIGNED` (referenced in nav, needs confirmation of backing entity) | `/sales/leads` (nav entry, **no page**) | **Dead link** |
| Sales Architecture | Institutional | not located | — | `INSTITUTIONAL_MANAGE` | `/sales/institutional` (nav entry, **no page**) | **Dead link** |
| Sales Architecture | Support | not located | — | `SUPPORT_MANAGE` | `/sales/support` (nav entry, **no page**) | **Dead link** |
| RBAC | User/role directory | `app/sales/organization/page.tsx` | n/a (read-only) | `USERS_VIEW` | `/sales/organization` | Live, **view-only** — no role/permission editor exists in backend or UI |
| MUV AI (Phase 7) | Conversations/Executive/Ops/Admin | `lib/muv-ai/*` | `actions/muv-ai.ts` | `ai.*` | `/sales/ai*` | Live |
| Enterprise Operations | Vendors/Procurement/Manufacturing/etc | `lib/enterprise/*` | Yes | `ENTERPRISE_*_VIEW` | `/enterprise/[module]` | Live, flag-gated (`ENTERPRISE_OPERATIONS_ENABLED`, seeded **false**) |
| Commerce/CMS | Products/Orders/CMS/Marketing | existing | Yes | staff/admin | `/admin/*` | Live baseline — must not regress |

## 2. Infrastructure findings (Stage 0)

- **Middleware (`middleware.ts`) matcher covers only `/admin`, `/account`, `/enterprise`, `/api/enterprise`.** `/dashboard` and `/sales` are *not* edge-gated — they rely entirely on their own layout's server-side `getSalesPrincipal()` check (a real, legitimate per-request check, just not double-gated at the edge). New route families (`/finance`, `/network`, standalone `/founder`) will need this same layout-level pattern at minimum, and should be added to the middleware matcher for UX-fast-path consistency with `/admin`/`/enterprise`.
- **RBAC (`lib/rbac.ts`) only knows three roles**: `ADMIN`, `STAFF`, `CUSTOMER` — this is the *storefront/admin* auth layer. The Sales/Enterprise permission system (`lib/sales/authorization.ts`, `PERMISSIONS` in `lib/sales/constants.ts`, `SalesRole`/`SalesPermission`) is a **separate, richer RBAC layer** already used by Sales/Founder OS/Network/Finance. Stage 6 (RBAC Administration Completion) concerns the *second* system, not `lib/rbac.ts`.
- **No shared enterprise UI component library exists.** `components/ui/` has 7 files (`social-icons`, `toggle-switch`, `modal`, `toast`, `reveal`, `password-input`, `primitives`) — no DataTable, Drawer, Combobox, Pagination, Tabs, Breadcrumbs, or Chart primitive. Every existing Sales/Enterprise Operations list page (`/sales/organization`, `/enterprise/[module]`, `/sales/ai/*`) hand-rolls its own inline `<table>` and prev/next links directly in the page file — **none of them meet Stage 12's own bar** (search, filters, sort, result count, loading/empty/error states). Building Finance/Network/Founder OS UI to the standard this authorization demands requires first establishing these shared primitives — this is itself a real, non-trivial foundation task, not something "reuse existing components" can shortcut.
- **`/sales/leads`, `/sales/institutional`, `/sales/support`**: confirmed (again) to have zero backing `page.tsx`. For Leads specifically, no distinct "Lead" Prisma model or service was located in this pass's search — `PERMISSIONS.LEADS_VIEW_ALL`/`LEADS_VIEW_ASSIGNED` exist as permission keys, but what data model they're meant to gate needs to be identified before Stage 5 can build real (not placeholder) Leads UI.

## 3. Fiscal-year test-pool remediation — architectural finding (blocking further action, needs a decision)

Investigated per Stage 0's explicit instruction. **Finding: in-place cleanup/purge is not a safe option**, confirmed by reading the actual trigger SQL, not assumed:

```sql
CREATE TRIGGER finance_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON "finance_ledger_entries"
```

This (and the matching triggers on `finance_journals`/`finance_journal_lines`) block **DELETE**, not
only UPDATE, at the database level — for every client, including raw SQL and a superuser `DELETE`
statement, not just Prisma. The frozen test file's own comment (`stageA-accounting-core.integration.test.ts`)
already documents this was tried and rejected: *"Fiscal years created by tests are permanent (cannot
be cleaned up once referenced)."* Every fiscal year the test pool has ever used is therefore
permanently unreclaimable by design — this is the immutability guarantee working exactly as intended,
not a bug.

This rules out "deterministic cleanup" and "rollback" as viable *in-place* strategies for any test
that posts a real journal (most of Stage A/B do) — wrapping an entire existing frozen test file in one
outer `$transaction()`-and-roll-back would require restructuring every `it()` block into one sequential
function body inside a single transaction callback, which is a substantial rewrite of frozen test
files, not a minimally-bounded fix.

**The only remaining safe option consistent with "do not weaken the guard" and "do not modify frozen
backend behavior" is an isolated/disposable test database** — a second Postgres database, migrated
and seeded independently, that Finance (or all) integration tests run against instead of the shared
dev database. This is the textbook-correct fix for "immutable-by-design test data accumulating in a
shared database," and it requires no change to any frozen file's logic.

**This was not implemented in this pass.** Provisioning a second database and repointing test
execution at it is a cross-cutting infrastructure change — it affects how *every* test in the project
runs, not only Finance's. Given the size of everything else authorized in this same instruction, I
did not think it was my call to make unilaterally without flagging it first. See the status report
for the proposed next step.

## 4. What Stage 0 did not yet cover

Stages 1–20 (authentication/redirect implementation, unified shell, navigation, five role dashboards,
Sales completion, RBAC UI, Business Network UI, Finance UI, Founder OS UI, MUV AI integration check,
Enterprise Operations flag verification, data-state standardization, mutation safety, responsive/
accessibility QA, security audit, performance review, automated testing, live validation, manual
acceptance testing, and the final independent UI audit) are unstarted. See the status report for why,
and the proposed staged plan.
