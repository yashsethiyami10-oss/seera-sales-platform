# MUV White Phenyl™ — Knowledge Reuse Summary

> **New mandatory report, introduced by `FR-003` (Knowledge Reuse First).** Before authoring any
> new Knowledge Object, this package was compared against the exact Founder-named subset: Floor
> Cleaner, Black Phenyl, Pure Bleach, Bathroom Cleaner, Glass Cleaner. Full JSON data in
> `11_JSON/knowledge_reuse.json`.

---

## What "reuse" means in this Knowledge Factory

Per `FOUNDER_RULES.md` FR-003's binding interpretation: reuse applies to **patterns, methodology,
and platform-grounded behavioral rules** — never to **product-specific facts**. A product's
formulation, safety text, pack sizes, and pricing are always independently sourced per product,
per the Never-Invent rule; what gets reused is the *shape* of how that information is organized
and validated, and the *behavioral rules* grounded in real, shared platform code.

---

## Parent Objects Reused — 17 Knowledge Objects

| Reused pattern | Origin | Used by |
|---|---|---|
| 8-field Care Response/Conversation structure (Situation/Customer Goal/Care Goal/Opening/Guidance/What to Avoid/Escalation/Closing) | Bathroom Cleaner (first introduced package) | All 12 `KO-WP-CONV-*` |
| Product-family identity table structure | `KO-BP-ARCH-001` (Black Phenyl) | `KO-WP-ARCH-001` |
| Naming-resolution mechanism (official name via direct Founder Instruction, legacy name preserved, never presented as unresolved) | Bathroom Cleaner ("Fresh") / Glass Cleaner ("Crystal") / Pure Bleach ("Pure") | `KO-WP-ARCH-003` |
| Cross-product "when another MUV product is more suitable" comparison-table methodology | `KO-BP-DT-003` (Black Phenyl) | `KO-WP-DT-003` |
| Emergency-guidance behavioral rule (never diagnose, always escalate, no invented remedy) | `KO-PB-SAFETY-013` (Pure Bleach), reused by `KO-BP-SAFETY-013` (Black Phenyl) | `KO-WP-SAFETY-013` |
| This package's own documented application of FR-003 itself | — | `KO-WP-FR-003` |

**Complete traceability:** every row above cites the specific originating package and, where
applicable, the specific KOID the pattern first appeared in — no reuse claim in this package is
unverifiable.

## Shared Objects — 3 Knowledge Objects

Grounded in real platform code shared across the entire Knowledge Factory, not tied to one
specific prior package — each package independently re-grounds these in the same underlying code
rather than copying from a sibling package:

| KOID | Grounded in |
|---|---|
| `KO-WP-FAQ-002` | `lib/intelligence/confidence-engine.ts` |
| `KO-WP-DT-004` | `lib/eios/cognitive-state.ts` |
| `KO-WP-INTEL-016` | `lib/eios/cognitive-state.ts` |

## New / Product-specific Objects — 45 Knowledge Objects

Everything else: the full formulation and process detail (`KO-WP-INTEL-001`–`011`, `014`),
independently-sourced safety text (`KO-WP-SAFETY-001`–`012`, minus the reused `013`), all 8
Objection Handling entries, the FAQ content itself, both product-fit decision trees not otherwise
reused (`KO-WP-DT-001`/`002`), the identity-confirmation and pack-size architecture facts
(`KO-WP-ARCH-002`), and 5 of the 7 Founder Rules application entries. None of this content is
copied from any other package — each fact traces to White Phenyl's own Product Chart rows and
SOP, independently extracted.

## Additional reused templates (file-level, not individual KOIDs)

| Template | Origin |
|---|---|
| `10_LIVE_DATA_MAPPING.md` 11-field commercial-resolution table | Black Phenyl (itself established during the `FR-002` remediation of the six legacy packages) |
| `14_FOUNDER_GAPS.md` priority-tiered register structure | Black Phenyl |
| Two-track Product Quality Score methodology (Process Quality vs. Content Completeness) | Pure Bleach |
| Commercial Data Grep Check validation methodology | Pure Bleach |

## Duplicate Knowledge Prevented

No product-specific fact (formulation, ingredient, safety text, pack size) was copied from any
other package. This was actively verified, not merely assumed: White Phenyl's safety text
(`KO-WP-SAFETY-001`) was directly compared, sentence-by-sentence, against Black Phenyl's — same
three-topic structure (PPE, ventilation, SDS reference), different verbatim wording, confirming
independent sourcing rather than a template copy-paste. Per this task's explicit instruction, no
safety guidance was carried over from any previous product without direct source support.

## Reuse Percentage

**30.8%** — (17 Parent Objects Reused + 3 Shared Objects) ÷ 65 total Knowledge Objects = 20/65.

This is presented honestly as a *methodology* reuse figure, not a *content* reuse figure. Under
strict Never-Invent, product-specific facts cannot be responsibly reused across products — the
69.2% of Knowledge Objects that are new/product-specific is the expected, correct outcome of
applying FR-003 without compromising the No-Invent discipline, not a sign that reuse wasn't
attempted.
