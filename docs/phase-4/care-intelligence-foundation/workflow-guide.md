# Workflow Guide (Version Lifecycle)

```
DRAFT
  ↓
REVIEW
  ↓
PUBLISHED
  ↓
ARCHIVED
```

Enforced by `CARE_INTELLIGENCE_ALLOWED_TRANSITIONS` in `lib/validations/care-intelligence.ts`:

```
DRAFT     -> REVIEW, ARCHIVED
REVIEW    -> DRAFT, PUBLISHED, ARCHIVED
PUBLISHED -> ARCHIVED
ARCHIVED  -> (terminal)
```

## How a workflow moves through it

1. **`createCareIntelligence`** — creates the item and its v1, always `DRAFT`. Full content (identity,
   situation, objectives, escalation snapshot, communication guidance, required information, care
   actions, evidence sources, related-entity references) is supplied in one call.
2. **`updateCareIntelligence`** — edits a `DRAFT`/`REVIEW` version. Pass `status: "REVIEW"` to submit it
   for review (there's no separate action for this — see `architecture.md`). Editing content on a
   `REVIEW` version without explicitly reaffirming `status: "REVIEW"` silently returns it to `DRAFT`.
3. **`publishCareIntelligence`** — admin-only. Requires the version to currently be `REVIEW`. Atomically
   archives whatever was previously `PUBLISHED` for the same item and publishes the new one.
4. **`archiveCareIntelligence`** — discards a `DRAFT`/`REVIEW` version (staff-level) or un-publishes a
   live one (admin-only). History is never deleted — only the `status` changes.
5. **To correct published content:** `duplicateCareIntelligence` (copy the current or a specified
   version into a new `DRAFT`), edit it via `updateCareIntelligence`, then publish it — never edit the
   published row directly; there is no code path that allows that.
6. **`restoreCareIntelligence`** — specifically revives an `ARCHIVED` version as a new `DRAFT`. Distinct
   from `duplicateCareIntelligence`: requires the source to actually be `ARCHIVED`
   (`400 NOT_ARCHIVED` otherwise), and — verified live — never touches whatever is currently
   `PUBLISHED` while doing so.

## Rules and where each is enforced

| Rule | Enforcement |
|---|---|
| Published versions are immutable | `loadEditableVersion()` throws `VERSION_NOT_EDITABLE` for any non-`DRAFT`/`REVIEW` version, called first by `updateCareIntelligence`. Verified live. |
| A published record must never be overwritten | Corrections always create a new version via `duplicateCareIntelligence`/`restoreCareIntelligence`; neither ever mutates the source row. Verified live: v1's content stayed intact after v2 was published. |
| Only one current published version per item | `publishCareIntelligence` archives the prior published version in the same transaction as publishing the new one. Verified live. |
| Historical versions remain available | Archiving only changes `status`/`archivedAt` — nothing is deleted. `getCareVersionHistory` returns every version. |
| Invalid transitions rejected | Every transition-causing action checks `CARE_INTELLIGENCE_ALLOWED_TRANSITIONS` and throws `400 INVALID_TRANSITION` otherwise. |
| Restoring must not silently overwrite the current published version | `restoreCareIntelligence` only ever `create`s a new row. Verified live. |

## Reviewed by / Published by

Same documented assumption as Module 3: this lifecycle has no distinct reviewer-then-separate-publisher
hand-off — `publishCareIntelligence` sets `reviewedById`/`reviewedAt` and `publishedById`/`publishedAt`
together, to the same admin, at the same moment. Kept as two separate column-pairs so a future lifecycle
change could make them diverge without a schema change.
