# Version Lifecycle

```
DRAFT
  ↓
REVIEW
  ↓
PUBLISHED
  ↓
ARCHIVED
```

Enforced by `PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS` in `lib/validations/problem-intelligence.ts`,
checked by every transition-causing action before it touches the database:

```
DRAFT     -> REVIEW, ARCHIVED
REVIEW    -> DRAFT, PUBLISHED, ARCHIVED
PUBLISHED -> ARCHIVED
ARCHIVED  -> (terminal — no transitions out)
```

## Rules, and where each is enforced

| Rule | Enforcement |
|---|---|
| A draft cannot be published directly | `DRAFT` is not in `PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS.DRAFT`'s allowed targets for `PUBLISHED` — must pass through `REVIEW` first. Verified live (see testing.md). |
| Published versions are immutable | `loadEditableVersion()` throws `VERSION_NOT_EDITABLE` for any version whose status isn't `DRAFT`/`REVIEW`, called first by `updateProblemIntelligenceDraft` and every `addProblem*` child-section action. |
| A published record must never be overwritten | Corrections always create a *new* version — `duplicateProblemIntelligenceDraft` (from the current version) or `restoreProblemIntelligence` (from a specific archived one). Neither ever mutates the source row. Verified live: after publishing a corrected v2, v1's content remained byte-identical. |
| Only one current published version per logical PrIF | `publishProblemIntelligence` archives whatever is currently `PUBLISHED` for the same item inside the same `$transaction` as publishing the new one. Verified live. |
| Historical versions remain available | Nothing is ever deleted by a status transition — `ARCHIVED` is a status, not a deletion. `getProblemIntelligenceVersionHistory` returns every version regardless of status. |
| Invalid transitions are rejected | Every transition action checks `PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS` and throws `INVALID_TRANSITION` (400) if the target isn't allowed from the current status. |
| Archive preserves history | `archiveProblemIntelligence` only ever sets `status`/`archivedAt` — the row and every one of its child sections stay in place. Verified live: exclusion rules on an archived version were confirmed still present after archiving. |
| Restoring archived content must not silently overwrite a current published version | `restoreProblemIntelligence` only ever `create`s a new `DRAFT` version — it has no code path that touches whatever is currently `PUBLISHED`. |

## Editing a `REVIEW`-status version sends it back to `DRAFT`

Not stated outright by the spec, but a reasonable reading of its own action list: there's no separately
named "send back for changes" action, and `updateProblemIntelligenceDraft` is explicitly meant to edit a
draft. So editing a version currently in `REVIEW` implicitly moves it back to `DRAFT` as part of the same
call — a version that's being edited again is, by definition, no longer in a reviewed-and-ready state.
This is the one lifecycle behavior in this module that isn't a direct restatement of the spec; it's
documented here, in [architecture.md](./architecture.md), and in the code comment on
`updateProblemIntelligenceDraft` itself.

## Reviewed by / Approved by

`publishProblemIntelligence` sets `reviewedById`/`reviewedAt` and `publishedById`/`publishedAt` together,
to the same admin, at the same moment — see [architecture.md](./architecture.md) for why they're still
two separate column-pairs rather than one.

## Atomicity

`publishProblemIntelligence` wraps "archive the currently-published version" and "publish the new one"
in a single `prisma.$transaction`. There is no database-level constraint (partial unique index) backing
this beyond the transaction itself — see [known-limitations.md](./known-limitations.md).
