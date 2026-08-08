# MUV Platform — Phase 10.0 — Sales OS Separation — Block 2

**Module Validation + AI Readiness + Cross-Module Integrity.** Builds
directly on Block 1 (commit `8761543`, frozen) without modifying it —
`lib/platform/module-registry.ts` is untouched by this Block. All new
governance data lives in `lib/platform/module-validation.ts`, verified by
`scripts/verify-sales-os-block2.ts` (`npm run verify:sales-os-block2`,
22/22 passing).

Every cross-module claim below is evidenced by a direct code trace (file
and line), not inferred from module summaries — four read-only research
passes traced the actual call chains for CRM→Finance→Warehouse→Dispatch,
Warehouse→Manufacturing→Procurement→Finance, Support→Customer→Orders→
Returns, Marketing→Reports, and Founder→Everything before any of Parts C/F/G
below were written. Several corrected assumptions this Block started with —
most notably that Founder OS aggregates across the whole platform. It
does not: it has zero read coverage of Warehouse, Manufacturing,
Institutional Sales, Customer Support, or Network OS today.

---

## Part A — Module Validation

Every one of the 14 Block-1-frozen modules now has a `PUBLIC_INTERFACES`
entry (`lib/platform/module-validation.ts`) declaring its entry points
(the files that are its only sanctioned way in) and its exit points
(evidenced calls it makes into another module, each with a file:line
citation). `verify:sales-os-block2` confirms every declared entry-point
file exists on disk and every exit point targets a real module or the
explicit `external` escape hatch.

**Two modules have thin-to-no declared exit points and no dedicated
action files of their own**, both already flagged in Block 1 and
re-confirmed here rather than newly discovered:

- **Network / Partner OS** — no `actions/*.ts` files of its own; its 13
  `lib/enterprise-network/*` files are called from wherever `/network/*`
  page components invoke them directly.
- **Marketing OS** — `actions/coupons.ts` is its only entry point, and
  (see Part C) its only real exit point is into Analytics OS's reporting,
  not into any Customer/segmentation code.

No module was found to have undocumented inbound access (code reaching
into a module's data without going through its declared entry points) —
`hasUndocumentedInboundAccess` is `false` for all 14.

---

## Part B — Boundary Validation

`checkBoundaryValidation()` runs two checks Block 1 did not: duplicate
`actionFiles` ownership and duplicate `libPaths` ownership across non-shared
modules.

**No duplicate `libPaths`** were found among the 13 non-shared modules
(Shared Platform Core's overlap with `manufacturing-os`'s
`lib/enterprise/context.ts`/`governance.ts` and `crm-core`'s
`lib/sales/authorization.ts`/`audit.ts`/`constants.ts` is intentional by
design — those are exactly the files Block 1 identified as needing
promotion to Shared Platform Core, not a boundary violation).

**Three `actionFiles` are genuinely shared** between two non-shared
modules — each is documented in this Block's own
`DOCUMENTED_SHARED_ACTION_FILES` record (kept in
`module-validation.ts`, not in the frozen registry's `knownIssues`, since
that file cannot be edited this Block):

1. `actions/enterprise.ts` — Warehouse OS + Manufacturing OS (Block 1 finding, unchanged).
2. `actions/operations.ts` — Warehouse OS + Order Management OS (Block 1 finding, unchanged).
3. **`actions/territories.ts` — Block 2 finding, newly discovered.** The
   frozen registry attributes this file to `crm-core`, but grep evidence
   finds it imported only from `/os/*` pages (`app/os/territories`,
   `app/os/customers/*`, `app/os/employees/[id]`,
   `app/os/sales/leads/new`, `components/os-territories/
   TerritoryCreateForm.tsx`) — never from any `/sales/*` page.
   `/sales/territories/page.tsx` reads `Territory` via a direct
   `prisma.territory.findMany` call with no action-file import at all.
   This is most likely a minor mis-attribution in the frozen Block 1
   registry (CRM Core's real territory-mutation entry point is more
   likely `actions/sales-organization.ts`'s own `createTerritory`, per
   Block 1's already-documented "two independent `createTerritory`
   implementations" finding) rather than a real shared-ownership
   situation. Flagged for a future registry-maintenance correction —
   **not corrected now**, since `module-registry.ts` is frozen for this
   Block.

---

## Part C — Cross-Module Integrity

Six business flows were traced end to end against real code, not assumed.
Full step-by-step evidence is in `CROSS_MODULE_FLOWS`
(`lib/platform/module-validation.ts`); the headline findings:

**CRM: Quotation → Order → Finance → Warehouse → Dispatch** — three of
four links are gaps, not automated chains:
- CRM Core's own `Quotation` acceptance (`actions/quotations.ts`) **never
  creates an Order** — only the separate Institutional Quotation pipeline
  is wired to order creation. Plausibly intentional (a D2C lead completes
  their own purchase via checkout) but undocumented as intentional
  anywhere in the code — flagged for Founder confirmation.
- Order → Finance only fires **on delivery**, not creation:
  `deliverBusinessOrder` posts a GL journal after DISPATCHED→DELIVERED.
  Between creation and delivery, Finance OS has no record of the order at all.
- Order → Warehouse inventory reservation is a **manual UI button click**
  (`components/os-orders/InventoryCheckPanel.tsx`), never automatic on
  order confirmation — consistent with Milestone 5's own documented
  human-worked-queue design.
- BusinessOrder dispatch **never creates a `Shipment` row** — that model
  is D2C-`Order`-only; BusinessOrder dispatch just writes plain
  `carrierName`/`trackingReference` strings onto itself, with no
  structured shipment-event timeline.

**Institutional: Quotation → Approval → Order → Delivery** — the one flow
in the whole audit that is a real, atomic, transactional `DIRECT_CALL`:
`acceptQuotation` flips the linked `Opportunity` to `WON` and calls
`createBusinessOrderCore` inside the same `prisma.$transaction`.

**Warehouse: Inventory → Manufacturing → Procurement → Finance** —
Manufacturing→Warehouse is a deliberate two-step manual gate (QC release
via `recordQualityDecision`, then a separate `transferReleasedBatchToInventory`
call); Procurement→Warehouse is correctly atomic (`receiveGoods` writes
inline in one transaction); **Procurement→Finance only produces a generic
GL journal, never a `FinanceVendorBill`** — an actual payable requires a
Finance user to manually re-enter the supplier's invoice, with no
automatic PO/Goods-Receipt→Vendor-Bill trigger.

**Support: Customer → Orders → Returns → Resolution** — Support→Customer
is correctly validated; **Support→Order is the weak link**: `SupportTicket.orderId`
is stored unvalidated, and `SupportReturnRequest` creation/approval never
checks order eligibility or updates order status at all. Refund
*execution*, by contrast, is fully and correctly wired end-to-end through
`actions/orders.ts` → `actions/payments.ts` → Razorpay.

**Marketing: Customers → Campaign → Reports** — corrects an initial
assumption of this Block: Marketing→Customer segmentation is genuinely
`NOT_CONNECTED` (zero references to Coupon anywhere in `lib/growth/*`),
but **Marketing→Reports is actually connected** — `getCouponPerformance()`
in `lib/analytics.ts` (under an explicit `// Marketing Intelligence`
section) computes per-coupon orders/discount/revenue, consumed by
`/admin/analytics`. Reporting exists; it just lives in Analytics OS, not
a dedicated Marketing service, and is scoped to individual coupon codes
rather than a "campaign" concept.

**Founder: Everything** — the most significant correction to this
Block's starting assumptions. Founder OS's `kpi-engine.ts` and
`dashboard-service.ts` have **zero references** to Warehouse OS,
Manufacturing OS, Institutional Sales OS, Customer Support OS, or
Network OS. Its only real cross-module reads are CRM Core (direct Prisma,
bypassing `lib/opportunity/reporting.ts`) and Finance OS (mostly correctly
delegated through `ar-service.ts`/`ap-service.ts`/`banking-service.ts`,
except one direct-Prisma expense-claim query). "Founder → Everything" is
not yet true of the actual code — five real modules, including
Institutional Sales, a major revenue pipeline, are currently invisible to
the Founder dashboard.

---

## Part D — Shared Platform Core (Migration Plan Only)

`SHARED_PLATFORM_CORE_PLAN` (`lib/platform/module-validation.ts`)
classifies every current Shared Platform Core / near-shared path into one
of three dispositions — **no relocation performed**, per this Part's
explicit instruction:

| Disposition | Paths |
|---|---|
| **ISOLATE_AS_OWN_PACKAGE** | `lib/sales/authorization.ts`, `lib/sales/constants.ts`, `lib/sales/audit.ts`, `lib/enterprise/context.ts`, `lib/enterprise/governance.ts` — the 182-file-fan-in core (Block 1 finding). Recommend promoting to a versioned internal package (e.g. `@muv/authz`) so every module depends on a stable contract instead of a sibling module's directory. `context.ts`/`governance.ts` currently sit inside Manufacturing OS's own `lib/enterprise/` directory despite being genuinely shared infrastructure — worth moving with the rest of the package. |
| **KEEP_SHARED** | `lib/rbac.ts` (a smaller, stable, already-minimal axis), `components/enterprise-shell/EnterpriseShell.tsx` and `components/os-shell` (already generic, prop-driven, no module logic baked in — correctly shared as-is). |
| **MOVE_INTO_MODULE** | `lib/sales/navigation.ts` (module-specific nav data wrapped in one file only because several modules share one route tree today — splitting it now would itself be the "massive relocation" this Part forbids; correct to leave alone until physical route separation happens). `lib/muv-ai/security.ts` — explicitly flagged as **the wrong direction of sharing**: it should be deleted in favor of calling the real shared authorization module, not promoted. Recorded here so a future block doesn't accidentally "promote" a duplicate instead of removing it. |

---

## Part E — AI Readiness Matrix

**No provider calls, no prompt changes, no Gateway changes** — verified
mechanically by `checkAiReadiness()`'s forbidden-term scan of the
readiness data itself. `AI_READINESS_MATRIX` (`lib/platform/module-
validation.ts`) gives every one of the 14 modules a profile: future AI
owner, permission prefix, proposed entry point, service interface, tool
namespace, security requirement, observability requirement, and grounding
source.

**The load-bearing decision**: every module's `futureSecurityRequirement`
mandates calling `hasPermission()`/`requirePermission()`/
`requireAnyPermission()` from the existing `lib/sales/authorization.ts` —
explicitly **not** re-implementing the check locally. This directly
targets `lib/muv-ai/security.ts`'s already-known anti-pattern (6+
hand-rolled copies of the Founder-bypass check, Block 1 finding) so it
cannot spread to any new module's AI surface. Every module's
`futureObservabilityRequirement` mandates appending to the existing
`SalesAuditLog` via `lib/sales/audit.ts` rather than a new/parallel log.

Two modules cannot yet meet the standard: **Analytics OS** has no
`SalesPermission` family of its own (gated only by site-wide
`ADMIN`/`STAFF`) — introducing one is recorded as a Block 3 prerequisite,
not a Block 2 action. **Marketing OS** has no real module to make AI-ready
yet (still just Coupon CRUD, per Block 1) — its profile is `N/A` throughout
by design, not an oversight.

**Founder OS's own AI readiness carries an explicit warning**: since it
is the one module whose purpose is cross-module aggregation, its proposed
AI entry point is required to call each target module's own service/
reporting layer — never a Founder-OS-local re-implementation — directly
addressing the `kpi-engine.ts` duplication found in Part C/F.

---

## Part F — Data Flow Validation

`DATA_FLOWS` (`lib/platform/module-validation.ts`) tracks all 12
brief-named entities with producer/consumer/owner/duplication/dead-flow/
missing-validation. Full detail is in the data file; the findings that
sharpen or correct Block 1:

- **Orders**: missing validation confirmed concretely — order confirmation
  neither reserves Warehouse inventory automatically nor creates a Finance
  AR record until delivery (see Part C).
- **Inventory**: the two-ledger split (Block 1 finding) is compounded by a
  now-confirmed dead flow — `EnterpriseWarehouseMovement` has no confirmed
  reader outside its own writers; Founder OS confirmed not to read it.
- **Payments**: confirmed dead flow — Finance OS's only automatic touch on
  an order's payment lifecycle is the post-delivery GL posting; it never
  reads or reconciles `Order.paymentStatus`/`CommercePayment` at any
  earlier point.
- **Manufacturing**: missing validation is on the Finance side, not
  Manufacturing's own — goods receipt auto-posts a GL journal but never a
  vendor bill (see Part C).
- **Territories**: compounds Block 1's "two independent `createTerritory`
  implementations" finding with the Part B discovery that
  `actions/territories.ts`'s registry attribution may not match its real
  usage.

No entity was found with a fully dead flow (produced but never consumed
by anything) — every entity's stated consumers were confirmed by code
evidence during the Part C trace, not assumed.

---

## Part G — Integration Validation

Every integration named in the brief was traced concretely in Part C; the
summary judgment per integration:

| Integration | Verdict |
|---|---|
| Finance ↔ Order Management | Real but incomplete — delivery-triggered GL posting only, no AR during the order's open lifetime. |
| Finance ↔ Manufacturing/Procurement | Real but incomplete — GL journal auto-posts, AP (vendor bill) does not. |
| Warehouse ↔ Manufacturing | Real, correctly atomic for goods receipt; a deliberate manual gate for finished-goods transfer. |
| Institutional ↔ Order Management | Real and correctly atomic — the one fully-automated Quotation→Order chain found. |
| CRM ↔ Order Management | **Not connected** — CRM Core's own Quotation never creates an order (flagged for Founder confirmation of intent). |
| Support ↔ Order Management | Partial — refund execution is real and correct; return eligibility/order-status linkage does not exist. |
| Marketing ↔ Analytics | Real — coupon performance reporting exists, just inside `lib/analytics.ts`. |
| Marketing ↔ CRM (segmentation) | Not connected — no code path exists at all. |
| Founder ↔ everything else | Partial — CRM Core and Finance OS only; Warehouse, Manufacturing, Institutional, Support, Network are all currently unread. |

No duplicated business logic beyond what Block 1 already found (the three
independent pipeline-value calculations, the two invoice systems) was
newly discovered in these traces. No hidden dependency was found that
isn't now listed in a module's `exitPoints`.

---

## Part H — Permanent Tests

`scripts/verify-sales-os-block2.ts` (`npm run verify:sales-os-block2`) —
same pure-static-analysis philosophy as Block 1's suite, layered on top
of it without modifying it. Checks:

1. **Module validation** — every module has a `PUBLIC_INTERFACES` entry; every declared entry-point file exists on disk.
2. **Boundary validation** — every exit point targets a real module or `external`; no undocumented duplicate `actionFiles`/`libPaths` ownership across non-shared modules.
3. **Cross-module integrity** — every flow step references real modules, a valid classification, and cites non-pending evidence; all 6 brief-named flows are present.
4. **Shared Platform Core report** — every planned path exists on disk with a valid disposition.
5. **AI readiness** — every module has a profile; no live provider/Gateway reference anywhere in the readiness data (mechanically enforces "extension points only"); every profile field is populated.
6. **Data flow validation** — every producer/owner/consumer is a real module id; all 12 brief-named entities are tracked.
7. **Technical debt** — every item has a valid severity and references real modules; at least one CRITICAL item exists (a sanity check against under-scoping).
8. **Dependency graph** — no import cycle across the full `lib/` tree (384 files) — broader than Block 1's 9-directory scan, per this Block's platform-wide coupling audit.
9. **Freeze regression** — the Block 1 module list is unchanged; `organizationKey`/`ENTERPRISE_ORGANIZATION` is still hardcoded `"MUV"`; `CompanySwitcher` still renders `"MUV Workspace"` and is still non-interactive; the Block 1 security fix still holds.

Current result: **22 passed, 0 failed.**

---

## Part I — Technical Debt (Ranked)

Full list with module attribution in `TECHNICAL_DEBT`
(`lib/platform/module-validation.ts`); summary by severity:

**CRITICAL (1)** — `lib/muv-ai/security.ts`'s 6+ independent
re-implementations of the Founder-bypass check (Block 1 finding,
unchanged — still the single highest-risk item because it's security
logic, not business logic).

**HIGH (5)** — two full unsynced warehouse ledgers; `actions/operations.ts`
undivided between Order Management and Warehouse OS; Founder OS's
`kpi-engine.ts` duplicating CRM Core's pipeline query *without* the scope
filter the original applies (new, Block 2); Founder OS's zero coverage of
five real modules (new, Block 2); Goods Receipt auto-posting a GL journal
but never a vendor bill (new, Block 2).

**MEDIUM (7)** — duplicate `createTerritory` implementations; duplicated
`/os/customers` vs `/sales/customers` and `/os/territories` vs
`/sales/territories` route trees; two unconnected payment/invoice
systems; Analytics OS's missing permission family; CRM Core's Quotation
never creating an Order (new, Block 2); Support return requests never
validating order eligibility (new, Block 2); `SupportTicket.orderId`
stored unvalidated (new, Block 2); BusinessOrder dispatch never creating a
`Shipment` row (new, Block 2); no Finance record for an order before
delivery (new, Block 2).

**LOW (3)** — 50 dead `PERMISSIONS` keys; Founder OS's 4-URL navigation
fragmentation; the `actions/territories.ts` registry-attribution
discrepancy (new, Block 2).

---

## Recommendation for Block 3

Block 2 found the platform's cross-module "seams" are mostly manual
checkpoints or missing links, not hidden automatic couplings — a
healthier finding than it might sound, since manual gates are safer to
formalize than silent automation is to untangle. Recommend Block 3 scope
to: (1) get explicit Founder rulings on the three flagged "is this
intentional?" gaps (CRM Quotation not auto-creating an Order, the
Goods-Receipt-to-Vendor-Bill gap, and BusinessOrder's missing Shipment
integration) before touching any of them; (2) fix the one CRITICAL item
(`lib/muv-ai/security.ts`) as the first real test of the AI Readiness
Matrix's security requirement, since Customer Support OS is already the
concrete example of the pattern it's meant to prevent; (3) begin the
Shared Platform Core package isolation named in Part D, since every
module's AI readiness work in Part E depends on that contract being
stable before any real tool-building starts.
