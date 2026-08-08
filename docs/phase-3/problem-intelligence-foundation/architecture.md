# Architecture

## Data ownership boundaries (per the frozen spec)

| Owner | Responsibility |
|---|---|
| Product system (`Product`, `ProductVariant`) | Product identity — name, price, catalog data |
| PIF (Module 2: `ProductIntelligence`) | Product intelligence — everything about one product |
| PrIF (Module 3: `ProblemIntelligence`) | Problem intelligence — everything about one customer situation |
| Future Decision Intelligence module | Recommendation *decisions* — PrIF only supplies candidate signals |

Each layer only ever *references* the one below it by id. None of them duplicate another's fields —
verified in [testing.md](./testing.md) ("Product data not duplicated onto relationship row").

## PIF vs. PrIF — the actual difference

| | PIF (Module 2) | PrIF (Module 3) |
|---|---|---|
| Organizing question | "What is this product?" | "What is this customer experiencing?" |
| Cardinality | One PIF per `Product` (unique FK) | Independent of any single product — a PrIF can reference zero, one, or several products |
| Content shape | 15 sections in one JSON blob per version | 14 structured sections, mostly as real normalized child tables |
| Typical consumer | "Tell me about MUV Shield" | "My clothes still smell after washing — what's going on, and is there anything safe to try?" |

A PrIF **references** PIF rows (`ProblemProductRelationship.productIntelligenceId`,
`ProblemUsageGuidance.productIntelligenceId`) when it needs to point at detailed product intelligence,
rather than restating it. Per the module's own explicit rule, PrIF and PIF are never merged into one
model.

## Why PrIF's sections are real tables, not one JSON blob

Module 2 (PIF) stores its 15 sections as a single `sections Json` column per version, because the spec
for that module explicitly optimized for "add a new section without a migration." Module 3's spec makes
the opposite tradeoff explicit: *"Avoid storing the entire PrIF as one uncontrolled JSON object... core
relationships, lifecycle fields, safety flags, status fields and permissions must remain strongly
modeled."* So PrIF's fourteen structured sections are (with two narrow exceptions) real Prisma models
with real foreign keys — see [data-model.md](./data-model.md) for the full list. The two exceptions
(`ProblemDiagnosticQuestion.validationRules`/`.followUpConditions`) use `Json?` deliberately, because
their shape is inherently variable by `answerType` (a `NUMBER` question's validation rules look nothing
like a `SCALE` question's) — the module's own spec allows "typed JSON only where justified," and this is
the one place that justification actually applies.

## The load-bearing design decision: where do child rows attach?

Every structured child table (`ProblemSymptom`, `ProblemCause`, `ProblemDiagnosticQuestion`,
`ProblemCommonMistake`, `ProblemProductRelationship`, `ProblemExclusionRule`, `ProblemUsageGuidance`,
`ProblemExpectedOutcome`, `ProblemPreventionGuidance`, `ProblemSafetyRule`, `ProblemEvidenceSource`) has
a `versionId` foreign key to `ProblemIntelligenceVersion` — **not** to `ProblemIntelligence` directly.

This is what makes two things true at once:

1. **"Published versions are immutable" actually holds for the structured sections, not just a
   top-level blob.** Once a version is `PUBLISHED`, none of its child rows can be edited — enforced by
   `loadEditableVersion()` in `actions/problem-intelligence.ts`, which every mutating action calls
   first.
2. **"Duplicate/restore a version" means "deep-copy every child row into new rows for a new version."**
   `deepCopyVersionChildren()` is the one place that logic lives, shared by both
   `duplicateProblemIntelligenceDraft` and `restoreProblemIntelligence` — diagnostic questions are
   copied first, building an old-id → new-id map, so that copied `ProblemCause` rows can reconnect their
   `confirmingQuestions` relation to the *new* version's questions, never the source version's. Verified
   directly in [testing.md](./testing.md).

## Two-tier safety modeling

`ProblemIntelligenceVersion` carries a single safety **snapshot** (`riskLevel`, `escalationRequired`,
`escalationReason`, `emergencyWarningText`, `humanReviewRequired`, `prohibitedRecommendation`,
`requiredDisclaimers`) — spec section 12 reads as singular per-version flags, not a repeatable list.
`ProblemSafetyRule` is a separate, repeatable table for distinct conditional rules (e.g. "if the surface
is unsealed wood, escalate" and "if used near an open flame, escalate" as two different rules within the
same problem) — matching the spec's own suggested model list. Neither replaces the other; they answer
different questions ("what's the overall risk posture of this problem?" vs. "what are the specific
conditions that change that posture?").

## Item vs. version split (mirrors Module 2's pattern)

- `ProblemIntelligence` — the stable, addressable item: `slug` (unique) and `layer` (Public/Internal/
  Confidential). Editable directly (layer changes are admin-only, same tier as publishing).
- `ProblemIntelligenceVersion` — one evolving unit of work: everything else, including every structured
  child table. Editable in place while `DRAFT`/`REVIEW`; permanently locked once `PUBLISHED`.

## No "current version" pointer field, on purpose

Consistent with Modules 1 and 2: there is no `currentVersionId` cached on `ProblemIntelligence`. "The
current published version" is always derived — `findFirst({ where: { problemIntelligenceId, status:
"PUBLISHED" } })` — never cached in a second field that could drift out of sync with reality. Same
reasoning applies to "previous version": it's `versionNumber - 1` for the same item, not a stored
self-relation.

## Reviewed by / Approved by — a documented assumption

Spec section 14 (Version Metadata) asks for both "Reviewed by" and "Approved by" as distinct fields.
This lifecycle has no distinct reviewer-then-separately-publisher hand-off — `publishProblemIntelligence`
is one admin-gated action — so `reviewedById`/`reviewedAt` and `publishedById`/`publishedAt` are set
together, by the same actor, at that one action today. They're kept as two separate column-pairs (not
collapsed into one) specifically so a future lifecycle change (e.g. inserting a distinct `APPROVED`
status between `REVIEW` and `PUBLISHED`) could make them diverge without a schema change. This is a
reasonable engineering assumption, not something the spec stated outright — recorded here per the
module's own "record reasonable assumptions" instruction.

## No database-level "only one published version" constraint

Prisma's schema DSL has no partial-unique-index syntax (`CREATE UNIQUE INDEX ... WHERE status =
'PUBLISHED'` has no Prisma equivalent as of this project's Prisma version), and this project uses
`prisma db push`, not hand-written migrations, where a raw-SQL constraint could otherwise be added. The
invariant is enforced by wrapping "archive whatever is currently published" and "publish the new one" in
a single `$transaction` inside `publishProblemIntelligence` — the same limitation Modules 1 and 2 already
carry, not a new gap introduced here. See [known-limitations.md](./known-limitations.md).
