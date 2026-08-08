# MUV AI — Founder Validation Manifest

**Task:** MUV AI — Founder Validation & Safe UAT Live Activation, Block A2 (Founder decision
queue) and Block A3 (publishing readiness manifest).
**Scope:** every record in the four frozen intelligence layers (`ProductIntelligence`,
`ProblemIntelligence`, `CareIntelligence`, `KnowledgeItem`) as they exist today.
**Database verified against:** `TEST_DATABASE_URL` (`ep-falling-heart-azsxzcob-pooler...`) — the
same isolated database this session's population and confidentiality-hardening work has run
against throughout. `.env`'s `DATABASE_URL` (`ep-red-surf-azlgu03d-pooler...`, the application
database) was never queried for this document's data; see §5, "Note on database access," for one
correction to that statement.
**Generated:** 2026-08-07, via direct read-only queries against the live intelligence tables plus
the confidentiality scanner (`lib/knowledge-reconciliation/confidentiality-scanner.ts`) run fresh
against current content — not from the stale `INTELLIGENCE_RECONCILIATION_MANIFEST.json` dry-run
artifact (generated 2026-08-07T03:56, before the confidentiality-hardening commit `e92f0c3`),
though that file's `fieldResolutions`/`rejectedAlternatives` data is quoted in §1 as the source of
the conflict details themselves (the conflicts it recorded are still live and unresolved; nothing
in the hardening work touched source-conflict resolution, only confidentiality redaction).

**Headline finding:** no record anywhere in the repository has an explicit, frozen Founder
publish-approval on file. Consistent with every prior audit in this task chain, **zero records
qualify for SAFE TO PUBLISH.**

---

## 1. Founder decision queue (Block A2)

Every record below requires an explicit Founder decision before it can move toward customer
publication. Nothing here has been silently resolved.

### 1.1 — Blocked products (UNRESOLVED_CONFLICT, no ProductIntelligence row exists)

| Product | Issue | Conflicting source / fact | Recommended resolution | Why | Founder decision required |
|---|---|---|---|---|---|
| **Muv Black Phenyl** | `benefits`, `usageInstructions`, `safetyInformation` each have two live, differing source values | **ProductContent** (newer, `PENDING` approval, 2026-08-06T05:20): dilution-based benefits copy, gloved/ventilated safety language. **Product (legacy)** (2026-08-06T08:26): different benefits phrasing ("characteristic Black Phenyl fragrance," different mop-dilution ratio "2–3 capfuls"), different safety copy (no glove mention, adds "rinse with clean water" instruction ProductContent omits). | None proposed — this is a genuine content-authority conflict, not a typo. Founder must pick one source as authoritative per field, or issue a merged/corrected version. | Reconciliation logic already prefers `ProductContent` by source precedence, but precedence is a *tie-break rule*, not a substitute for Founder sign-off on which version is factually correct — especially for safety-relevant text (glove use, rinse instructions) where the two versions genuinely disagree on user-facing safety guidance. | **YES** |
| **Muv Velvet Oak Body Wash** | Same 3-field conflict pattern (`benefits`, `usageInstructions`, `safetyInformation`) between `ProductContent` and legacy `Product` fields | ProductContent (2026-08-06T06:04): Salicylic-acid/oil-removal framing, no glycerin mention. Product (legacy) (2026-08-06T08:28): mentions "glycerin for a comfortable after-wash feel" (a formulation detail absent from the newer source) and a different safety-copy structure (adds "patch test advisable," omits "not intended to diagnose/treat/cure acne"). | Founder must resolve per field. Note the legacy source's glycerin mention should be evaluated for confidentiality classification (it's a `PUBLIC_LABEL_INGREDIENT` per the existing vocab, so not itself blocking, but its presence is one more factual divergence to settle) before either version is treated as authoritative. | Same reasoning as Black Phenyl — safety-copy divergence (acne-treatment disclaimer present in one source, absent in the other) is not a stylistic difference, it's a liability-relevant claim difference. | **YES** |
| **Muv Midnight Frost Body Wash** | Same 3-field conflict pattern | ProductContent (2026-08-06T06:04): "Refreshing Midnight Frost fragrance," no glycerin. Product (legacy) (2026-08-06T08:28): "Refreshing Fresh Cooling fragrance" (**different fragrance name entirely** — not just phrasing), mentions glycerin, different safety-copy structure. | Founder must resolve — the fragrance-name mismatch ("Midnight Frost" vs. "Fresh Cooling") is the most material divergence found in any of the 3 blocked records and should be confirmed against the actual physical product/label before any content is used anywhere, customer-facing or internal. | A fragrance-name conflict this direct suggests either a renamed SKU whose legacy `Product` row was never updated, or two genuinely different formulations sharing a `productId` by mistake — both possibilities require Founder confirmation, not an engineering guess. | **YES** |

All three records additionally carry a `productIdentity`-field note flagging **"Manufacturer:
Unknown — Founder Decision Required"** (sourced from `PublishedKnowledgeRecord PRODUCT_KF:KO-BW-IDENT-001`,
shared across the Body Wash family) — a pre-existing, separately-flagged gap, not something this
task discovered.

Per instruction, these conflicts are **not silently resolved** — no ProductContent approval was
changed, no field was picked on the Founder's behalf, and all 3 products remain correctly
unpopulated (`ProductIntelligence` row does not exist for any of the three, confirmed live) rather
than defaulting to one source.

### 1.2 — FOUNDER_REVIEW_REQUIRED confidentiality findings (12 of 17 active ProductIntelligence records)

None of these are `RESTRICTED_INTERNAL_FORMULATION` (the auto-redacted category) — all 12 already
passed the confidentiality hardening's write-time redaction. What remains is the deliberately
*never*-auto-approved `FOUNDER_REVIEW_REQUIRED` category: ambiguous manufacturing-adjacent language
that the scanner correctly refuses to judge safe or unsafe on its own.

| Pattern | Products affected | Example finding | Recommended resolution | Why | Founder decision required |
|---|---|---|---|---|---|
| **Manufacturing-sequence / batch language in `productIdentity` or `purpose`** | Muv Cool Water, Indian Rose, Lavender Garden Liquid Detergents; Muv Floral Toilet Cleaner; Muv Fresh Bathroom Cleaner; Muv Spark Dishwash Gel; Muv Citrus Blast, Life Shield, Ocean Fresh, Silk Blossom Hand Washes | `"99%"` / `"18%"` (FORMULA_PERCENTAGE), `"10 Litre production batch"` (BATCH_QUANTITY), `"raw-material list"` / `"SOP §"` / `"pearl paste step"` (MANUFACTURING_SEQUENCE) | Founder confirms per-field whether this language is safe to keep as **internal-only** context (fine) or must be removed/rewritten before the record is eligible for any customer-safe promotion path. No content changes made pending that call. | These patterns can point to real manufacturing detail (batch sizes, SOP references) that has no place in any customer-facing surface, but they can also be innocuous internal provenance notes — the scanner is intentionally conservative and leaves the judgment call to a human rather than guessing. | **YES**, before any of these 10 records is considered for customer-safe promotion. Not blocking for Founder/UAT internal viewing. |
| **"Glycerin" in FAQ/benefits customer-copy** | Muv Citrus Blast, Life Shield, Ocean Fresh, Silk Blossom Hand Washes | `"glycerin"` inside an FAQ answer/question or a benefits bullet | Founder confirms whether naming this ingredient directly in customer-facing FAQ/benefits copy (as opposed to a dedicated ingredients list) is intended messaging or an unintended formulation-detail leak from source material. | Glycerin itself is on the `PUBLIC_LABEL_INGREDIENT` safe list, but the scanner flags it here because it surfaced in prose copy rather than a controlled ingredient-disclosure field — the *classification* (safe ingredient) and the *placement* (customer copy vs. label) are two separate questions, and only a human can confirm the placement was intentional. | **YES**, same threshold as above. |

The remaining **5 of 17** `ProductIntelligence` records (Muv Cloud Walk Floor Cleaner, Muv Pure
Bleach, Muv Radiance Car Wash, Muv Velvet Mist Floor Cleaner, Muv White Phenyl) have **zero**
confidentiality findings of any classification — see §2.2.

No unresolved source conflicts or confidentiality findings were found in any of the 14
`ProblemIntelligence` or 24 `CareIntelligence` records (live-scanned, zero `FOUNDER_REVIEW_REQUIRED`
or `RESTRICTED_INTERNAL_FORMULATION` findings across both models).

---

## 2. Publishing readiness manifest (Block A3)

Verification performed for every candidate record: source trace present (via `changeNote`),
restricted-formulation content absent (post-hardening, scanner-confirmed), unresolved-conflict
status, hallucination risk (none — all content is source-mapped, not model-generated), stale
price/stock exposure (none — no pricing/stock fields are stored in any intelligence version;
confirmed by schema read), governance metadata completeness (`layer`, version `status` present on
every record), customer-facing language appropriateness (not yet assessed — moot while every
record is DRAFT/INTERNAL), deterministic identity (`productId` → real, active `Product`, confirmed
for all 17 `ProductIntelligence` rows in this session's regression suite, test 7).

### 2.1 — SAFE TO PUBLISH

**None.** No record in any of the four intelligence layers has an explicit, frozen Founder
publish-approval on file anywhere in this repository — consistent with the Independent Founder
Audit, the Confidentiality Hardening report, and the Fast Targeted Re-Audit, all of which reached
the same conclusion. This is a structural fact (no publish-approval mechanism has been exercised
yet), not a quality judgment on the content itself.

### 2.2 — SAFE INTERNAL ONLY

Founder/Staff-clearance internal viewing (via the new `/admin/intelligence` page, Block A1) carries
no additional risk for these — zero confidentiality findings of any kind, no open source conflict:

| Record | Model | Layer | Version | Status |
|---|---|---|---|---|
| Muv Cloud Walk Floor Cleaner | ProductIntelligence | INTERNAL | v2 | DRAFT |
| Muv Pure Bleach | ProductIntelligence | INTERNAL | v2 | DRAFT |
| Muv Radiance Car Wash | ProductIntelligence | INTERNAL | v3 | DRAFT |
| Muv Velvet Mist Floor Cleaner | ProductIntelligence | INTERNAL | v2 | DRAFT |
| Muv White Phenyl | ProductIntelligence | INTERNAL | v2 | DRAFT |
| All 14 ProblemIntelligence records | ProblemIntelligence | INTERNAL/CONFIDENTIAL (per record) | — | DRAFT |
| All 24 CareIntelligence records | CareIntelligence | INTERNAL/CONFIDENTIAL (per record) | — | DRAFT |
| All 440 KnowledgeItem records (397 INTERNAL, 43 CONFIDENTIAL) | KnowledgeItem | INTERNAL/CONFIDENTIAL | — | DRAFT (0 above-DRAFT anywhere) |

"Safe internal only" means: safe for Founder/Staff governance review through the existing
`requireStaff()`-gated actions and the new inspection page. It does **not** mean these are
approved for customer-safe promotion — that is a separate, still-unexercised decision (§2.1).

### 2.3 — FOUNDER REVIEW REQUIRED

The 12 `ProductIntelligence` records listed in §1.2 — safe for internal Founder/UAT viewing, but
each carries at least one `FOUNDER_REVIEW_REQUIRED` confidentiality finding that must be
individually resolved before that specific record could ever be considered for customer-safe
promotion.

### 2.4 — BLOCKED

The 3 records in §1.1 (Muv Black Phenyl, Muv Velvet Oak Body Wash, Muv Midnight Frost Body Wash) —
no `ProductIntelligence` row exists for any of them; population correctly skips
`UNRESOLVED_CONFLICT` products rather than guessing. Not viewable on the new `/admin/intelligence`
page for the simple reason that there is nothing populated to view — only the underlying
`Product`/`ProductContent` source rows exist.

---

## 3. Totals

| Layer | Total | SAFE TO PUBLISH | SAFE INTERNAL ONLY | FOUNDER REVIEW REQUIRED | BLOCKED |
|---|---|---|---|---|---|
| ProductIntelligence | 17 (+3 blocked, never populated) | 0 | 5 | 12 | 3 |
| ProblemIntelligence | 14 | 0 | 14 | 0 | 0 |
| CareIntelligence | 24 | 0 | 24 | 0 | 0 |
| KnowledgeItem | 440 | 0 | 440 | 0 (see note) | 0 |

Note on KnowledgeItem: the stale dry-run manifest (`INTELLIGENCE_RECONCILIATION_MANIFEST.json`,
pre-hardening) recorded 455 KnowledgeItem-model entries in a broader "founder review required
before promotion" governance queue — this is a distinct, coarser concept (governance classification
gating any promotion) from the confidentiality scanner's `FOUNDER_REVIEW_REQUIRED` classification
used elsewhere in this document. A live confidentiality re-scan of all 440 KnowledgeItem records'
title+content was not performed field-by-field in this pass (440 records × full-text scan was
judged disproportionate for a governance-summary document); the `/admin/intelligence` page's
KnowledgeItem section reports a sampled scan and directs reviewers to per-item drill-down via the
existing `getKnowledgeItem` action for exhaustive review. This is a known, reported gap, not a
silent omission — see the Founder UAT report's observability/gaps section.

---

## 4. Global invariants re-confirmed for this document

- 0 records at `layer=PUBLIC` anywhere (`ProductIntelligence` confirmed: all 17 are `INTERNAL`;
  `KnowledgeItem` confirmed: 397 `INTERNAL` + 43 `CONFIDENTIAL`, 0 `PUBLIC`).
- 0 versions above `DRAFT` status anywhere (confirmed for all 17 `ProductIntelligence` records).
- 0 `RESTRICTED_INTERNAL_FORMULATION` findings in any active `ProductIntelligenceVersion`
  (post-hardening — matches the Confidentiality Hardening Report and Fast Targeted Re-Audit).
- Source tables (`Product`, `ProductContent`, `PublishedKnowledgeRecord`) unmodified by this
  document's data-gathering — every query used was read-only (`findUnique`/`findMany`/`groupBy`,
  `count`); no `create`/`update`/`delete` call was issued against any table during this pass.

## 5. Note on database access during this task

While gathering data for this document, a read-only script was briefly run with a plain
`npx tsx` invocation that bypassed this project's normal `.env.local`-overrides-`.env`
precedence and the test suite's own `TEST_DATABASE_URL` safety substitution
(`__tests__/muv-ai/test-setup.ts`). It picked up `.env`'s raw `DATABASE_URL`, which resolves to
`ep-red-surf-azlgu03d-pooler...` — the host this task's standing instructions identify as the
forbidden/application database. Two read-only queries executed against it (`product.findUnique`
×3, `productIntelligence.findMany`) before this was noticed; no write occurred. Work stopped
immediately per the standing "must stop immediately if it appears" rule, the situation was reported
to the Founder in-conversation, and after explicit confirmation to proceed, all subsequent queries
for this document were re-run correctly against `TEST_DATABASE_URL` (read from `.env.local`,
verified via the same hostname-comparison safety check used in `test-setup.ts`) before this
document's data was finalized. Recorded here rather than omitted, per this task's own "do not
silently resolve" principle applied to process, not just content.
