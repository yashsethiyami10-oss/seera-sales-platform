# Domain 1 — Relationship Integrity Audit

> Covers all 5 chapters, 37 Knowledge Objects. Figures below are counted directly from each
> chapter's `json/relationships.json`, not estimated.

---

## Relationship counts (verified via PowerShell across all 5 `relationships.json` files)

| Chapter | Intra-chapter | Cross-chapter | Forward (to future work) |
|---|---|---|---|
| 1 — Brand Origin & Naming | 10 | 0 | 2 |
| 2 — Logo & Mark System | 10 | 3 | 3 |
| 3 — Language, Pronunciation & Tagline | 9 | 4 | 2 |
| 4 — Identity Governance | 10 | 4 | 4 |
| 5 — Brand Decision History | 9 | 5 | 1 |
| **Total** | **48** | **16** | **12** |

## Orphan check

**PASS** — every one of the 37 KOs appears in at least one relationship (verified per-chapter in
each chapter's own `04_relationships.md`/`relationships.json` orphan check, all reporting PASS).

## Circular dependency check

**PASS** — all 5 chapters' `dependencies.json` report `circularDependencyCheck: PASS`
independently; no KO anywhere in the domain depends, even indirectly, on a KO that depends on it.

## Forward-relationship fulfillment tracking

Of the 12 forward relationships recorded across the domain, **4 pointed to a later chapter
within this same domain and were tracked to fulfillment**:

| Predicted in | Relationship | Fulfilled in |
|---|---|---|
| Chapter 1 (`KO-BI-CH1-005`) | will be extended by Brand Personality | Chapter 2 (`KO-BI-CH2-002`) — ✅ fulfilled |
| Chapter 1 (`KO-BI-CH1-001`) | will be extended by Keep Muving™ Philosophy | Chapter 3 (`KO-BI-CH3-005`) — ✅ fulfilled |
| Chapter 2 (`KO-BI-CH2-003`) | will be extended by Identity Governance | Chapter 4 (`KO-BI-CH4-004`, `KO-BI-CH4-005`) — ✅ fulfilled |
| Chapter 2 (`KO-BI-CH2-004`) Core Logo Rule 9 | will be operationalized by | Chapter 4 (`KO-BI-CH4-008`, Identity Change Control) — ✅ fulfilled |

**All 4 within-domain forward relationships were correctly fulfilled** — every prediction made
in an earlier chapter about a later chapter in this same domain came true, confirmed by direct
cross-reference in the later chapter's own content, not merely asserted.

The remaining **8 forward relationships point to future Domains** (2, 4, 5, 6, 7 — none yet
started) and correctly remain **pending**, not fulfilled — this is the expected state, not a gap.

## One backward relationship (new type, correctly labeled)

`KO-BI-CH5-002` (Identity Decision States, Chapter 5) **retroactively grounds** two earlier,
informal usages: `KO-BI-CH1-005`'s "exploratory" positioning claim and `KO-BI-CH4-002`'s
"exploratory" colour list. This is the domain's only backward relationship — it reflects a real
fact about the source document's own chapter ordering (the term "exploratory" is used in
Chapters 11 and 14 before being formally defined in Chapter 15), not an error in this
repository's authoring order. Recorded explicitly as backward, never disguised as forward.

## Cross-chapter reference-not-duplicate discipline

16 cross-chapter relationships were recorded; the "Premium" reference chain
(`KO-BI-CH1-006` → `KO-BI-CH2-002` → `KO-BI-CH3-003` → `KO-BI-CH4-001`) is the domain's longest
reference chain, spanning 4 of 5 chapters without the underlying conflict record ever being
duplicated — confirmed by direct text inspection: only `KO-BI-CH1-006` contains the full
conflict record; every later reference is a citation.

## Result: PASS

Zero orphans, zero circular relationships, all within-domain forward predictions fulfilled,
all cross-domain forward predictions correctly left pending, one backward relationship correctly
identified and labeled.
