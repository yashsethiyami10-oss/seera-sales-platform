# Architecture

## Item vs. version split (same shape as Modules 2–3)

- `CareIntelligence` — the stable, addressable item: `slug` (unique) and `layer` (Public/Internal/
  Confidential).
- `CareIntelligenceVersion` — one evolving unit of work. Editable in place while `DRAFT`/`REVIEW`,
  permanently locked once `PUBLISHED`. Every structured child table (`CareRequiredInformation`,
  `CareAction`, `CareEvidenceSource`) hangs off the version, not the item — same reason as Module 3: it's
  what makes "published is immutable" and "duplicate/restore" mean something real for the structured
  sections, not just top-level fields.

## Why this module has no per-section "add" actions, unlike Module 3

Module 3's spec named nine `addProblemX` actions explicitly. This module's Server Actions section names
exactly ten actions total — `createCareIntelligence`, `updateCareIntelligence`,
`publishCareIntelligence`, `archiveCareIntelligence`, `restoreCareIntelligence`,
`duplicateCareIntelligence`, `getCareIntelligence`, `listCareIntelligence`,
`getPublishedCareIntelligence`, `getCareVersionHistory` — with no equivalent per-child-row functions,
no separate `createCareIntelligenceVersion`, and no separate `submitForReview` action. That's a much
shorter, more consolidated list than Module 3's, and it was treated as a deliberate design signal, not
an oversight to patch over by inventing nine more actions to match Module 3's pattern.

Consequently:

- `createCareIntelligence` and `updateCareIntelligence` both accept the **full nested content** —
  `requiredInformation[]`, `careActions[]`, `evidenceSources[]`, plus four related-entity id arrays — in
  one payload.
- `updateCareIntelligence` uses **replace, not patch** semantics for each array: if an array key is
  present in the request, that section's existing rows for the version are deleted and recreated from
  the new payload, inside one transaction; if the key is *absent*, those rows are left untouched.
  Verified live: a `careActions`-only update left an untouched `requiredInformation` set exactly as it
  was, while the provided `careActions` set was fully replaced (not appended).
- There is no separate `createCareIntelligenceVersion` action — `duplicateCareIntelligence` is the only
  way to start a new version from an existing item, always by copying (the current version, or a
  specified one) rather than starting blank. This is a real behavioral difference from
  `createCareIntelligence` (item + v1, from scratch): every version after the first is born as a copy of
  something, then edited.
- There is no separate "submit for review" action. `updateCareIntelligence` accepts an optional `status`
  field restricted to `"DRAFT"` or `"REVIEW"` — this is how a draft is moved into review. If `status` is
  omitted and the version is currently `REVIEW`, editing its content **implicitly reverts it to
  `DRAFT`** — reviewed content that just changed is, by definition, no longer what was reviewed. This
  was verified live and is the one behavior in this module that isn't a direct field-for-field
  restatement of the spec; it's a reasoned choice, documented here and in the code comment on
  `updateCareIntelligence` itself, favoring "Human Accountability" over silently letting a `REVIEW`
  version drift out of sync with what was actually reviewed.

## Relationships — reference only, never duplicated

`CareIntelligenceVersion` has four many-to-many relations: `relatedProducts` (→ `Product`),
`relatedProductIntelligence` (→ Module 2's `ProductIntelligence`), `relatedProblemIntelligence` (→
Module 3's `ProblemIntelligence`), and `relatedKnowledgeItems` (→ Module 1's `KnowledgeItem`). The
fourth one is the direct answer to this module's own "CIF may reference... Policies, SOPs, Knowledge
Foundation" requirement — Module 1's `KnowledgeItem` already models exactly those three content types
(`fileType: POLICY | SOP | KNOWLEDGE_LIBRARY`), so no new, duplicate "policy reference" concept was
invented for CIF. Verified live: deleting a `CareIntelligence` item cascades its versions and their
child rows, but does **not** delete the `Product` it referenced — a reference is not ownership.

## `category` and `applicableCustomerSegments` are free text

Same reasoning as Module 3's `problemCategory`: the spec explicitly requires "new categories without
schema redesign" and gives a long example list (19 items), not a closed one. An enum would need a
migration every time a new category was needed, directly contradicting that requirement. The
institutional-sales category examples (Institutional Support, Distributor Support, Dealer Support,
Franchise Support) and the customer-segment examples (Hotels, Hospitals, Schools, ...) are both
representable through these same two free-text fields — no separate schema construct was built
specifically for institutional sales, since the existing extensible fields already cover it (see
`known-limitations.md` for what this deliberately does *not* do beyond that).

## Reused vocabulary, not redefined

- `KnowledgeLayer` (Module 1) — Layer A/B/C, used directly on `CareIntelligence.layer`.
- `ProblemConfidenceLevel` (Module 3) — reused for `CareEvidenceSource.confidence`, the same
  "never claim certainty" LOW/MODERATE/HIGH vocabulary, rather than defining a fourth near-identical
  enum across four modules.
- `CarePriority` (`LOW`/`MEDIUM`/`HIGH`/`URGENT`) and `CareResolutionCondition` (`RESOLVED`/`PENDING`/
  `WAITING_CUSTOMER`/`WAITING_TEAM`/`ESCALATED`/`CLOSED`/`CANCELLED`) are new to this module — the spec
  gave explicit suggested value lists for both, so they're modeled as real enums, not free text (unlike
  `category`, which had no suggested closed list).

## Publish atomicity and its limits

`publishCareIntelligence` archives whatever is currently `PUBLISHED` for the same item inside the same
`$transaction` as publishing the new version — same pattern, same disclosed limitation (no database-level
partial-unique constraint, Prisma's schema DSL doesn't support one and this project uses `db push`, not
hand-written migrations) as Modules 1–3.
