# Permissions

CIF reuses Module 1's `KnowledgeLayer` directly — `PUBLIC` (Layer A), `INTERNAL` (Layer B),
`CONFIDENTIAL` (Layer C) — at the item level (`CareIntelligence.layer`), same granularity Modules 1–3
established.

## Item-level boundary

| Layer | Who can read | Who can write |
|---|---|---|
| `PUBLIC` | Anyone via `getPublishedCareIntelligence` (no auth), plus staff | Staff (layer changes are always admin-only) |
| `INTERNAL` | Staff only | Staff |
| `CONFIDENTIAL` | Admin only, every step from creation onward | Admin only |

Layer changes happen via `updateCareIntelligence`'s optional `layer` field, not a separate action (this
module names no dedicated layer-change action) — but the rule is identical to Modules 2–3: a layer
change is always admin-only, checked before the field is ever written.

## Field-level boundary — "no confidential workflow may leak through public retrieval"

`getPublishedCareIntelligence`'s `select` clause is the actual enforcement point. Care Actions and
Communication Guidance are internal by construction — they are staff/future-CQ-Engine procedure
documentation ("store guidance only, do not generate responses"), never something shown to a customer
verbatim — so they are excluded from the public projection **entirely**, the same way Module 3 excluded
raw diagnostic questions from its public path.

**Included in the public projection:** `title`, `category`, `summary`, `situationDescription`,
`situationTags`, `careObjectives`, `applicableResolutionConditions`, `followUpGuidance`,
`maxWaitingPeriod`, `applicableCustomerSegments`, `publishedAt`, `requiredInformation` (telling a
customer what to have ready — e.g. "Order Number" — is helpful and non-sensitive).

**Never included, regardless of item layer:** `careActions` (internal staff procedure), every
communication-guidance field (`communicationTone`, `thingsToAvoid`, `mandatoryStatements`,
`optionalGuidance`, `transparencyRules` — guidance *for* staff, not *to* the customer), every
escalation field (`escalationReason`, `escalationTeam`, `escalationSla`,
`escalationInternalNotes` — operational handling detail), `reminderInterval`/`closureConditions`
(internal cadence, distinct from the customer-facing `followUpGuidance`/`maxWaitingPeriod`, which *are*
included), and `evidenceSources` entirely.

Verified live: a `CONFIDENTIAL`-layer test item was confirmed absent from the Layer-`PUBLIC` query, and
the public projection's field list was checked against the internal-only field names to confirm zero
overlap.

## Staff vs. admin (function-level)

| Admin-only, always | Reason |
|---|---|
| `publishCareIntelligence` | The action that makes content live |
| `archiveCareIntelligence`, when archiving a currently-`PUBLISHED` version | Un-publishing live content |
| `updateCareIntelligence`, when its `layer` field is present and changes the item's current layer | Re-classifying a permission boundary |

Every other action is `requireStaff()`-gated, further restricted to `ADMIN` whenever the item's own
layer is `CONFIDENTIAL` — enforced by `loadEditableVersion()`'s shared guard for edit-path actions, and
by an explicit item-layer check in `duplicateCareIntelligence`/`restoreCareIntelligence`.

## What was and wasn't live-tested

Verified live: the item-level layer boundary and the field-level projection exclusion. **Not**
live-tested: the `STAFF`-vs-`ADMIN` branch logic itself, against a real authenticated session — same
disclosed limitation as every prior module, for the same reason (no test runner in this repository).
