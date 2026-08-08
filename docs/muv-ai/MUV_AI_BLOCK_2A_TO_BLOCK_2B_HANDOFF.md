# MUV AI Intelligence Reconciliation & Population — Block 2A → Block 2B Handoff

**Prepared:** 2026-08-07
**Status:** Block 2A complete, frozen, committed. Block 2B not started.

This document is self-contained. A new Claude account/session should be able to pick up Block 2B using only this file, without needing the prior conversation history.

---

## 1. Project Identity

| Item | Value |
|---|---|
| Project root | `C:\Users\KE\muv-platform-deployment-package` |
| Git branch | `main` |
| Block 2A commit SHA | `ff394b6a5312d1956209b461fdc574312bed78ba` |
| Approved UAT database hostname | `ep-falling-heart-azsxzcob-pooler` (load explicitly from `.env.local`) |
| Prohibited database hostnames | `ep-red-surf` (loaded via plain `.env` — production-shaped), any production database, any Vercel production environment, any other hosted environment |
| Local application URL | `http://localhost:3002` |
| Node version | v24.19.0 |
| npm version | 11.17.0 |

**Database safety rule, verbatim from every prior block in this series and still binding:** before any database-touching operation, resolve `DATABASE_URL` and assert its hostname contains `ep-falling-heart`. Refuse and stop otherwise. Plain `tsx`/Node scripts resolve `.env` by default, not `.env.local` — force `.env.local` explicitly or use the existing Vitest harness pattern (see `__tests__/knowledge-reconciliation/mapper.test.ts` for the exact guard to copy).

---

## 2. Frozen Architecture

The authoritative MUV AI customer-answer process — do not redesign, do not bypass:

```
Question
  ↓
Authentication / Authorization
  ↓
Intent + Context + Sentiment Understanding
  ↓
KnowledgeItem
  ↓
ProductIntelligence
  ↓
ProblemIntelligence
  ↓
CareIntelligence
  ↓
Decision Intelligence
  ↓
Governance Validation
  ↓
Founder Policy Check
  ↓
Response Validation
  ↓
Customer Response
  ↓
Audit + Observability
```

Binding rules:

- **All four intelligence layers — `KnowledgeItem`, `ProductIntelligence`, `ProblemIntelligence`, `CareIntelligence` — are mandatory.** No substantive customer answer may bypass them. This decision is frozen as of Block 1/2C and is not reopened by Block 2B.
- **`PublishedKnowledgeRecord` is a source/publication/version layer only** — governed publication evidence, a reconciliation input. It is never the final runtime answer authority. All 1,043 real rows in this table today are `accessLayer: INTERNAL`; none are `PUBLIC`.
- **Raw `Product`/`ProductVariant`/`ProductContent` data cannot bypass the intelligence layers** to become a direct final customer-answer shortcut. They are approved source systems, usable by the reconciliation mapper and by approved Dispatcher tools, never a substitute for the four layers above.
- **Dynamic commercial facts (price, MRP, stock, availability) are never frozen as intelligence facts.** They are resolved only through the governed Dispatcher path: `ProductIntelligence` stores identity/reference + tool-resolution metadata only → Dispatcher → `commerce.getPricing`/`commerce.getAvailability` → current live data. No intelligence table may ever store a price/MRP/stock value.

---

## 3. Completed Work

| Block | Deliverable | Status |
|---|---|---|
| Block 1 | Intelligence Reconciliation & Population — mapping/design report (field-level source precedence manifest, 4-layer mapping design, gap register) | Complete |
| Block 2C | Founder governance decisions, source approval, customer-safe promotion manifests | Complete — 6 Founder decisions framed, 4 non-blocking decisions recommended-and-closeable, 2 decisions (ProductContent approval, family-grouping convention) directly gate mapper design |
| Block 2A | Governed Reconciliation Mapper implementation | **Complete, frozen, committed** |

### Block 2A implementation detail

- **Mapper module:** `lib/knowledge-reconciliation/` — 14 files, 2,239 lines:
  `types.ts`, `policy.ts`, `normalize.ts`, `sources.ts`, `identity.ts`, `precedence.ts`, `knowledge-item-mapper.ts`, `product-intelligence-mapper.ts`, `problem-intelligence-mapper.ts`, `care-intelligence-mapper.ts`, `decision-input-contract.ts`, `governance-validation.ts`, `dry-run.ts`, `index.ts`
- **Test suite:** `__tests__/knowledge-reconciliation/mapper.test.ts` — 1 file, 406 lines, 28 tests
- **Test result:** 28/28 passing, verified twice in this handoff-preparation session against real ep-falling-heart data
- **TypeScript:** `npx tsc --noEmit` — 0 errors, verified twice
- **Build:** `npm run build` — succeeded cleanly, verified twice (dev server stopped before each build, restarted explicitly on port 3002 after)
- **Zero-write verification:** confirmed directly by snapshotting real row counts on all 7 relevant tables before and after mapper execution — identical every time, including a fresh reverification run immediately before this handoff was written
- **Committed as:** `ff394b6a5312d1956209b461fdc574312bed78ba` — `feat: add governed intelligence reconciliation mapper` — exactly the 15 files above, 2,645 insertions, 0 deletions, 0 unrelated files

### Public entry point for Block 2B

```ts
import { runReconciliationDryRun } from "@/lib/knowledge-reconciliation";

const manifest = await runReconciliationDryRun();
```

This is the **one function** Block 2B needs to call. It performs read-only queries against `Product`, `ProductVariant`, `ProductContent`, `PublishedKnowledgeRecord`, and the four (currently empty) intelligence tables, and returns a `DryRunManifest` (see `lib/knowledge-reconciliation/types.ts` for the exact shape). It writes nothing, ever — there is no code path in this module that calls `.create()`/`.update()`/`.delete()`/`.upsert()` on anything.

---

## 4. Current Data State

Verified immediately before this handoff document was written:

| Table | Count | Note |
|---|---|---|
| `Product` | 20 | All ACTIVE |
| `ProductVariant` | 37 | |
| `ProductContent` | 20 | **All 20 are `approvalStatus: PENDING`** — 0 APPROVED, 0 REJECTED, 0 DRAFT/NULL. This is a uniform, not partial, state. |
| `PublishedKnowledgeRecord` | 1,043 | All `accessLayer: INTERNAL`. Approval-status breakdown: 22 APPROVED, 460 REVIEW_READY/PENDING_REVIEW, 222 DRAFT, 328 UNKNOWN_STATUS, 11 OPEN_PENDING_FOUNDER_INPUT |
| `KnowledgeItem` | 0 | |
| `ProductIntelligence` | 0 | |
| `ProblemIntelligence` | 0 | |
| `CareIntelligence` | 0 | |

---

## 5. Mapper Output Expectations

Approximate shape of what `runReconciliationDryRun()` currently produces, observed during Block 2A implementation and testing:

| Projection type | Approximate count | Note |
|---|---|---|
| `KnowledgeItemProjection` | ~513 | Non-`PRODUCT_KF` domains only (`MARKETING_KF`, `INSTITUTIONAL_SALES_KF`, `CUSTOMER_CARE_KF`, `FOUNDER_INTELLIGENCE_KF`) |
| `ProductIntelligenceProjection` | 20 | Exactly one per real, ACTIVE Product — this count is exact, not approximate |
| `ProblemIntelligenceProjection` | ~5–8 | Category 2 (FAQ-derived) + category 3 (one generic per family) candidates |
| `CareIntelligenceProjection` | ~20–24 | 4 category-1 (always present) + one category-2 per product that has real safety text |
| `customerSafeEligible` (total, across all projections) | 0 | By design — no automatic promotion exists anywhere in this mapper |
| Proposed write operations | 100% `CREATE` | All four target tables are empty today; `UPDATE`/`TOUCH`/`ARCHIVE` paths are implemented but have nothing to exercise against yet |

**These are approximate, observed-during-development figures — not a substitute for Block 2B's own fresh run.** Block 2B must call `runReconciliationDryRun()` for real against current ep-falling-heart data and report the exact counts it actually returns. Do not assume the numbers above are still current by the time Block 2B runs — source data (especially `PublishedKnowledgeRecord`, if a Knowledge Publisher run happens between now and then) could change them.

---

## 6. Governance Rules (frozen, centralized in `lib/knowledge-reconciliation/policy.ts`)

- **Field-level source precedence:** `ProductContent` first, legacy `Product.*` columns second (kept only as a lower-precedence corroborating source), Knowledge Factory family content only for sections `ProductContent` has no equivalent for (identity/manufacturing-context/comparison notes). Verified against real data: `ProductContent` is more complete than the Knowledge Factory's own content for benefits/directions/safety/FAQ in every product checked.
- **ProductContent treatment:** 19 of 20 products are policy-eligible as `APPROVED` reconciliation sources; **Muv Black Phenyl** is `APPROVED_WITH_EXCLUSIONS` — its `faq` field citation is incomplete and must stay `FOUNDER_REVIEW_REQUIRED` until backfilled. This is a Founder-reconciliation-eligibility policy, distinct from the database's own `approvalStatus` column (still PENDING for all 20) — the mapper never conflates the two.
- **No automatic INTERNAL → CUSTOMER_SAFE promotion exists anywhere.** Every projection defaults to `FOUNDER_REVIEW_REQUIRED` or `INTERNAL_ONLY`. The only classifications this mapper can ever propose without further Founder input are `INTERNAL_ONLY` and `FOUNDER_REVIEW_REQUIRED` — never `CUSTOMER_SAFE`.
- **Ingredient confidentiality:** internal-only for all 20 products; `policy.ts`'s `ingredientDisclosurePolicy.approvedProductNames` is an empty array (no product approved for disclosure today). No `ProductIntelligenceProjection.sections` object contains an `ingredients` key unless that array is explicitly populated with the product's name.
- **Family grouping:** a plain `familyId` string convention (not a schema relation) — `policy.ts`'s `familyGroupingByProductName`, matching the real Knowledge Factory folder structure exactly (12 families: 3 multi-member — liquid-detergent, hand-wash, body-wash — plus floor-cleaner with 2 members, and 8 single-SKU families). Family membership is a `relationshipReferences` entry only; every Product keeps exactly one `ProductIntelligence` identity (enforced by the schema's own `productId @unique`).
- **Dynamic commercial-data rule:** no `ProductIntelligenceProjection.sections` ever contains a price/MRP/stock value; `VariantReference` carries only `variantId`/`sku`/`size`/tool-name metadata (`commerce.getPricing`/`commerce.getAvailability`).
- **Conflict handling:** never silently merged or overwritten. The one real conflict found in the entire corpus (Cool Water Liquid Detergent historical pricing: SOP said ₹155/₹699 generic, Product Chart said ₹165/₹725 variant-specific) is already non-authoritative for any live answer — confirmed live `ProductVariant` values are ₹165/₹725, matching the Product Chart — and is preserved as audit evidence only, never as a source a projection may select from.
- **Founder-review queue:** every projection with `reviewStatus: "REQUIRED"` is enumerated in the manifest's `founderReviewQueue`, with a reason.
- **Deterministic identity and idempotency:** `ProductIntelligence` key = `productId` (native); `KnowledgeItem` key = `kf-{domain}-{koid}`; `ProblemIntelligence`/`CareIntelligence` keys = slugified canonical names. Two full runs against the same source data produce byte-identical keys and content hashes (verified, test 2 in the suite).

---

## 7. Known Gaps

- **`UPDATE`/`TOUCH`/`ARCHIVE` proposed-operation paths are untested against real non-empty intelligence tables** — necessarily, since all four are empty today. They are implemented and typed correctly (see `identity.ts`'s `computeProposedOperation()`), but their first real exercise will be whenever this mapper first runs after some future block has actually written rows.
- **`ProblemIntelligence` category-2 derivation patterns are intentionally narrow** (3 regex patterns: stain removal, usage/dosage, bucket-vs-machine-wash) — a dedicated content review pass may surface more safely-derivable patterns. Expanding the pattern list is a small, additive change to `problem-intelligence-mapper.ts`, not a redesign.
- **Hindi/Hinglish `ProblemIntelligence` aliases are empty on every candidate today** — deferred to a future, separate content-authoring pass (Block 2C Decision 4), never machine-translated by this mapper.
- **The family-grouping map in `policy.ts` is a static, hand-verified table**, not derived dynamically from the database. Correct and auditable for today's fixed 20-product catalog; will need a manual edit if a 21st product joins an existing family or a new family is added.
- **The customer-safe promotion list (Block 2C Decision 2) is still fully open.** No record — not even the 22 source-`APPROVED` `PublishedKnowledgeRecord` rows — has been promoted to `CUSTOMER_SAFE` by anything in this codebase.
- **No intelligence population has occurred.** All four tables remain at 0 rows.
- **Runtime/provider activation remains blocked**, per the separate Governed Runtime Activation & Knowledge Publication Recovery audit — `GATEWAY_LLM_PROVIDER` is unset, `PILOT_PRODUCT_SEARCH_ENABLED` is unset/false, and this remains true regardless of anything Block 2B does. Block 2B does not touch runtime activation at all.

---

## 8. Unrelated Working-Tree Changes

The following files/directories were modified or created by **earlier, separately-approved session work** — none of them are part of Block 2A and none were touched, staged, or committed by it:

**Modified (pre-existing, from earlier tasks):**
- `actions/products.ts`
- `app/(storefront)/products/[slug]/page.tsx`
- `app/admin/products/page.tsx`
- `components/admin/image-uploader.tsx`
- `components/admin/product-form-modal.tsx`
- `components/admin/products-table-client.tsx`
- `lib/gateway/commerce/search-engine.ts`
- `lib/product-catalog.ts`
- `lib/recommendations.ts`
- `lib/validations/product.ts`

**Untracked (pre-existing, from earlier tasks):**
- `__tests__/admin/`
- `__tests__/storefront/`

**Untracked (account-switch artifact, not project content):**
- `CLAUDE_ACCOUNT_SWITCH_STATE.txt` — a diagnostic dump left by a prior account-switch event, garbled/UTF-16-encoded. Not part of any block's scope.

**Do not discard, reset, stage, overwrite, or commit any of the files above without separate, explicit Founder approval.** They represent real, in-progress or completed work from other tasks and must be left exactly as found.

---

## 9. Exact Next Task

**MUV AI Intelligence Reconciliation & Population — Block 2B: Real Read-Only Dry-Run Manifest**

Block 2B must:

1. Call `runReconciliationDryRun()` from `@/lib/knowledge-reconciliation`
2. Use real `ep-falling-heart` UAT data (never any other host)
3. Perform zero writes — verify this directly (before/after row-count snapshots on all 7 relevant tables), not by code inspection alone
4. Produce the complete projection manifest (all `KnowledgeItemProjection`/`ProductIntelligenceProjection`/`ProblemIntelligenceProjection`/`CareIntelligenceProjection` arrays)
5. Expose every proposed record and relationship (the manifest's `relationshipReferences`, `provenance`, and `proposedWriteOperation` fields already carry this — Block 2B's job is to surface and review it, not recompute it)
6. Classify and report `INTERNAL_ONLY` vs. `FOUNDER_REVIEW_REQUIRED` candidate totals (already computed in `manifest.totals`)
7. Expose conflicts, exclusions, warnings, and blocked records (`manifest.conflicts`, `manifest.excludedRecords`, `manifest.warnings`, `manifest.blockedRecords`)
8. Produce a Founder-review queue presentation (`manifest.founderReviewQueue` already exists — Block 2B formats/reports it for actual Founder review)
9. Verify exact counts (Product=20, Variant=37, ProductContent=20, PublishedKnowledgeRecord=1,043 as of this handoff — reconfirm freshly, do not assume)
10. Stop before any population — Block 2B is itself read-only, exactly like Block 2A

---

## 10. Block 2B Prohibitions

Block 2B must **not**:

- Write any intelligence record (`KnowledgeItem`, `ProductIntelligence`, `ProblemIntelligence`, `CareIntelligence`)
- Change any `ProductContent.approvalStatus`
- Promote any record to `CUSTOMER_SAFE` or `PUBLIC`
- Activate any runtime feature flag
- Activate Anthropic or call any provider
- Run FAT (any version)
- Run customer conversations
- Stage or commit anything unless separately, explicitly approved (Block 2B is expected to be a report/manifest-review task, not a code-change task — if it turns out to require a code change, stop and report before proceeding, per this whole series' established pattern)
- Push or deploy anything

---

## 11. Completion Gate

Block 2B may be called complete only when:

- The complete real manifest has been produced by an actual call to `runReconciliationDryRun()` against `ep-falling-heart`
- Zero writes are directly verified (before/after row-count snapshots, not just code inspection)
- All 20 Products are represented in the manifest's `ProductIntelligenceProjection` array
- All 37 Variants are represented (summed across all `ProductIntelligenceProjection.variants` arrays)
- All projection identities are confirmed deterministic (re-running produces identical keys/hashes)
- All internal/confidential data remains blocked (no `ingredients`, no manufacturing/formula content, in any projection reachable by a `CUSTOMER_SAFE`-eligible path)
- Every conflict and review item is visible in the reported manifest (nothing silently dropped)
- The Founder receives an approval-ready manifest — clear enough to make the Decision 2 (customer-safe promotion list) call from, without needing to read mapper source code first

---

*This handoff document is committed separately from the Block 2A implementation commit, per the task's own instruction to keep code and documentation changes in distinct, reviewable commits.*
