# Module 4 — Care Intelligence Foundation (CIF Engine)
## MUV Intelligence Platform — Implementation Report

---

## 1. Module Summary

Built the emotional/operational care layer: `CareIntelligence` (stable item — slug + Layer A/B/C) and
`CareIntelligenceVersion` (one evolving unit of work through `DRAFT → REVIEW → PUBLISHED → ARCHIVED`),
plus three normalized child tables (`CareRequiredInformation`, `CareAction`, `CareEvidenceSource`) and
four cross-module reference relations (`Product`, `ProductIntelligence`, `ProblemIntelligence`,
`KnowledgeItem`). Ten server actions implement the full lifecycle, exactly matching this module's own
(shorter, more consolidated) required-operations list — no per-child-section actions, no separate
version-creation or submit-for-review action, both folded into `updateCareIntelligence`/
`duplicateCareIntelligence` by design. No CQ Engine, EQ Engine, Decision Engine, AI response generation,
Chat UI, or retrieval orchestration was built.

## 2. Architecture Compliance

- **"CIF does not store product knowledge... it stores how MUV should care for customers":** every
  field on `CareIntelligenceVersion` is procedural/emotional (situation, objective, escalation,
  communication guidance, follow-up, resolution conditions) — nothing duplicates a product's price,
  description, or ingredients. Verified live: a related `Product` connection carries no `price` field.
- **"This is NOT the CQ Engine... CIF stores the care knowledge that CQ... will use":** nothing in this
  module decides anything or generates a response. Communication guidance fields are explicitly
  guidance-only, never surfaced as a ready-to-send message.
- **"Care Categories... must allow new categories without schema redesign":** `category` and
  `applicableCustomerSegments` are free text, not enums — consistent with Module 3's identical
  reasoning for `problemCategory`.
- **Care Workflow Structure's 12 sections:** all implemented — Identity, Customer Situation (flexible,
  no hardcoded examples), Care Objective, Required Information, Care Actions (ordered, with actor/
  preconditions/expected outcome/failure handling), Human Escalation, Communication Guidance, Resolution
  Conditions, Follow-up Guidance, Institutional Sales Support, Evidence, Version Metadata.
- **"Avoid giant JSON blobs... normalize appropriately":** three real child tables for the genuinely
  list-shaped sections (Required Information, Care Actions, Evidence); everything else is real scalar/
  array columns on the version. No section was collapsed into an opaque JSON blob.
- **"CIF may reference: PIF, PrIF, Products, Policies, SOPs, Knowledge Foundation. Do not duplicate":**
  four many-to-many relations implement this exactly, with `relatedKnowledgeItems` alone covering
  Policies/SOPs/Knowledge Foundation via Module 1's existing `KnowledgeItem.fileType`. Verified live:
  deleting a `CareIntelligence` item does not delete the `Product` it referenced.
- **"Published versions immutable... Do not redesign previous modules":** confirmed no Module 1–3 file
  was edited; `KnowledgeLayer` and `ProblemConfidenceLevel` are imported/reused, not redefined.
  Immutability verified live exactly as in Modules 2–3.
- **Reuse the existing audit architecture:** the ordered version list per item is the audit trail
  (author/reviewer/publisher + timestamps), same idiom as every prior module — no competing audit table
  was introduced.

## 3. Files Created

| File | Purpose |
|---|---|
| `lib/validations/care-intelligence.ts` | Every Zod schema plus `CARE_INTELLIGENCE_ALLOWED_TRANSITIONS` |
| `actions/care-intelligence.ts` | 10 `"use server"` actions plus shared helpers (`loadEditableVersion`, `deepCopyCareVersion`, `scalarVersionFields`, `nextVersionNumber`) |
| `docs/phase-4/care-intelligence-foundation/README.md` | Overview |
| `docs/phase-4/care-intelligence-foundation/architecture.md` | Design decisions, including the Module 3 comparison |
| `docs/phase-4/care-intelligence-foundation/workflow-guide.md` | Lifecycle |
| `docs/phase-4/care-intelligence-foundation/data-model.md` | Full schema reference |
| `docs/phase-4/care-intelligence-foundation/permissions.md` | Layer A/B/C boundaries |
| `docs/phase-4/care-intelligence-foundation/api-reference.md` | Every action's auth/request/response |
| `docs/phase-4/care-intelligence-foundation/testing.md` | Exact commands and results |
| `docs/phase-4/care-intelligence-foundation/known-limitations.md` | Honest gaps |
| `docs/phase-4/care-intelligence-foundation/implementation-report.md` | This file |

## 4. Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 3 new enums, `CareIntelligence`, `CareIntelligenceVersion`, and 3 child models; added 4 new back-relation fields to `User`; added 1 new back-relation field to `Product`, `ProductIntelligence`, and `ProblemIntelligence` each; added 1 new back-relation field to `KnowledgeItem` |

No file belonging to Module 1, 2, or 3's own scope was modified. **Note:** while this module was being
built, an unrelated schema change (a Sales Organization data model — `SalesRole`, `SalesPermission`,
`Territory`, `SalesAuditLog`, and new fields on `User`) was added to `prisma/schema.prisma` by another
process. It was not reverted (not this module's concern), and the schema was re-validated/re-pushed/
regenerated after it appeared to confirm the combined file (this module's additions plus that concurrent
change) is still consistent — `npx prisma validate` and `npx tsc --noEmit` both passed clean afterward.

## 5. Dependencies

**None added.**

## 6. Configuration Changes

**None.**

## 7. Database Changes

Applied via `npx prisma db push --skip-generate` (additive, non-destructive) and `npx prisma generate`
— run twice during this module (once for this module's own additions, once more after the concurrent
Sales-org schema change landed, to keep the database and client in sync with the full current file).
Both runs reported "database now in sync," zero data-loss warnings.

- **Models added (5):** `CareIntelligence`, `CareIntelligenceVersion`, `CareRequiredInformation`,
  `CareAction`, `CareEvidenceSource`.
- **Enums added (3):** `CareIntelligenceStatus`, `CarePriority`, `CareResolutionCondition`.
- **Relationships:** every child table → `CareIntelligenceVersion` (cascade delete); four implicit
  many-to-many relations from `CareIntelligenceVersion` to `Product`, `ProductIntelligence`,
  `ProblemIntelligence`, `KnowledgeItem`; four distinct named relations from `CareIntelligenceVersion`/
  `CareEvidenceSource` to `User`. Full detail in `data-model.md`.
- **Indexes:** `@@unique([careIntelligenceId, versionNumber])`; `@@index` on every child table's
  `versionId`; `@@index([layer])` on the item table; `@@index([careIntelligenceId, status])` on the
  version table.
- **Migration status:** no migration file generated (project convention, unchanged).
- **Data-loss risk:** none — purely additive.

## 8. APIs Added

10 Server Actions in `actions/care-intelligence.ts`, exactly matching this module's own named list:
`createCareIntelligence`, `updateCareIntelligence`, `publishCareIntelligence`,
`archiveCareIntelligence`, `restoreCareIntelligence`, `duplicateCareIntelligence`,
`getCareIntelligence`, `listCareIntelligence`, `getPublishedCareIntelligence`,
`getCareVersionHistory` — no additions beyond the literal list this time (contrast with Module 3, where
`addProblemCommonMistake` was added beyond its list; see `api-reference.md` for full detail). Every
action validates via Zod and independently re-derives its own RBAC.

## 9. Tests

Full detail and exact output in `testing.md`. Summary: `prisma validate`/`db push`/`generate` all clean
(twice, due to the concurrent schema change); `tsc --noEmit` clean (three runs, zero errors each time);
`npm run build` clean. Manual `npx tsx` script against the real database: **29 checks, 29 passed, 0
failed**, covering draft creation, all three structured child sections plus all four relation types,
full-replace vs. leave-untouched update semantics specifically, the implicit REVIEW→DRAFT revert-on-edit
behavior, publish/archive/duplicate/restore, immutability, version history, one-published-version
enforcement, item- and field-level Layer boundary enforcement, invalid-reference rejection, and
reference-safe cascade delete (the related `Product` was confirmed to survive its referencing
`CareIntelligence` being deleted). Not tested: RBAC branches against a real session, concurrent-publish
races, exhaustive enum-value coverage (e.g. `URGENT` priority was never assigned in the test run).

## 10. Known Limitations

Full detail in `known-limitations.md`. Headline items: no admin UI; no per-child-section granular
editing (a direct, disclosed consequence of this module's own 10-action scope — full-array-replace only);
RBAC branches type-checked but not live-tested; no DB-level partial-unique constraint for "one published
version" (transaction-only, same as every prior module); Institutional Sales support is structural
(category/segment tagging) rather than domain-specific (no dedicated quotation/contract fields, since
none were itemized in the spec); cross-module relation includes are shallow by design.

## 11. Architecture Recommendations

**Problem:** Same standing observation as Modules 1–3 — no test runner exists, so every module's "Tests"
section is a manual transcript.

**Additional observation specific to this module:** the "full-array-replace" update semantics
(§`architecture.md`) work well for a script or a future AI-assisted authoring tool that always has the
complete current state in hand, but will be awkward for a hand-built admin form unless that form is
built to always submit the complete `requiredInformation`/`careActions`/`evidenceSources` arrays on every
save (not a per-row save). Worth deciding explicitly, rather than discovering it mid-build, when the
Module 1–4 Admin UI (recommended below) reaches this module's forms specifically.

**Suggested improvement / Advantages / Disadvantages / Risk / Compatibility:** unchanged from prior
reports — introduce `vitest`; low-risk, additive, fully compatible. Not applied automatically.

## 12. Next Recommended Module

Unchanged from the Module 3 report, now with a fourth foundation added to the pile: **the Admin UI
covering Modules 1–4 together** (Knowledge Manager + Product Intelligence Manager + Problem Intelligence
Manager + Care Intelligence Manager). Four foundations, **49 total server actions** — recounted directly
from each file rather than from memory (`grep -c "^export async function"`): 8 in `actions/knowledge.ts`
(Module 1), 8 in `actions/product-intelligence.ts` (Module 2), 23 in `actions/problem-intelligence.ts`
(Module 3), 10 in `actions/care-intelligence.ts` (Module 4) — zero human-usable interface for any of
them.

**Correction to the Module 3 report:** that report's §8 stated "22 Server Actions," flagging
`addProblemCommonMistake` as the one addition beyond that module's literal 21-action list. Recounting
just now for this arithmetic turned up a second, unflagged addition from the same module —
`changeProblemIntelligenceLayer` (mirroring Module 2's `updateProductIntelligenceLayer`, not named in
Module 3's own spec) — making the real total 23, not 22. The function itself was always there, correctly
implemented and tested; only the count and the "what's beyond the literal list" disclosure in that
report's §8 were wrong. Not silently fixed after the fact — recorded here, plainly, since Module 3's
report has already been delivered.

This module's own full-array-replace update semantics (§11) specifically need a real UI design decision
before staff can use this module at all — building the UI now would surface that decision directly,
rather than guessing it during a future module with no working form to test against.

Waiting for founder review and approval before proceeding.
