# MUV Hand Wash™ — Requirements

> This package's own implementation spec, traceable to the Founder's instruction for Product
> Family 11. Recorded before authoring any Knowledge Object.

---

## Product scope

- **Product Family:** MUV Hand Wash™ (Category: **Personal Care**) — Parent product with **four
  variants**: Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield
- **Pack Sizes:** 250ml, 500ml, 5L — **not symmetric across variants.**
- **Founder-Verified Variant Availability Matrix** (authoritative, never inferred or expanded):

  | Variant | 250ml | 500ml | 5L |
  |---|---|---|---|
  | Silk Blossom | ❌ | ✅ | ✅ |
  | Ocean Fresh | ❌ | ✅ | ✅ |
  | Citrus Blast | ✅ | ✅ | ❌ |
  | Life Shield | ✅ | ✅ | ❌ |

  Exactly 8 real SKUs. Only these 8 Variant×Pack-Size combinations get Knowledge Objects — the
  Product Chart's own conflicting row (Citrus Blast 5L) is documented but never built; the Chart's
  silence on Silk Blossom 5L does not block building it, since the Founder's matrix is
  authoritative for this package (see `00_Source_Register.md` §1).
- **First Personal Care category product this session** — Safety Critical per `FR-005`.

## Governance to follow exactly

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`
  (`FR-001`–`FR-005`).
- Implementation only. No architecture changes.

## Mandatory execution order (21 steps)

Source Audit → Source Register → Requirement Analysis → Product Architecture → **Variant
Availability Architecture** (new step, distinct from Variant Inheritance) → Variant Inheritance
Architecture (`FR-004`) → Product Intelligence → Knowledge Objects → Decision Trees → Customer
Conversations → FAQs → Objection Handling → Safety → Founder Rules → LIVE_DATA_MAPPING →
FOUNDER_GAPS → JSON → Validation → Reports → MASTER Document → Freeze Recommendation.

## Mandatory rules applied throughout

1. **Never Invent**, extended per `FR-005` with three explicitly named forbidden claim
   categories: dermatological claims, antibacterial claims, skin-safe claims. Applies with
   particular force to Life Shield, whose name alone must never be read as an antibacterial or
   protective claim absent a real source (none was found — see `00_Source_Register.md` §9).
2. **Source First / Repository First.**
3. **Care Intelligence.** Truth → Safety → Care → Clarity → Actionability → Validation.
4. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).**
5. **Knowledge Reuse First (`FR-003`).** No specific prior-package subset was named in this task's
   instruction — this package compares against the full set of ten prior packages, with Body Wash
   (the only other `FR-004` package) and Floor Cleaner (the original Variant Inheritance
   precedent) given particular weight, and Body Wash's Safety Risk Flag methodology reused for
   honestly reporting a severe, category-defining content gap. Full account in
   `13_Reports/10_Knowledge_Reuse_Summary.md`.
6. **Variant Inheritance Architecture (`FR-004`).** Shared knowledge exists exactly once at Parent
   level. Only genuinely variant-specific knowledge exists in Variant Knowledge Objects. This
   product has **two** override points (colour AND fragrance, SOP Steps 9–10) — a real, sourced
   structural difference from both Floor Cleaner (colour only) and Body Wash (fragrance only).
7. **Variant Availability Architecture (`new`, first applied here).** Only the 8 Founder-verified
   Variant×Pack-Size combinations get Knowledge Objects. The 4 non-listed combinations (Silk
   Blossom 250ml, Ocean Fresh 250ml, Citrus Blast 5L, Life Shield 5L) are never created, never
   inferred, and never treated as merely "unsourced" (unlike Floor Cleaner's Rose Water) — they
   are absent by explicit Founder design. See `02_Product_Architecture.md` KO-HW-AVAIL-001.
8. **`FR-005` (Safety Critical Product Classification, first applied here).** Six mandatory
   documentation fields — Usage, Safety, Contraindications, First Aid, Storage, Shelf Life — each
   individually accounted for: sourced, or explicitly `Unknown — Founder Decision Required`.

## Personal Care requirements (specific to this package, per `FR-005`)

This is a Safety Critical Product. Mandatory documentation, each addressed by a dedicated
Knowledge Object: Usage (`03_Product_Intelligence.md` KO-HW-INTEL-003), Safety, Contraindications,
First Aid (eye/skin/ingestion), Storage, Shelf Life (all in `08_Safety.md`). Never invent
dermatological claims. Never invent antibacterial claims. Never invent skin-safe claims.

## Product Intelligence coverage required

Product purpose, cleansing mechanism, usage instructions, raw materials/formula, manufacturing
process, quality control, packaging/filling, fragrance and colour characteristics per variant,
pearl/visual effect, skin type suitability (only if verified), ingredient transparency, category
positioning, variant differentiation — `03_Product_Intelligence.md`. Never invent cosmetic,
dermatological, antibacterial, or skin-safe claims.

## Customer conversation flows required (12)

General product inquiry, pack size selection (availability-aware), fragrance/variant selection,
price inquiry (redirect to live data), availability inquiry (why a given size doesn't exist for a
given variant), ingredient inquiry, safety/skin-sensitivity inquiry, antibacterial-claim inquiry
(Life Shield — must not confirm an unverified claim), usage-instructions inquiry, comparison
request, complaint/quality-issue inquiry, shelf-life/storage inquiry — `05_Customer_Conversation.md`.

## Variant Intelligence required

Recommendation logic for Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield — recommend
variants only using verified differences (sourced fragrance + colour), and only within each
variant's real availability (never recommend a pack size that doesn't exist for that variant); do
not invent fragrance notes, emotional claims, or protective/antibacterial positioning —
`04_Decision_Trees.md`.

## Safety requirement

Include only verified safety information. Do not generate unsupported dermatological,
antibacterial, or skin-safe claims. Mark unsupported information as `Unknown — Founder Decision
Required`, field-by-field per `FR-005`. **This SOP contains zero sourced safety content of any
kind** — the same severity of gap found for Body Wash, now required to be documented per
individual mandatory field rather than as one general note — see `08_Safety.md` and
`14_FOUNDER_GAPS.md`.

## Knowledge Reuse requirement

Reuse verified Parent Knowledge Objects and methodology wherever appropriate; never reuse
unsupported facts. Generate a Knowledge Reuse Summary reporting both the `FR-004` structural
Parent/Variant split and the `FR-003` reuse-category split separately (established pattern from
Body Wash) — `13_Reports/10_Knowledge_Reuse_Summary.md`.

## Required end-of-package outputs (11)

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Variant Statistics
5. **Variant Availability Report** (new)
6. Source Coverage Report
7. Missing Knowledge Report
8. Product Quality Score
9. Care Intelligence Report
10. Knowledge Reuse Summary
11. Freeze Recommendation

All eleven live in `13_Reports/`.

## Stop Rule

After this package is complete: **STOP.** Do not begin Product Family 12 without explicit Founder
approval.
