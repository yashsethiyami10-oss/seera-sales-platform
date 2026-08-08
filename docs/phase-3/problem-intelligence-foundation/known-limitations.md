# Known Limitations

Stated plainly, per the module's own "do not claim coverage that wasn't executed" rule.

## No admin UI
Same gap as Modules 1 and 2. Twenty-one server actions exist with no human-usable caller — everything
in this module was verified by direct script, not a real form. Recommended as a future module (see
[implementation-report.md](./implementation-report.md) §12).

## `addProblemEvidenceSource` doesn't exist — but `addProblemCommonMistake` does
`ProblemEvidenceSource` is a real, migrated model (required by the module's Database Requirements
section, and Section 13 of the PrIF Structure), but no create/add action was built for it. Both the
module's Validation section and its Server Actions section list every other child-section "add" action
by name and omit this one consistently.

Strictly, "Common Mistakes" (Section 6 of the PrIF Structure) is in the exact same position —
also a required structured section, also absent from both the Validation and Server Actions lists. The
two were **not** treated symmetrically: `addProblemCommonMistake` was built anyway (making 22 actions
total against a literal list of 21), on the judgment that leaving a section this central to the module's
own Core Principle ("what mistakes people commonly make") with no way to populate it at all was a bigger
functional gap than matching the list exactly, whereas evidence/source tracking reads as a more
internal-only, secondary concern less central to that same Core Principle. This is a judgment call, made
and disclosed, not a hidden inconsistency — the founder may reasonably decide either action should be
added or removed to restore literal 1:1 compliance with the spec's list. If evidence-source tracking
needs to be populated through the app, it's a small, well-scoped addition mirroring any of the ten
existing `addProblem*` actions almost exactly.

## RBAC branch logic not live-tested
Every `STAFF`/`ADMIN` gate is implemented and type-checked but not exercised against a real
authenticated session — this project has no test runner to script that with. Same disclosed limitation
as Modules 1 and 2.

## No database-level "one published version" constraint
Enforced by a `$transaction` in `publishProblemIntelligence`, not a partial-unique index — Prisma's
schema DSL doesn't support one, and this project uses `db push`, not hand-written migrations. Under
default Postgres `READ COMMITTED` isolation, this is a reasonable but not mathematically airtight
guarantee against two truly simultaneous publish calls for the same item. Same limitation Modules 1 and
2 already carry.

## `prohibitedRecommendation` not exercised as `true` in testing
The field exists, is typed, and was included in the version-content schema, but the verification script
only ever left it at its default `false`. Not a design gap — just an untested value, noted for
completeness per this module's honesty requirement.

## No semantic/AI retrieval, no Decision Engine, no Safety Engine execution
Explicitly out of scope for this module, per its own instructions. `getPublishedProblemIntelligence` is
a plain structured read with a hardcoded permission filter — not AI retrieval. `ProblemProductRelationship`
and `ProblemExclusionRule` record candidate signals for a future Decision Intelligence module to weigh —
this module makes no recommendation decisions. `ProblemSafetyRule` and the version-level safety snapshot
are structured data for a future Safety Engine to act on — nothing here executes an escalation.

## `problemCategory` has no fixed vocabulary
Modeled as free text (`String?`), not an enum, because the spec named the field but gave no suggested
value list (unlike risk level, confidence level, suitability, etc., which all came with explicit
suggested enums). Inventing an unrequested taxonomy was avoided per "Do not invent MUV product facts" /
this module's own instruction to record reasonable assumptions rather than fabricate specifics.

## Diagnostic-question `validationRules`/`followUpConditions` shape is not enforced by Postgres
Both are `Json?` by design (variable shape depending on `answerType` — see
[architecture.md](./architecture.md)) and are passed through as `z.record(z.unknown())` at the Zod layer,
meaning malformed-but-structurally-valid JSON could be stored. Acceptable for a foundation module; a
future conversational-questioning module would be the natural place to add answer-type-specific
validation.

## Reviewed-by and published-by are always the same actor today
Both column-pairs exist (see [architecture.md](./architecture.md)'s "Reviewed by / Approved by" note),
but the current lifecycle only ever sets them together, at `publishProblemIntelligence`. They will always
be equal until a future lifecycle change introduces a distinct approval step.
