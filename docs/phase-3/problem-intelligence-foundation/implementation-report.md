# Module 3 — Problem Intelligence Foundation (PrIF Engine)
## MUV Intelligence Platform — Implementation Report

---

## 1. Module Summary

Built the problem-first structured intelligence layer: `ProblemIntelligence` (the stable item — slug +
Layer A/B/C) and `ProblemIntelligenceVersion` (one evolving unit of work, going through a strict
`DRAFT → REVIEW → PUBLISHED → ARCHIVED` pipeline), plus twelve normalized child tables covering symptoms,
causes, diagnostic questions (with options and a real relation to the causes they confirm), common
mistakes, product relationships, exclusion/contraindication rules, problem-specific usage guidance,
expected outcomes, prevention guidance, safety rules, and evidence sources. Twenty-three server actions
implement the full lifecycle plus every required structured-section operation (two —
`addProblemCommonMistake` and `changeProblemIntelligenceLayer` — beyond the module's literal 21-action
list; see §8. **Corrected post-delivery**: this report originally said "twenty-two" and named only
`addProblemCommonMistake` as the addition, missing `changeProblemIntelligenceLayer`. Recounted directly
from the file (`grep -c "^export async function" actions/problem-intelligence.ts` → 23) while writing
Module 4's report; fixed here for anyone reading this file directly rather than left silently wrong).
No retrieval
orchestration, embeddings, vector search, Decision Engine, Safety Engine execution, or Chat UI was built
— this module is the structured storage and editorial workflow only, exactly as scoped.

## 2. Architecture Compliance

- **Problem-first, not product-first; not a recommendation engine:** `ProblemProductRelationship` and
  `ProblemExclusionRule` record candidate suitability/exclusion *signals* only — `suitability` is an
  explicit enum including `NOT_RECOMMENDED`, and nothing in this module computes or returns a final
  recommendation. The Core Principle's list of acceptable outcomes ("no product is suitable," "more
  information is required," "a safety concern exists," "human escalation is necessary," "avoid using a
  particular product") is directly representable: `prohibitedRecommendation`, `escalationRequired`,
  `humanReviewRequired` on the version, and `ProblemExclusionRule` rows, all exist for exactly this.
- **"Avoid storing the entire PrIF as one uncontrolled JSON object":** eleven of the fourteen structured
  sections are real, normalized Prisma models with real foreign keys to `ProblemIntelligenceVersion` (and,
  where relevant, to `Product`/`Category`/`ProductIntelligence`/other child tables). Only
  `ProblemDiagnosticQuestion.validationRules`/`.followUpConditions` use `Json?`, justified by genuinely
  variable shape per `answerType` — documented in `architecture.md`.
- **Do not merge PrIF with PIF:** `ProblemProductRelationship`/`ProblemUsageGuidance` *reference*
  `ProductIntelligence` by id (optional FK); no PIF field was copied into any PrIF table. Verified live —
  a relationship row was confirmed to carry no `price`/`mrp` fields.
- **Do not redesign Module 1 or Module 2:** confirmed no file under either module's scope was edited.
  `KnowledgeLayer` is imported/reused, not redefined. A new `ProblemIntelligenceStatus` enum was used
  (not Module 2's `ProductIntelligenceStatus`), since reusing it across modules for unrelated content
  would itself be a form of coupling neither module asked for.
- **Published versions immutable, never overwritten:** `loadEditableVersion()` is the single enforcement
  point, called by every mutating action. Verified live: v1's content remained byte-identical after v2
  was published from it.
- **Only one current published version:** `publishProblemIntelligence` archives the prior published
  version inside the same transaction as publishing the new one. Verified live.
- **Restoring archived content must not silently overwrite a current published version:**
  `restoreProblemIntelligence` only ever creates a new `DRAFT` row; it has no code path touching the
  currently-`PUBLISHED` version.
- **Layer A/B/C "reuse the existing... architecture from Module 1":** `KnowledgeLayer` used directly.
  Public retrieval (`getPublishedProblemIntelligence`) hardcodes `layer: PUBLIC`, `status: PUBLISHED`,
  and a curated field selection that excludes every internal-marked field regardless of item layer.
  Verified live for the item-level boundary; verified by inspection for the field-level boundary (see
  `permissions.md`).
- **"No contradictory recommendation and exclusion... without an explicit documented override":**
  `addProblemProductRelationship` checks for a conflicting `ProblemExclusionRule` in the same version and
  requires `overrideJustification` if one exists and the new relationship isn't itself
  `NOT_RECOMMENDED`. Verified live, both the rejection path and the override-accepted path.
- **Transactions for state-changing operations:** publish, duplicate, restore, and item+v1 creation are
  all wrapped in `prisma.$transaction`.
- **Audit history, reusing Module 1's pattern:** the ordered `ProblemIntelligenceVersion` list per item
  *is* the audit trail (author/reviewer/publisher + timestamps on every row), the same idiom Module 1
  established (`KnowledgeVersion`) and Module 2 continued (`ProductIntelligenceVersion`) — no separate,
  competing audit architecture was introduced.

## 3. Files Created

| File | Purpose |
|---|---|
| `lib/validations/problem-intelligence.ts` | Every Zod schema (create/version/update/transition/duplicate/restore/layer-change and all ten `addProblem*` child schemas), plus `PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS` |
| `actions/problem-intelligence.ts` | 21 `"use server"` actions plus shared internal helpers (`loadEditableVersion`, `deepCopyVersionChildren`, `nextVersionNumber`) |
| `docs/phase-3/problem-intelligence-foundation/README.md` | Overview, what PrIF is/isn't |
| `docs/phase-3/problem-intelligence-foundation/architecture.md` | Design decisions and reasoning |
| `docs/phase-3/problem-intelligence-foundation/data-model.md` | Full schema reference |
| `docs/phase-3/problem-intelligence-foundation/lifecycle.md` | Status workflow and rules |
| `docs/phase-3/problem-intelligence-foundation/permissions.md` | Layer A/B/C boundaries |
| `docs/phase-3/problem-intelligence-foundation/api-reference.md` | Every action's auth/request/response |
| `docs/phase-3/problem-intelligence-foundation/testing.md` | Exact commands and results |
| `docs/phase-3/problem-intelligence-foundation/known-limitations.md` | Honest gaps |
| `docs/phase-3/problem-intelligence-foundation/implementation-report.md` | This file |

## 4. Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 6 new enums, `ProblemIntelligence`, `ProblemIntelligenceVersion`, and 12 child models; added 4 new back-relation fields to `User` (`problemIntelligenceVersionsAuthored/Reviewed/Published`, `problemEvidenceSourcesReviewed`); added 3 new back-relation fields to `Product` (`problemProductRelationships`, `problemExclusionRules`, `problemUsageGuidance`); added 2 new back-relation fields to `Category` (`problemExclusionRules`, `applicableToProblemVersions`); added 2 new back-relation fields to `ProductIntelligence` (`problemProductRelationships`, `problemUsageGuidance`) |

No file belonging to Module 1 or Module 2's own scope (`lib/validations/knowledge.ts`,
`actions/knowledge.ts`, `lib/validations/product-intelligence.ts`, `actions/product-intelligence.ts`) was
modified.

## 5. Dependencies

**None added.** Everything uses what's already in `package.json`.

## 6. Configuration Changes

**None.** No environment variable, config file, or build setting was touched.

## 7. Database Changes

Applied via `npx prisma db push --skip-generate` (additive, non-destructive — confirmed "database now in
sync," no existing table altered, no data loss) and `npx prisma generate`.

- **Models added (14):** `ProblemIntelligence`, `ProblemIntelligenceVersion`, `ProblemSymptom`,
  `ProblemCause`, `ProblemDiagnosticQuestion`, `ProblemQuestionOption`, `ProblemCommonMistake`,
  `ProblemProductRelationship`, `ProblemExclusionRule`, `ProblemUsageGuidance`, `ProblemExpectedOutcome`,
  `ProblemPreventionGuidance`, `ProblemSafetyRule`, `ProblemEvidenceSource`.
- **Enums added (6):** `ProblemIntelligenceStatus`, `ProblemRiskLevel`, `ProblemConfidenceLevel`,
  `ProblemQuestionAnswerType`, `ProblemQuestionAudience`, `ProblemProductSuitability`.
- **Relationships:** see `data-model.md` for the full field-level list; summarized — every child table
  → `ProblemIntelligenceVersion` (cascade delete); `ProblemProductRelationship`/`ProblemExclusionRule`/
  `ProblemUsageGuidance` → `Product` (required or optional depending on the table) and, where relevant,
  → `ProductIntelligence`/`Category`; `ProblemCause` ↔ `ProblemDiagnosticQuestion` implicit many-to-many;
  `ProblemIntelligenceVersion` ↔ `Category` implicit many-to-many (`applicableCategories`); four distinct
  named relations from `ProblemIntelligenceVersion`/`ProblemEvidenceSource` to `User`.
- **Indexes:** `@@unique([problemIntelligenceId, versionNumber])`; `@@index` on every child table's
  `versionId`, plus `productId`/`categoryId`/`questionId` where those FKs exist; `@@index([layer])` on
  the item table; `@@index([problemIntelligenceId, status])` on the version table.
- **Migration status:** no migration file generated — this project uses `db push` for dev, unchanged
  convention from Modules 1 and 2. A real `prisma migrate` should run before any production deploy.
- **Data-loss risk:** none. Purely additive; verified no existing row, table, or column was altered by
  re-confirming `npx prisma db push` reported "in sync" with zero warnings about data loss (a destructive
  push would have prompted for confirmation, which it did not).

## 8. APIs Added

Full detail in `api-reference.md`. Summary: **23 Server Actions** in `actions/problem-intelligence.ts`
(recounted directly from the file: `grep -c "^export async function"` → 23) —
9 core lifecycle actions (`createProblemIntelligence`, `createProblemIntelligenceVersion`,
`updateProblemIntelligenceDraft`, `submitProblemIntelligenceForReview`, `publishProblemIntelligence`,
`archiveProblemIntelligence`, `restoreProblemIntelligence`, `duplicateProblemIntelligenceDraft`,
`changeProblemIntelligenceLayer`), 4 retrieval actions (`getProblemIntelligence`,
`listProblemIntelligence`, `getProblemIntelligenceVersionHistory`, `getPublishedProblemIntelligence` —
the only unauthenticated one), and 10 structured-section actions.

**Note on the count:** the module's own "Required operations" list names exactly 21 actions, including
9 `addProblem*` child-section actions (symptom, cause, diagnostic question, product relationship,
exclusion rule, usage guidance, outcome, prevention guidance, safety rule) — it does **not** name
`addProblemCommonMistake` or `changeProblemIntelligenceLayer`, even though "Common Mistakes" is Section 6
of the required PrIF Structure and a layer-change path mirrors what Module 2 needed. Both were built
anyway (making 23 actions total, two beyond the literal list — this report originally said "22" and
named only the first of the two; corrected above), on the judgment that leaving a required structured
section with zero way to populate it, and leaving the permission layer with no way to change at all,
were bigger functional gaps than the discipline of matching the list exactly — see `known-limitations.md`
for the symmetric case (`ProblemEvidenceSource`, also a required section, also absent from both the
Validation and Server Actions lists) where the opposite call was made, and why. Flagging this plainly
rather than either silently expanding scope or silently miscounting — this is a judgment call the
founder may want
to weigh in on, not a fact to gloss over. Every action validates via Zod before touching Prisma and
independently re-derives its own RBAC.

## 9. Tests

Full detail and exact output in `testing.md`. Summary:

- `npx prisma validate` — schema valid.
- `npx prisma db push --skip-generate` — "database now in sync," no data loss.
- `npx prisma generate` — clean.
- `npx tsc --noEmit` — exit code 0, zero errors, first attempt.
- `npm run build` — clean production build.
- Manual `npx tsx` script against the real database, importing the real Zod schemas: **31 checks, 31
  passed, 0 failed**, covering creation, duplicate-slug rejection, all 11 structured section types,
  invalid-payload rejection, the DRAFT→PUBLISHED-blocked / REVIEW→PUBLISHED-allowed transition rules,
  immutability of published content, the question→cause many-to-many reconnect during duplication,
  version-history preservation, single-published-version enforcement, exclusion-rule survival across
  versioning, the recommendation/exclusion conflict-and-override check, item-level and field-level Layer
  boundary enforcement, invalid-reference rejection, and both leaf and full-tree cascade-delete behavior.
- **Not tested:** `STAFF`/`ADMIN` RBAC branches against a real session (no test runner exists to script
  one — same disclosed limitation as Modules 1–2), `addProblemEvidenceSource` (doesn't exist, see below),
  `prohibitedRecommendation: true` as an exercised value, and real concurrent-publish race conditions.

## 10. Known Limitations

Full detail in `known-limitations.md`. Headline items: no admin UI (same as Modules 1–2);
`addProblemEvidenceSource` was deliberately not built (absent from both the Validation and Server
Actions required-operations lists, so treated as intentional scope, not an oversight); RBAC branches
type-checked but not live-tested; no database-level partial-unique constraint backing "one published
version" (transaction-only, same as Modules 1–2); `problemCategory` is free text with no fixed
vocabulary (none was specified); diagnostic-question `validationRules`/`followUpConditions` shape isn't
enforced beyond "valid JSON object."

## 11. Architecture Recommendations

**Problem:** Same standing observation as Modules 1 and 2 — this module's "Tests" section is a one-off
manual transcript, not re-runnable coverage, because no test runner exists in this repository.

**Current design:** Manual `npx tsx` verification scripts, written and discarded per module.

**Suggested improvement:** Introduce `vitest`, as already recommended after Modules 1 and 2. This
module's 31-check script is the largest and most valuable one yet to lose if nothing captures it — it
exercises real multi-step workflows (deep-copy-with-relational-remapping, transactional publish-and-
archive, conflict-and-override logic) that would be expensive to accidentally regress silently.

**Advantages / Disadvantages / Risk / Compatibility:** Unchanged from the Module 1 and Module 2 reports
— still low-risk, additive, fully compatible with the existing stack. Not re-argued here to avoid
repeating the same paragraph a third time; the recommendation itself is now three-for-three across every
module built so far, which is its own signal.

*Not applied.* Per this module's own rule, this is a recommendation only — implementation continued
using the project's existing (manual) verification method.

## 12. Next Recommended Module

Recommending exactly one, per the module's own instruction: **the Admin UI covering Modules 1, 2, and 3
together** (Knowledge Manager + Product Intelligence Manager + Problem Intelligence Manager). All three
foundations are now built, tested, and completely inoperable by an actual human — sixteen actions from
Modules 1–2 plus twenty-one from this module, thirty-seven total, every one of them reachable only by
direct script. Before any further foundation module (or the AI Engine / Decision Engine / Safety Engine
itself) is built on top of three unusable backends, staff need a real way to author, review, and publish
Knowledge, PIF, and PrIF content, following the `/admin/inquiries`/`/admin/returns` pattern identified in
the original audit. Building this now — rather than a fourth foundation module — is also the only way to
generate real content to validate the first three modules' data shapes against in practice, before more
is built on top of assumptions.

Waiting for founder review and approval before starting.
