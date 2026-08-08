# Permissions

PrIF reuses Module 1's `KnowledgeLayer` enum directly — `PUBLIC` (Layer A), `INTERNAL` (Layer B),
`CONFIDENTIAL` (Layer C) — at the same whole-item granularity Module 1 established. The layer lives on
`ProblemIntelligence` (the stable item), not per-version.

## Item-level boundary

| Layer | Who can read it | Who can write it |
|---|---|---|
| `PUBLIC` | Anyone, via `getPublishedProblemIntelligence` (no auth) — plus any staff member | Staff (any non-layer-changing edit); layer changes are always admin-only |
| `INTERNAL` | Staff only — no function in this module exposes Internal-layer content publicly | Staff |
| `CONFIDENTIAL` | Admin only, at every step — not just publishing | Admin only, from creation through every edit, transition, and layer change |

`changeProblemIntelligenceLayer` is unconditionally `requireAdmin()`-gated — there is no staff-level path
to reclassify an item's layer in either direction, matching "Confidential content must require the
highest approved access level."

## Field-level boundary (within an otherwise-Public item)

The spec is explicit that Layer A "may include" certain content and Layer B/C certain other content —
this is a **field-level** distinction that exists *within* a single Public-layer PrIF, not just a
whole-item one. `getPublishedProblemIntelligence`'s Prisma `select` clause is the actual enforcement
point:

**Included in the public projection:**
`publicTitle`, `summary`, `tags`, `customerDescriptions`, `emergencyWarningText`, `requiredDisclaimers`,
symptom `title`/`description`/`customerLanguageVariations`, cause `title`/`explanation`/`likelihood`,
common-mistake fields, product-relationship `suitability`/`customerFacingExplanation` (never
`internalRationale`), exclusion-rule `customerFacingWarning` (never `reason`/`internalNotes`), usage
guidance, expected-outcome `customerFacingWording` (never `internalEvidenceNotes`), prevention guidance,
safety-rule `title`/`disclaimerText`/`riskLevel` (never `internalNotes`/`escalationRequired`'s
operational detail).

**Never included, regardless of item layer:**
- Every `internalNotes` / `internalRationale` / `internalHandlingNotes` field, on any child table.
- `escalationReason` and `humanReviewRequired` (operational handling detail, not customer-facing).
- `ProblemDiagnosticQuestion` and `ProblemQuestionOption` entirely — Section 5's own text is explicit
  that the *conversational* use of these is a future module's job; the public path doesn't hand raw
  diagnostic questions to a customer at all.
- `ProblemEvidenceSource` entirely — `internalOnly` defaults to `true` at the schema level specifically
  so evidence/sources are internal by default even before any query-level filtering happens.
- `overrideJustification` on `ProblemProductRelationship` — an internal accountability note, not
  customer-facing content.

Verified live: a `CONFIDENTIAL`-layer test item was confirmed absent from the Layer-`PUBLIC` query, and
the projection's field list was checked against the internal-field names to confirm none overlap. See
[testing.md](./testing.md).

## Staff vs. admin (function-level, not layer-level)

Independent of an item's layer, some actions require `ADMIN` regardless:

| Admin-only, always | Reason |
|---|---|
| `publishProblemIntelligence` | The one action that makes content live |
| `archiveProblemIntelligence`, when the version being archived is currently `PUBLISHED` | Un-publishing live content |
| `changeProblemIntelligenceLayer` | Re-classifying a permission boundary is a security decision, not routine editing |

Every other action (`createProblemIntelligence`, `createProblemIntelligenceVersion`,
`updateProblemIntelligenceDraft`, `submitProblemIntelligenceForReview`,
`duplicateProblemIntelligenceDraft`, `restoreProblemIntelligence`, every `addProblem*` child-section
action) is `requireStaff()`-gated, **further restricted to `ADMIN`** whenever the item's own layer is
`CONFIDENTIAL` — checked via `loadEditableVersion()`'s shared guard, so this rule lives in one place, not
copy-pasted across nine near-identical functions.

## What was and wasn't live-tested

Verified live against the real database (see [testing.md](./testing.md)): the item-level layer boundary
(a `CONFIDENTIAL` item is absent from the public query) and the field-level projection (internal field
names confirmed absent from the public `select`). **Not** live-tested: the `STAFF`-vs-`ADMIN` branch
logic itself, since that requires a real authenticated session and this project has no test runner to
script one — same disclosed limitation as Modules 1 and 2.
