# MUV Platform — Phase 10.0 — Sales OS Separation — Block 1

**Architecture Separation + RBAC Audit.** Governance/audit phase only — no
physical file migration, no UI redesign, no new business workflow, no
behavior change. This document is the human-readable companion to the
machine-checked artifacts:

- `lib/platform/module-registry.ts` — the authoritative module/route/permission
  ownership registry (Part C).
- `scripts/verify-sales-os-block1.ts` (`npm run verify:sales-os-block1`) —
  the permanent verification suite (Part H).

Everything below is derived from those two files plus the Part A/B research
pass (6 parallel read-only exploration agents over `app/`, `actions/`,
`lib/`, `prisma/schema.prisma`, `prisma/seed.ts`, `middleware.ts`). Where a
finding is already recorded in a module's `knownIssues` array, this report
references it rather than restating it in different words — the registry
is the source of truth; this document is prose, not a second copy.

---

## Part A + B — Architecture & Boundary Audit

The "combined Sales OS" the brief describes is, concretely, **12 real
bounded contexts sharing one authorization/authorized-principal layer**
(`lib/sales/authorization.ts` + `lib/sales/constants.ts`), not one
undifferentiated blob. Two contexts the Phase 10.0 brief names — **Sales
Manager OS** and **Sales Officer OS** — turned out not to exist as separate
code at all: they are permission-grant profiles (`SalesRole` rows) over
identical CRM Core code, differentiated only by which `PERMISSIONS` keys a
role is granted, never by a role-name branch in business logic. They are
recorded as a documented sub-finding inside `crm-core`, not fabricated as
two hollow module entries.

Three real, cohesive modules exist in the codebase that the brief's target
list did **not** name: **Network / Partner OS** (`lib/enterprise-network/*`,
franchise/distributor/commission/territory-agreement management),
**Order Management OS** (`actions/order-mgmt.ts` + `actions/operations.ts`,
the D2C/BusinessOrder fulfillment views and the Milestone 5 Operations
Queue), and **Master Data OS** (`actions/master-data.ts` +
`actions/customers.ts`/`employees.ts`/`territories.ts`, the MUV OS shell's
own "Master Data" nav group). All three are registered as real modules
(`network-os`, `order-management-os`, `master-data-os` in
`lib/platform/module-registry.ts`) with an explicit flag in each one's
`knownIssues` that a Founder decision on their long-term placement is
still open — this report does not silently assume they should be merged
into an existing named module or split out permanently.

The full 14-module map, with per-module status, summary, data models,
lib/action files, permission prefixes, and every specific boundary issue
found, is Part C below (generated from the registry, not restated by hand,
so it cannot drift out of sync with it).

**Cross-module coupling and shared services found** (Part B):

- `lib/sales/authorization.ts` + `lib/sales/constants.ts` are imported by
  **182 files** across every module — Founder OS, Institutional Sales OS,
  Finance OS, Network OS, Customer Support OS, Manufacturing OS, and the
  Sales AI Assistant all depend on them directly. This is the single
  largest fact governing how hard physical separation would be — see
  `shared-platform-core`'s `knownIssues` entry.
- `actions/operations.ts` is depended on by both **Order Management OS**
  and **Warehouse OS** — the Operations Queue workflow reads `Inventory`
  and writes `InventoryReservation` directly instead of calling a Warehouse
  OS service function through a boundary.
- `lib/sales/sales-intelligence-service.ts` / `actions/sales-intelligence.ts`
  physically live under the CRM Core directory name but implement
  **Institutional Sales OS** logic (query `InstOpportunity`, gated by
  `INST_OPPORTUNITIES_*` permissions) — a misplaced-module finding, not a
  shared-service one.
- The internal **Sales AI Assistant** (`lib/muv-ai/*`) calls **Founder OS**
  and **Customer Support OS** service functions directly as "tools,"
  crossing module boundaries without an intermediate authorized API.
- `/os/customers` (Master Data OS) and `/sales/customers` (CRM Core) are two
  independent route trees over the identical `Customer` model and identical
  `CUSTOMERS_*` permissions; `/os/territories` (Master Data OS) and
  `/sales/territories` (CRM Core) are the same duplication over `Territory`.
  Not a permission-leakage bug (both trees require the same permission),
  but a real duplicated-UI/maintenance-burden finding.
- Two independent, identically-named `getFounderDashboard()` functions exist
  (`lib/founder-os/dashboard-service.ts` vs. `actions/inst-dashboards.ts`)
  computing different numbers under different permission gates.
- Three independent pipeline-value/conversion-rate calculations exist
  (`lib/opportunity/reporting.ts`, `actions/inst-opportunities.ts`,
  `lib/founder-os/kpi-engine.ts`).
- Two full, unsynced physical-stock ledgers coexist: the legacy
  `Warehouse`/`StockLedgerEntry`/`InventoryReservation`/`InventoryAllocation`
  family and the newer `EnterpriseWarehouseZone`/`Bin`/`Movement` family —
  see `warehouse-os`'s `knownIssues`.

No circular import was found across the 119 files in the 9 scanned Sales OS
`lib/*` directories (Part H, check 6) — the coupling above is real, but it
is one-directional dependency sprawl, not cyclic.

---

## Part C — Module Separation (Registry)

`lib/platform/module-registry.ts` defines 14 entries. This is a **governance
label over the existing tree**, not a physical move — every file listed
still lives exactly where it always has.

| Module | Status | Routes (top-level) |
|---|---|---|
| CRM Core (Sales OS) | ACTIVE | `/dashboard*`, `/sales/inquiries`, `/opportunities`, `/quotations`, `/commerce`, `/leads`, `/customers`, `/intelligence`, `/loyalty`, `/calendar`, `/assignments`, `/queues`, `/institutional`, `/support`, `/reports`, `/organization`, `/territories`, `/channels`, `/audit`, `/api/sales` |
| Founder OS | ACTIVE_FRAGMENTED | `/dashboard/founder` |
| Institutional Sales OS | ACTIVE | `/os/sales*` |
| Finance OS | ACTIVE | `/finance*`, `/os/finance*` |
| Warehouse OS | ACTIVE_FRAGMENTED | `/enterprise/warehouses` |
| Manufacturing OS | ACTIVE | `/enterprise*` (manufacturing/formulas/batches/quality/vendors/procurement/planning/reports), `/os/manufacturing*`, `/os/suppliers` |
| Network / Partner OS | ACTIVE | `/network*` |
| Customer Support OS | ACTIVE | `/os/support*` |
| Analytics OS | ACTIVE_FRAGMENTED | `/admin/analytics` |
| Marketing OS | NOT_YET_EXTRACTED | `/admin/marketing` |
| Sales AI Assistant | ACTIVE | `/sales/ai*` |
| Order Management OS | ACTIVE | `/os/orders*`, `/os/operations` |
| Master Data OS | ACTIVE_FRAGMENTED | `/os/customers`, `/os/employees`, `/os/masters`, `/os/territories` |
| Shared Platform Core | SHARED_CORE | (no routes — RBAC engine, audit log, both UI shells) |

`ModuleStatus` legend: **ACTIVE** = real, cohesive bounded context today.
**ACTIVE_FRAGMENTED** = real module, but split across disjoint surfaces or
duplicated logic (a genuine boundary problem, already documented per-module).
**NOT_YET_EXTRACTED** = the brief's target name doesn't map onto a
cohesive today; would need net-new assembly, not extraction.
**SHARED_CORE** = cross-module dependency, not a business module.

Full per-module summary, `dataModels`, `libPaths`, `actionFiles`,
`permissionPrefixes`, and every `knownIssues` entry are in
`lib/platform/module-registry.ts` itself — kept there rather than
duplicated here so the two can never silently drift apart.

---

## Part D — Route Audit

`scripts/verify-sales-os-block1.ts`'s `checkRouteOwnership()` snapshots
**93 known routes** across the 7 governed route trees (`app/dashboard`,
`app/sales`, `app/enterprise`, `app/finance`, `app/network`, `app/os`,
plus the two admin routes `/admin/analytics` and `/admin/marketing`) and
asserts each resolves, via longest-prefix-match, to **exactly one**
registered module or an explicit `FROZEN_OUT_OF_SCOPE` entry. Storefront,
CMS, checkout, product/admin-catalog routes, and the legacy Admin Overview
dashboard are declared `FROZEN_OUT_OF_SCOPE` with a stated reason each,
rather than silently ignored.

Result: **0 unowned routes, 0 multi-owned routes** (`verify:sales-os-block1`,
checks 3–4, both PASS). The 8 routes that were unowned mid-audit
(`/os/orders`, `/os/orders/direct`, `/os/orders/business`, `/os/operations`,
`/os/customers`, `/os/employees`, `/os/masters`, `/os/territories`) are now
assigned to the two newly-registered modules, Order Management OS and
Master Data OS, resolving the gap found during the audit rather than
suppressing the check.

`checkNavigationIntegrity()` additionally confirms every static
`href` in `lib/sales/navigation.ts` (26 entries) and the MUV OS shell's own
`components/os-shell/registry/navigation.ts` (34 entries) resolves to a real
`page.tsx` on disk, including through the three dynamic catch-all route
trees (`app/enterprise/[module]`, `app/finance/[entity]`,
`app/network/[entity]`) — no orphan nav entry, no broken link.

---

## Part E — RBAC Audit

**Owner / consumer model.** `lib/sales/authorization.ts`'s
`getSalesPrincipal()` is the single real authorization engine: it resolves
`session → User → SalesRole → flattened Set<PermissionKey>`, and is called
(directly, or via `requirePermission`/`requireAnyPermission`/`hasPermission`)
by every module above except Customer Support OS (`requireSupportPrincipal`)
and Manufacturing/Finance/Network OS's Enterprise-flagged routes
(`requireEnterprisePrincipal`) — both of which still wrap the identical
`getSalesPrincipal()` underneath, adding a feature-flag gate on top, not a
separate identity or permission model. `PERMISSIONS` in
`lib/sales/constants.ts` (287 keys) is the one flat registry every module
draws its keys from — there is no per-module permission namespace enforced
at the type level, only by prefix convention.

`isFounder` (`salesRole.name === SALES_ROLES.FOUNDER`, a single string
comparison) bypasses every permission check platform-wide. This is a single
well-known, intentional bypass, not permission leakage — but it means the
entire RBAC surface collapses to "is this user the Founder role" for that
one role, worth flagging explicitly since no other role has anything
resembling it.

**Duplicated permission-adjacent logic (leakage risk, not leakage today):**
`lib/muv-ai/security.ts` reimplements the identical
`isFounder || permissions.has(key)` check **by hand, independently, in at
least 6 places**, instead of calling `hasPermission`/`requirePermission`
from `lib/sales/authorization.ts`. It currently agrees with the shared
engine's behavior, but it is a second, independently-maintained copy of the
platform's most security-sensitive branch — any future change to Founder
resolution or permission semantics has to be made in both places or the two
silently diverge.

**Missing permission (found and already fixed this Block):**
`app/os/orders/direct/[id]/page.tsx` queried full order/address/coupon/
customer-with-notes/shipment data directly with **zero** permission check.
`/os/*` is not in `middleware.ts`'s matcher and `app/os/layout.tsx` only
checks session existence, so this was reachable by any authenticated user
of any role, including a plain `CUSTOMER`. Fixed in this Block (see
Part G) by requiring `PERMISSIONS.ORDER_MGMT_VIEW` — the same permission
the sibling list page (`app/os/orders/page.tsx`) already requires to link
here. No new permission invented, no workflow change.

**Dead permission keys:** `checkPermissionUsage()` (a live, re-runnable
detector, not a frozen snapshot) currently finds **50 of 287** `PERMISSIONS`
keys with no reference anywhere in `app/`, `actions/`, or `lib/` beyond
their own definition line in `constants.ts`. The exact set drifts as the
platform evolves by design — re-run `npm run verify:sales-os-block1` for
the current list rather than treating the number below as frozen:

```
DASHBOARD_ALL, LEADS_ASSIGN, CRM_UPDATE, QUOTATIONS_VIEW, QUOTATIONS_CREATE,
QUOTATIONS_APPROVE_STANDARD, QUOTATIONS_APPROVE_STRATEGIC, MEETINGS_MANAGE,
PARTNERS_APPROVE, PRICING_OVERRIDE, SALES_CHANNELS_VIEW, INQUIRIES_CREATE,
INQUIRIES_REASSIGN, OPPORTUNITY_CONFIG_MANAGE, QUOTATIONS_BULK,
QUOTATION_CONFIG_MANAGE, PRICING_POLICIES_MANAGE, REPORTS_QUOTATIONS,
WAREHOUSE_OPERATE, PAYMENTS_VOID, COMMERCE_BULK, COMMERCE_CONFIG_MANAGE,
REPORTS_COMMERCE, ANALYTICS_VIEW_ALL, ANALYTICS_VIEW_TEAM,
ANALYTICS_VIEW_ASSIGNED, ANALYTICS_VIEW_INSTITUTIONAL, ANALYTICS_VIEW_SUPPORT,
KPI_CONFIG_MANAGE, REPORT_CONFIG_MANAGE, AI_KNOWLEDGE_RETRIEVE,
AI_KNOWLEDGE_MANAGE, AI_WORKFLOWS_USE, AI_RECOMMENDATIONS_VIEW,
AI_AGENTS_MANAGE, AI_TOOLS_MANAGE, AI_USAGE_VIEW_OWN, AI_USAGE_VIEW_TEAM,
AI_USAGE_VIEW_ALL, AI_EXPORT, ENTERPRISE_PROCUREMENT_APPROVE,
ENTERPRISE_RFQ_MANAGE, ENTERPRISE_QUOTATION_EVALUATE, ENTERPRISE_RETURN_MANAGE,
ENTERPRISE_FORMULA_UPDATE_DRAFT, ENTERPRISE_BATCH_BLOCK, ENTERPRISE_BATCH_CLOSE,
ENTERPRISE_PLANNING_OVERRIDE, INST_TARGETS_MANAGE, SUPPORT_QA_REVIEW
```

A cluster worth noting: 10 of the 50 (`AI_KNOWLEDGE_RETRIEVE` through
`AI_EXPORT`) are the entire `AI_*` permission family — permission keys exist
for granular Sales AI Assistant access control, but `lib/muv-ai/security.ts`'s
hand-rolled checks (see above) never actually consult them.

**Duplicated permission usage (not dead, but two independent code paths
gated by the same key):** `CUSTOMERS_VIEW_ALL`/`CUSTOMERS_VIEW_ASSIGNED`/
`CUSTOMERS_MANAGE` gate both CRM Core's `/sales/customers` and Master Data
OS's `/os/customers`; `TERRITORIES_MANAGE` gates both CRM Core's
`/sales/territories` and Master Data OS's `/os/territories`; legacy
`SUPPORT_MANAGE` (CRM Core's assigned-customers queue) and the unrelated
`SUPPORT_TICKETS_*`/`SUPPORT_KB_*` namespace (Customer Support OS) coexist
by prior explicit design but read as related to anyone scanning permission
names alone.

**RBAC drift guard:** `checkRbacOwnership()` asserts every module's declared
`permissionPrefixes` matches at least one real `PERMISSIONS` key (catches a
module claiming a permission family that no longer exists) and that the
registry still has the expected order of magnitude of keys (catches a bulk
accidental deletion). Both PASS.

---

## Part F — Navigation Audit

Two independent navigation registries exist, each already scoped to its own
module set — this Block did not find cross-module navigation bleed:

- `lib/sales/navigation.ts` — `getSalesNavigation()`, 26 entries, each
  gated by an `any: [PermissionKey...]` array (Founder bypasses), a subset
  also gated by an `AiConfiguration`-backed feature flag. Drives the
  `/dashboard` and `/sales/*` shell (shared with CRM Core, Founder OS via
  `/dashboard/founder`, and the Sales AI Assistant via `/sales/ai/*`).
- `components/os-shell/registry/navigation.ts` — `getNavRegistry()`, 34
  entries, gated via `lib/os-shell/nav-permission-filter.ts`. Drives the
  separate "MUV OS" shell (`/os/*`) covering Institutional Sales OS,
  Finance OS, Manufacturing OS, Customer Support OS, Order Management OS,
  and Master Data OS.

Every static `href` in both registries resolves to a real `page.tsx`
(`checkNavigationIntegrity()`, Part H check 5, PASS) — no orphan page, no
dead link. No unrelated menu item was found mixed into either registry's
entries during the Part A/B research pass; the only navigation-adjacent
finding is structural, not a leak: Founder OS has **no unifying nav** at
all — it is reachable only by knowing 4 separate direct URLs
(`/dashboard/founder`, the `isFounder` branch inside `/os/sales`,
`/admin/analytics`, `/sales/reports`), none of which link to each other
(see `founder-os`'s `knownIssues`).

---

## Part G — Integrity Confirmation

No database schema change, no business-rule change, no workflow change, no
AI/gateway change, no notification/report/API change was made in this
Block. The full change set is additive plus one narrowly-scoped security
fix:

1. **`app/os/orders/direct/[id]/page.tsx`** — added a `requirePermission(PERMISSIONS.ORDER_MGMT_VIEW)`
   call as the first line of the page component. This is a **behavior
   restriction for previously-unauthorized access**, not a feature or
   workflow change: every user who could legitimately reach this page
   before (anyone with `ORDER_MGMT_VIEW`, the same permission the parent
   list page already required to link here) can still reach it, unchanged.
   Discovered mid-audit as a live PII-leak (any authenticated user,
   including a plain customer, could load any order's full address/
   invoice/customer-notes/shipment data); patched under explicit,
   narrowly-scoped Founder authorization rather than deferred or silently
   fixed, given the brief's general "do not begin Security" instruction.
2. **`components/os-shell/Header/CompanySwitcher.tsx`** — label changed
   from the literal string `"MUV"` to `"MUV Workspace"`, per Freeze
   Decision item 4. Still the same static, non-interactive `<div>` it
   always was (confirmed non-functional by the prior Company Switcher
   audit) — no switching behavior added, none removed.
3. **`lib/platform/module-registry.ts`, `scripts/verify-sales-os-block1.ts`,
   `package.json`'s new `verify:sales-os-block1` script** — net-new
   governance/test files. Nothing in the live request path imports the
   registry; the verify script is pure static analysis (`fs`-based source
   walking, no Prisma/DB import, no server dependency).
4. **This document** — net-new.

No file outside this list was modified. `git diff --stat` against the prior
commit is the authoritative proof of this claim at commit time.

---

## Part H — Permanent Verification Suite

`scripts/verify-sales-os-block1.ts` (`npm run verify:sales-os-block1`) —
pure static analysis, no database dependency, so it can run in CI on every
PR touching these trees without needing a live Neon connection. Checks:

1. **Module ownership** — no two modules declare the exact same route
   prefix; every module id unique.
2. **Route ownership** — every one of 93 known routes resolves to exactly
   one module or an explicit frozen-out-of-scope entry; no route resolves
   to more than one.
3. **RBAC ownership** — every module's declared permission-prefix matches
   a real `PERMISSIONS` key; the registry has the expected order of
   magnitude of keys (drift guard).
4. **Permission usage** — live dead-permission-key detector (informational,
   always re-runnable, never a frozen hardcoded list).
5. **Navigation integrity** — every static nav `href` in both registries
   resolves to a real `page.tsx` on disk.
6. **Circular dependency detection** — DFS cycle detection over the real
   `from "@/..."` import graph across 119 files in the 9 Sales OS `lib/*`
   directories.
7. **Shared service integrity** — every declared Shared Platform Core path
   exists on disk; `lib/sales/authorization.ts` still exports
   `getSalesPrincipal`/`requirePermission`/`requireAnyPermission`/
   `hasPermission`.
8. **Security-fix regression** — `app/os/orders/direct/[id]/page.tsx`
   still requires `ORDER_MGMT_VIEW` before querying the order.

Current result: **24 passed, 0 failed.**

---

## Recommendation for Block 2

Block 1 deliberately did not move a single file — it is the ownership map
Block 2's physical separation would need before it could safely begin. The
single largest determinant of Block 2's real difficulty is
`shared-platform-core`: 182 files across every module import
`lib/sales/authorization.ts`/`constants.ts` directly. Any physical
separation into independently-deployable modules needs those (plus
`lib/sales/audit.ts`, `lib/rbac.ts`, `lib/enterprise/context.ts`+
`governance.ts`, `components/enterprise-shell/EnterpriseShell.tsx`,
`components/os-shell/*`) formally promoted to a real, versioned shared
package first — otherwise every "independent" module keeps depending on
"Sales OS" internals regardless of which directory its files sit in.
Recommend Block 2 scope to: (a) get an explicit Founder decision on Network
OS / Order Management OS / Master Data OS's long-term placement, (b)
resolve the `actions/operations.ts` Order-Management/Warehouse coupling,
and (c) only then plan physical file relocation for the modules with the
fewest remaining shared-core touchpoints first (Network OS and Customer
Support OS are the best candidates — both already route through their own
principal wrappers rather than calling `lib/sales/authorization.ts`
directly for every check).
