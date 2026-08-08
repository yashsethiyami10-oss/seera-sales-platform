# API Reference

All 23 functions below live in `actions/problem-intelligence.ts` as Next.js Server Actions (`"use
server"`), not `app/api/*` routes — 21 from this module's own literal Required Operations list, plus
`addProblemCommonMistake` and `changeProblemIntelligenceLayer`, both built beyond that list (see
`implementation-report.md` §8 for why) — consistent with this project's established convention (CSRF
protection via Origin-checking on Server Actions, documented in `CLAUDE.md`). Every function
independently validates its input through the matching Zod schema in
`lib/validations/problem-intelligence.ts` and independently re-derives its own auth — no function trusts
that a caller elsewhere already checked.

## Core item / version lifecycle

| Action | Auth | Request | Response |
|---|---|---|---|
| `createProblemIntelligence` | `STAFF`; `ADMIN` if `layer=CONFIDENTIAL` | `{ slug, layer, content: {...}, changeNote? }` | `{ success, data: { id, slug } }` — `409` on duplicate slug |
| `createProblemIntelligenceVersion` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ problemIntelligenceId, content: {...}, changeNote? }` | `{ success, data: { id, versionNumber } }` |
| `updateProblemIntelligenceDraft` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ versionId, content: {partial}, changeNote? }` | `{ success, data: { id } }` — `400 VERSION_NOT_EDITABLE` if not DRAFT/REVIEW; editing a REVIEW version returns it to DRAFT |
| `submitProblemIntelligenceForReview` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ versionId }` | `{ success, data: { status: "REVIEW" } }` |
| `publishProblemIntelligence` | `ADMIN` only | `{ versionId }` | `{ success, data: { status: "PUBLISHED" } }` — `400 INVALID_TRANSITION` unless currently `REVIEW` |
| `archiveProblemIntelligence` | `STAFF` for DRAFT/REVIEW; `ADMIN` for PUBLISHED, or if item `CONFIDENTIAL` | `{ versionId, reason? }` | `{ success, data: { status: "ARCHIVED" } }` |
| `restoreProblemIntelligence` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ problemIntelligenceId, archivedVersionId, changeNote? }` | `{ success, data: { id, versionNumber } }` — `400 NOT_ARCHIVED` unless the source is actually `ARCHIVED` |
| `duplicateProblemIntelligenceDraft` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ problemIntelligenceId, sourceVersionId?, changeNote? }` | `{ success, data: { id, versionNumber } }` — omitting `sourceVersionId` copies the latest version regardless of status |
| `changeProblemIntelligenceLayer` | `ADMIN` only | `{ problemIntelligenceId, layer }` | `{ success, data: { id } }` |

## Retrieval

| Action | Auth | Request | Response |
|---|---|---|---|
| `getProblemIntelligence` | `STAFF` | `id: string` | `{ success, data: ProblemIntelligence & { versions: [...full detail, every layer...] } }` |
| `listProblemIntelligence` | `STAFF` | `{ page?, pageSize?, layer?, status? }` | `{ success, data: [...], pagination }` |
| `getProblemIntelligenceVersionHistory` | `STAFF` | `problemIntelligenceId: string` | `{ success, data: ProblemIntelligenceVersion[] }` (metadata only — no child sections) |
| `getPublishedProblemIntelligence` | none (public) | `{ slug?, tag? }` | `{ success, data: [...] }` — `layer: PUBLIC` + `status: PUBLISHED` hardcoded server-side; curated field selection (see [permissions.md](./permissions.md)) |

## Structured child sections

Every `addProblem*` action below shares the same shape: `STAFF`-gated (`ADMIN` if the parent item is
`CONFIDENTIAL`), requires the target `versionId` to currently be `DRAFT` or `REVIEW`
(`VERSION_NOT_EDITABLE` otherwise), validates its own Zod schema, and returns `{ success, data: { id } }`.

Nine of the ten below (all except `addProblemCommonMistake`) are named explicitly in the module's own
Server Actions list. `addProblemCommonMistake` was added anyway, beyond that literal list — see
`implementation-report.md` §8 for why.

| Action | Request (beyond `versionId`) |
|---|---|
| `addProblemSymptom` | `title, description?, severity?, isRequired?, displayOrder?, customerLanguageVariations?, internalNotes?` |
| `addProblemCause` | `title, explanation?, likelihood?, evidenceIndicators?, confirmingQuestionIds?, internalNotes?, displayOrder?` — `400 INVALID_REFERENCE` if any question id doesn't belong to the same version |
| `addProblemDiagnosticQuestion` | `questionText, purpose?, answerType, isRequired?, validationRules?, followUpConditions?, displayOrder?, audience?, options?` — `SINGLE_SELECT`/`MULTI_SELECT` require at least one option |
| `addProblemCommonMistake` *(beyond the literal list, see above)* | `title, explanation?, consequence?, correction?, severity?, displayOrder?` |
| `addProblemProductRelationship` | `productId, productIntelligenceId?, suitability, reason?, conditionsRequired?, usageNotes?, priority?, confidence?, customerFacingExplanation?, internalRationale?, overrideJustification?` — `409 RECOMMENDATION_EXCLUSION_CONFLICT` if the product (or its category) is already excluded in this version and `suitability != NOT_RECOMMENDED` without `overrideJustification` |
| `addProblemExclusionRule` | `productId?, categoryId? (at least one required), reason, condition?, severity?, customerFacingWarning?, internalNotes?, escalationRequired?` |
| `addProblemUsageGuidance` | `productId?, productIntelligenceId?, stepTitle, instructions, quantityOrDilution?, frequency?, duration?, expectedTiming?, safetyNote?, displayOrder?` |
| `addProblemExpectedOutcome` | `description, expectedTimeframe?, conditions?, limitations?, confidenceLevel?, customerFacingWording?, internalEvidenceNotes?, displayOrder?` |
| `addProblemPreventionGuidance` | `title, guidance, frequency?, applicableContext?, displayOrder?` |
| `addProblemSafetyRule` | `title, condition?, riskLevel?, escalationRequired?, disclaimerText?, internalNotes?, displayOrder?` |

## Not implemented in this module

`addProblemEvidenceSource` was **not** built, even though `ProblemEvidenceSource` exists as a model
(required by the Database Requirements section). Neither the module's Validation section nor its Server
Actions section named a create/add action for it — see [known-limitations.md](./known-limitations.md)
for why this was treated as intentional scope, not an oversight.
