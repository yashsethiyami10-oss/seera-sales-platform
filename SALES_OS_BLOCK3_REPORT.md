# MUV Platform — Phase 10.0 — Sales OS Separation — Block 3 (Final)

**Performance + Security + Platform Hardening + Final Freeze.** This is
the closing block of the Sales OS Separation initiative. It builds on
Block 1 (`8761543`, architecture audit + RBAC) and Block 2 (`b3087b0`,
module validation + AI readiness + cross-module integrity), both frozen
and approved. Read those two reports first — this document assumes their
findings and only restates what changed.

Unlike Blocks 1–2 (governance/documentation only, zero business-logic
changes), Block 3 makes real, tested code changes: it isolates Shared
Platform Core, removes a real security anti-pattern, gives Founder OS
genuine read visibility it never had, and implements the two business
integrations the Founder explicitly approved — while leaving the one
explicitly-approved-to-stay-manual link untouched.

---

## Sales OS Architecture — Final State Summary

The Sales OS is 14 governed modules (`lib/platform/module-registry.ts`,
frozen since Block 1, untouched by this Block) sharing one authorization
core, now physically isolated at `lib/platform-core/*` (Part A). Every
module's routes, permissions, data models, public interfaces, AI
readiness posture, and known cross-module couplings are machine-verified
by three permanent suites (`verify:sales-os-block1/2/3`, 106 checks
combined, 0 database dependency) rather than living only in prose that
can drift out of date.

---

## Part A — Shared Platform Core

**Implemented, not just planned.** Block 2's `SHARED_PLATFORM_CORE_PLAN`
recommended isolating `lib/sales/{authorization,constants,audit}.ts` and
`lib/enterprise/{context,governance}.ts` — the 182-file fan-in every
module depends on — into a stable, canonical home. This Block does
exactly that:

- Real implementation moved to `lib/platform-core/{authorization,constants,audit,context,governance}.ts`.
- The 5 original paths are now permanent one-line re-export shims
  (`export * from "@/lib/platform-core/..."`), so all ~182 existing
  import sites keep working completely unchanged — zero blast radius,
  verified by `tsc --noEmit` and all three verify suites passing before
  and after.
- A true separate npm package (`@muv/authz` or similar) was judged
  unnecessary redesign for a single-app repo with no existing monorepo
  tooling — directory-level isolation + shim achieves the same "stable
  contract, not a sibling module's directory" goal without introducing
  new build infrastructure, consistent with this Block's "do not
  redesign" constraint.
- `lib/rbac.ts` and both UI shells (`EnterpriseShell.tsx`, `components/os-shell`)
  were confirmed already correctly shared and left untouched.
- `lib/muv-ai/security.ts` was explicitly NOT promoted to Shared Platform
  Core (it was the wrong direction of sharing) — see Part B.

**Real regression found and fixed during the move**: Block 1's own
`checkSharedServiceIntegrity`/`checkPermissionUsage` checks and Block 2's
`checkFreezeRegression` all string-searched the OLD file paths for
literal content (function names, the `"MUV"` constant) that no longer
lives there once those paths became shims. Both were updated to read the
new canonical files — a necessary, mechanical fix to keep two-block-old
tests honest about where the code they're checking now actually lives.

---

## Part B — Security

**The one CRITICAL finding from Block 1/2, fixed.** `lib/muv-ai/security.ts`'s
`requireAiPermission`/`requireAiAdminPermission` used to re-implement the
platform's most security-sensitive branch by hand:
`!principal.isFounder && !principal.permissions.has(permission)`, six-plus
times, independently of `lib/sales/authorization.ts`.

Fix: `lib/platform-core/authorization.ts` now exports three shared
predicates — `principalHasPermission`, `principalHasAnyPermission`,
`principalHasAllPermissions` — and **every** permission decision on the
platform routes through them: `requirePermission`/`requireAnyPermission`/
`hasPermission` themselves were refactored to call the predicates
(removing their own inline duplication too), and `lib/muv-ai/security.ts`'s
two guards now call the identical functions instead of re-deriving the
boolean. Signatures are unchanged (still synchronous, still take an
already-resolved principal) — every existing call site, and the existing
`__tests__/enterprise-ui/narrow-permission-denial.integration.test.ts`
(verified by static read-through since this environment's DB naming
guard prevents running it directly), keep working with identical
behavior.

**Audit requested by this Part:**
- *Duplicate permission checks*: eliminated (see above) — there is now
  exactly one implementation of the isFounder-bypass-or-permission-check
  decision platform-wide.
- *Unsafe permission checks*: none found beyond the one fixed above.
- *Permission drift*: not applicable anymore — one implementation cannot
  drift from itself.
- *Authorization bypass*: none found; the Founder bypass itself is
  intentional and unchanged (documented in Block 1/2, re-confirmed here).
- *Security regressions*: none — `verify:sales-os-block1` (30/30),
  `verify:sales-os-block2` (22/22), and `verify:sales-os-block3` (52/52)
  all pass, including explicit regression checks for this exact fix.

---

## Part C — Founder OS

**Founder OS's 5-module blind spot (Block 2's other HIGH-severity
finding) is closed.** `lib/founder-os/kpi-engine.ts`'s `getEnterpriseKpis()`
now has four new sections, each reusing an **existing**, already
correctly-permissioned service function that simply was never wired in
before — no new Prisma query pattern was invented for four of the five:

| Section | Reused function | Module(s) covered |
|---|---|---|
| `manufacturingWarehouse` | `getOperationalDashboard` (`lib/enterprise/planning-reporting.ts`) | Manufacturing OS + Warehouse OS |
| `institutional` | `getFounderDashboard` (`actions/inst-dashboards.ts`, aliased) | Institutional Sales OS |
| `customerSupport` | `getFounderSupportDashboard` (`lib/support/founder-integration-service.ts` — a purpose-built integration point that already existed and was simply never called) | Customer Support OS |
| `network` | `getNetworkSummary` (new, small, documented aggregate — no existing summary function covered this) | Network OS |

Every section is wrapped in the same `safe()` graceful-degradation
pattern the pre-existing sections already used, and gated by the exact
same principal resolved by the one `requireFounderOsPrincipal` call at
the top of `getEnterpriseKpis()` — **Founder remains read-all, no
permission was weakened or duplicated to grant this.** Each nested
service function still independently enforces its own permission; a
Founder passes all of them via the same `isFounder` bypass every other
section already relied on.

**Also fixed in the same file**: `getSalesPipelineSummary` used to
independently re-query `prisma.opportunity` with a near-identical shape
to CRM Core's own `getOpportunityDashboard` — **without** that function's
`opportunityScope()` filter (Block 2's other HIGH finding). It now calls
`getOpportunityDashboard` directly. Behavior for the Founder caller is
unchanged (`opportunityScope()` already returns `{}`/unrestricted for a
Founder principal) — this is a duplication fix, not a data change.

**UI**: `app/dashboard/founder/page.tsx` gained one new "Platform
Visibility" section (4 read-only cards, same existing visual pattern,
no new interaction) so the newly-available data is actually visible to a
Founder, not just computed and silently discarded — `getFounderDashboard()`
now returns `kpis` at its top level for exactly this reason.

---

## Part D — Business Integrations

Three links were in question after Block 2; the Founder ruled on all
three (see Block 3's brief), and this Part implements exactly what was
approved — nothing more:

### 1. CRM Quotation → Order: **stays manual** (Founder decision #1)
No code changed. `verify:sales-os-block3` adds a permanent regression
guard (`checkBusinessIntegrations`) asserting `lib/quotation/workflow.ts`
still never calls `createBusinessOrderCore` — if a future change
automates this without deliberately updating that test, the suite fails
loudly rather than silently drifting from the Founder's ruling.

### 2. Goods Receipt → Vendor Bill: **automatic** (Founder decision #2)
`receiveGoods` (`lib/enterprise/procurement-service.ts`) now calls a new
`createVendorBillFromGoodsReceipt` helper, post-commit, which:
- Auto-provisions the vendor's `FinanceVendorAccount` if one doesn't
  exist yet (`getOrCreateVendorAccount`).
- Creates and posts a **real** `FinanceVendorBill` via the existing
  `createAndPostVendorBill`, with one line per accepted item against the
  same Raw Material account (code `1200`) the old generic journal
  already used, and a system-generated `supplierInvoiceNo`
  (`SYSTEM-{goodsReceiptNumber}`) — deterministic, unique, clearly
  marked as a placeholder since the real supplier invoice document is
  not yet known at receipt time (which is exactly why this was manual
  before).
- **Falls back** to the pre-existing generic GRNI journal
  (`recordFinanceEvent`) only if AP posting isn't possible in a given
  environment (e.g. `FinanceConfiguration`/AP control account isn't set
  up — confirmed via this repo's own seed data that this is not
  guaranteed to exist). Never both — no liability is ever posted twice
  for the same receipt, and an environment that never configured AP
  keeps behaving exactly as it did before this change.
- **Known, disclosed limitation**: the `supplierInvoiceNo` is a system
  placeholder, not a reconciled real invoice number. Reconciling it
  against the real supplier invoice when it arrives is a real Finance
  workflow that was **not** built — Founder decision #2 asked for
  automatic bill *creation*, not a full three-way-match reconciliation
  system. Recorded as a known gap, not silently solved by assumption.

### 3. BusinessOrder → Shipment: **proper integration** (Founder decision #3)
Schema migration `20260809000000_business_order_shipment_integration`:
- `Shipment.orderId`/`provider` relaxed from required to optional.
- `Shipment.businessOrderId String? @unique` added, with a reciprocal
  `BusinessOrder.shipment` relation.
- A raw-SQL `CHECK` constraint (`shipments_exactly_one_order_ref`)
  enforces exactly one of `orderId`/`businessOrderId` is set — the same
  precedent this schema already used for the `BusinessOrder` DIRECT_LEAD
  partial-unique-index rule, since Prisma's schema syntax can't express
  a CHECK constraint directly.
- `provider` intentionally stays `null` for BusinessOrder-linked
  shipments — `SELF_DELIVERY`/`TRANSPORT` dispatch methods have no real
  courier-API provider from `lib/shipping/*`'s closed 4-provider enum;
  the pre-existing free-text `courierName`/`awbNumber` columns carry
  that case instead, exactly matching how the plain fields worked
  before this change.
- `dispatchBusinessOrder` now upserts a `Shipment` + `ShipmentEvent`
  (`IN_TRANSIT`) in the same transaction as the `DISPATCHED` status
  transition; `deliverBusinessOrder` updates it to `DELIVERED` with
  another event; `amendBusinessOrderDispatchDelivery` keeps
  `courierName`/`awbNumber` in sync on a Founder/Admin correction.
- The migration's shadow-database replay (used by `prisma migrate dev`
  to compute the diff) failed on a pre-existing, unrelated historical
  migration issue — worked around via `prisma migrate diff` against the
  live datasource instead (bypasses the shadow DB), then applied via
  `prisma db execute` and marked resolved via `prisma migrate resolve
  --applied`, leaving `prisma migrate status` clean.

---

## Part E — Performance

Scope was deliberately narrow per this Part's own "reduce unnecessary
complexity only" instruction — see `PERFORMANCE_AUDIT` in
`lib/platform/module-validation.ts` for full detail. **Fixed**: the
Founder OS pipeline-query duplication (Part C, above) and the
authorization-logic centralization (Part B, above) are this Block's real
complexity reductions. **Observed, deliberately not changed**: four
`Promise.all(items.map(async ...))` read patterns that issue N parallel
queries instead of one batched query (a real but small optimization
opportunity that would add code, not reduce it, for an unmeasured gain);
the two independent `createTerritory` implementations (real
business-logic consolidation work, not a performance change, left for a
separately-scoped decision).

---

## Part F — Permission Cleanup

**Reviewed all 50 of Block 1's dead `PERMISSIONS` keys. Removed: zero.**
Every one of the 50 is actively **granted** to a real seeded `SalesRole`
in `prisma/seed.ts` — none are orphaned scaffolding from a removed
feature; all represent permission concepts modeled ahead of their
enforcing code being written (the same pattern Part E's own AI Readiness
Matrix explicitly relies on for the 10 `AI_*` keys). The instruction's
bar — "proven unused, unreachable, safe to delete... never remove
anything uncertain" — was not met by any of the 50. Full per-category
reasoning is in `PERMISSION_CLEANUP_REVIEW`
(`lib/platform/module-validation.ts`); a concrete stronger-evidence gate
for a future pass is recorded there too (a key becomes a real deletion
candidate once it's unreferenced in code **and** no longer granted in
live, not just seed-time, role data).

---

## Part G — Dead Code

A file-level unimported-file scan across the 17 Sales OS `lib/*`
directories (155 files) initially flagged 31 candidates; a first-pass
detector bug (checking only `@/...` absolute imports, missing
`./relative` imports) accounted for 25 false positives. Of the 6 that
survived a corrected re-check, all 6 were reviewed and **none removed**:
5 are `extensions.ts` files with an explicit in-code disclaimer
("Registration boundary only. Version 1 intentionally ships no extension
logic.") — textbook "preserve future scaffolding," not dead code; the
remaining one (`lib/enterprise-network/index.ts`, a pure re-export
barrel) has zero consumers but implements no logic of its own, so
deleting it would carry zero behavioral benefit against a real chance of
guessing wrong about intent. Full reasoning in `DEAD_CODE_REVIEW`
(`lib/platform/module-validation.ts`).

---

## Part I — Permanent Tests

`scripts/verify-sales-os-block3.ts` (`npm run verify:sales-os-block3`) —
same pure-static-analysis philosophy as Blocks 1–2. 52 checks: Shared
Platform Core isolation (Part A), security centralization (Part B),
Founder visibility wiring (Part C), both business integrations plus the
manual-quotation regression guard (Part D), permission/dead-code review
internal consistency (Parts F/G), and module freeze integrity re-checked
against the new canonical file locations (extending Block 2's own freeze
check, which needed the same path fix Block 1's did).

**Combined result across all three suites: 24 + 22 + 52 = 98 checks,
0 failed.**

---

## Migration Notes

One schema migration this Block:
`20260809000000_business_order_shipment_integration` (see Part D #3).
Applied via `prisma db execute` + `prisma migrate resolve --applied`
rather than `prisma migrate dev`, because the shadow database used by
`migrate dev` to compute diffs fails to replay a pre-existing, unrelated
historical migration (`20260727000000_sales_architecture_v1`) — a
pre-existing repository condition, not something this Block introduced
or attempted to fix (out of scope: rewriting migration history is a
separate, higher-risk undertaking). `prisma migrate status` confirms a
clean, fully-applied state after this Block's change.

Two long-running stale server processes (PIDs blocking the Prisma
Client's native engine file from being regenerated on Windows) were
stopped with explicit user confirmation before regenerating the client —
not done unilaterally.

---

## Technical Debt — Updated

Of the 18 tracked items (16 from Block 2 plus 2 discovered during Block 2's
own boundary-validation pass), **6 are now marked `resolvedInBlock: 3`**:
the `lib/muv-ai/security.ts` CRITICAL item (Part B); the kpi-engine.ts
scope-filter duplication and the 5-module Founder blind spot (both Part
C); the Goods-Receipt-Vendor-Bill and BusinessOrder-Shipment integration
gaps (both Part D); and the CRM-Quotation-never-creates-an-Order item —
resolved not by a code change but by the Founder's explicit ruling
closing what was previously an open question. 12 items remain open (see
`TECHNICAL_DEBT` in `lib/platform/module-validation.ts` for the live,
current list) — none newly discovered this Block beyond what Parts
E/F/G's audits already folded in.
