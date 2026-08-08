# Chapter 1 — Knowledge Objects

> Every field of the Knowledge Object Standard is populated for every object — none omitted.

---

## KO-BI-CH1-001 — Brand Identity Foundation

- **Name:** Brand Identity Foundation
- **Purpose:** Establish what MUV fundamentally is, so any future AI describing the brand starts
  from the same real, sourced foundation.
- **Scope:** Brand existence, category scope, historical phrase evolution, the formal Brand
  Identity Statement.
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, §1 (lines ~1780–1830).
- **Outputs:** A structured identity-foundation fact set, consumable by any AI system that needs
  to introduce or describe the MUV brand.
- **Dependencies:** None (foundational — every other KO in this chapter and domain depends on
  this one, not the reverse).
- **Relationships:** Parent context for KO-BI-CH1-002/003/004/005. Referenced by Domain 1
  Chapters 2–5 (forward dependency, not yet built).
- **Governance Rules:** Per the source's own Message Protection rule (Ch.15 §20): "Do not invent
  Founder philosophy." This KO quotes, never paraphrases-as-if-original, the Brand Identity
  Statement.
- **Validation Rules:** Must cite exact source line range. Must not add category scope beyond
  what §1 states.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:**
- MUV was never conceived as a single-product label. The original brief covered fabric care,
  toilet and bathroom cleaning, floor care, car care, hand wash, and body wash.
- "Magic in Muv" was the earlier product-facing phrase; "Keep Muving" later became the dominant
  brand-wide expression.
- **Brand Identity Statement (verbatim):** *"Muv is a premium Indian cleaning and care brand
  designed to help people maintain cleaner, healthier, and more cared-for environments so they
  can Keep Muving."*

---

## KO-BI-CH1-002 — Brand Philosophy

- **Purpose:** Ground brand identity in its stated philosophical foundation, so brand messaging
  is never invented independent of it.
- **Scope:** The relationship between Volume I (MUV Darshan™) and Part III's application of it to
  identity specifically.
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, §2.
- **Outputs:** A pointer-plus-quote fact: brand philosophy is *governed by*, not restated from,
  Volume I.
- **Dependencies:** KO-BI-CH1-001.
- **Relationships:** Cross-references MUV Darshan™ (Volume I — outside this chapter's scope,
  never duplicated here).
- **Governance Rules:** Per Ch.15 §20 Message Protection: never invent Founder philosophy content
  — this KO explicitly defers to Volume I rather than restating or summarizing it beyond the one
  sourced quote below.
- **Validation Rules:** Must not expand Volume I's content beyond what Part III itself quotes.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** Brand Philosophy is governed by Volume I — MUV Darshan™; Chapter 11 §2 only applies
it to identity, does not restate it in full. Quoted Hindi line: *"Zindagi mein muskil aayegi,
clean karro aur Muv karte raho."*

---

## KO-BI-CH1-003 — Mission Statement

- **Purpose:** Provide the single, canonical mission statement for any AI-generated content that
  references MUV's purpose.
- **Scope:** Foundation Mission only.
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, §3.
- **Outputs:** One canonical mission statement.
- **Dependencies:** KO-BI-CH1-001.
- **Relationships:** Paired with KO-BI-CH1-004 (Vision); both feed KO-BI-CH1-005 (Positioning).
- **Governance Rules:** Verbatim only — no paraphrase presented as the official statement.
- **Validation Rules:** Exact-quote match against source required.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** **Foundation Mission:** *"Support people through useful cleaning and care products,
clear customer experiences, and a brand that helps them continue with confidence."*

---

## KO-BI-CH1-004 — Vision Statement

- **Purpose:** Provide the single, canonical vision statement.
- **Scope:** Foundation Vision only.
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, §3.
- **Outputs:** One canonical vision statement.
- **Dependencies:** KO-BI-CH1-001.
- **Relationships:** Paired with KO-BI-CH1-003.
- **Governance Rules:** Verbatim only.
- **Validation Rules:** Exact-quote match against source required.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** **Foundation Vision:** *"Build a timeless Indian global brand that people trust,
remember, and choose for generations."*

---

## KO-BI-CH1-005 — Brand Positioning

- **Purpose:** Give any AI system the correct positioning framework and, critically, the correct
  confidence level for each positioning claim (settled vs. exploratory).
- **Scope:** The Positioning Test (Figure 1.1) and the status of "affordable luxury from India."
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, §4.
- **Outputs:** A positioning-test sequence, with an explicit settled/exploratory flag per claim.
- **Dependencies:** KO-BI-CH1-003, KO-BI-CH1-004.
- **Relationships:** Directly implicated by KO-BI-CH1-006 (the Premium-word conflict — Premium is
  one of this Positioning Test's own stages).
- **Governance Rules:** Must preserve the source's own settled/exploratory distinction — never
  present "affordable luxury from India" as a final, unrestricted brand claim.
- **Validation Rules:** The Positioning Test sequence must match the source's stage order exactly
  (six stages, in order).
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified (the test and its stages) / **Founder Decision Required**
  flagged in-source (the "affordable luxury" claim's final status)

**Content:**
- **Positioning Test (Figure 1.1), in order:** Useful → Trustworthy → Premium → Caring →
  Progressive → Scalable.
- "Affordable luxury from India" is explicitly Founder-explored, **not** an unrestricted final
  claim — this chapter preserves that status exactly rather than treating it as settled.

---

## KO-BI-CH1-006 — Cross-Source Conflict Record: "Premium"

- **Purpose:** Prevent a future AI (or content author) from being misled by two real, contradictory
  sources about whether the word "Premium" may be used.
- **Scope:** The specific conflict between `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` Writing Rule 4
  and the Knowledge Library's use of "Premium" as an approved Positioning Test stage
  (KO-BI-CH1-005) and Brand Personality trait (Chapter 12 §6, out of this chapter's scope but
  the same word).
- **Inputs:** `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` (Writing Rule 4: *"Never use the word
  'premium.' Be premium through specificity instead..."*); MUV Knowledge Library Chapter 11 §4
  and Chapter 12 §6 (Premium as an approved pillar/trait); `docs/phase-1/PHASE_1A_KNOWLEDGE_
  REFERENCES.md`'s existing resolution.
- **Outputs:** A single, unambiguous governance instruction for this exact word, with its
  resolution basis cited.
- **Dependencies:** KO-BI-CH1-005.
- **Relationships:** This is the one Knowledge Object in Chapter 1 that reaches outside Chapter
  11's own text — necessary because the conflict is real and directly touches this chapter's own
  Positioning content.
- **Governance Rules:** Per this domain's own Requirement Analysis: this chapter cites the
  existing resolution rather than re-deciding it. **The Knowledge Library supersedes
  `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` wherever the two conflict** — meaning "Premium" remains
  an approved word/positioning stage/personality trait, and `PHASE_3`'s Writing Rule 4 is
  superseded on this specific point.
- **Validation Rules:** Must not silently pick a side without citing the resolution source. Must
  not present this as a newly-invented resolution — it is a pre-existing one, cited.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified (both sides of the conflict, and the resolution, are all
  directly quoted/cited real documents — nothing here is derived or invented)

**Content:** `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` states: *"Never use the word 'premium.' Be
premium through specificity instead — the word is cheapened by every brand that overuses it."*
The MUV Knowledge Library, in contrast, treats "Premium" as an approved, load-bearing Positioning
Test stage (Chapter 11 §4) and Brand Personality trait (Chapter 12 §6, 20+ occurrences
throughout Part III). **Resolution (pre-existing, cited from `PHASE_1A_KNOWLEDGE_REFERENCES.md`,
not re-decided here):** the Knowledge Library supersedes the legacy phase document wherever they
conflict. **Binding instruction for any AI consuming this Knowledge Object: "Premium" is an
approved word.**

---

## KO-BI-CH1-007 — Chapter Governance Summary

- **Purpose:** Preserve the source chapter's own closing governance content (mistakes to avoid,
  best practices, an action checklist) as directly consumable AI guidance.
- **Scope:** Chapter 11's own "Common Mistakes," "Best Practices," and "Action Checklist"
  closing subsections.
- **Inputs:** MUV Knowledge Library, Part III, Chapter 11, closing subsections (end of the
  1771–1917 line range).
- **Outputs:** A consolidated do/don't and checklist reference.
- **Dependencies:** KO-BI-CH1-001 through 005 (this summarizes/reinforces them, does not
  introduce new facts).
- **Relationships:** Functions as the validation/self-check layer for the rest of this chapter's
  content when consumed by a future AI.
- **Governance Rules:** No new rule invented — this is a structural carry-over of the source's
  own closing content only.
- **Validation Rules:** Must not introduce a mistake/practice/checklist item not present in the
  source.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** Reuses the source's own Common Mistakes / Best Practices / Action Checklist
structure for §1–§4's content — functioning as this chapter's own closing self-check layer,
directly mirroring the source's own closing pattern rather than inventing a new one.
