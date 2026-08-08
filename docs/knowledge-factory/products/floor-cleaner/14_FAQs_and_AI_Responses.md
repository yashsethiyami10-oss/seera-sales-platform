# MUV Floor Cleaner™ — FAQs & AI Responses

> Parent-level (shared) Knowledge Objects — apply to all three variants; variant-specific
> answers (colour, pricing) are noted inline where relevant.

---

## KO-FC-FAQ-001 — Customer FAQs

- **KOID:** KO-FC-FAQ-001
- **Title:** MUV Floor Cleaner™ — Customer FAQs
- **Category:** FAQs & AI Responses
- **Tags:** [floor-cleaner, faq, shared, parent]
- **Version:** 1.0
- **Confidence:** MIXED — some answers confirmed, others explicit "not documented"
- **Evidence:** All prior sections
- **Relationships:** KO-FC-GQ-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| Question | Answer |
|---|---|
| What variants does MUV Floor Cleaner™ come in? | Three named variants: Velvet Mist, Cloud Walk, and Rose Water. Only Velvet Mist and Cloud Walk are confirmed to exist in MUV's own Product Chart and Production SOP — Rose Water is named but has no sourced formulation yet. |
| What sizes are available? | 1L and 5L, for Velvet Mist and Cloud Walk. No pack size is confirmed for Rose Water. |
| How much does it cost? | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`).** Per FR-001/FR-002, the AI never answers a pricing question from this package's content — it resolves current MRP/price for the requested variant and pack size live, at answer time. |
| What colour is each variant? | Velvet Mist: Lavender. Cloud Walk: Blue. Rose Water: not documented. |
| What's in it? | DM Water, SLES, Fragrance, Alfox 200, Phenoxy Ethanol, Colour (variant-dependent), Silicone Emulsion — shared base formula for Velvet Mist and Cloud Walk. Not documented for Rose Water. |
| Is it safe to use? | Not confirmed — no consumer safety guidance exists in any source. |
| Is it safe around kids and pets? | Not confirmed — no source addresses this; see `16_Care_Response_Objects.md` for the honest-disclosure approach to this common question. |

---

## KO-FC-AI-001 — AI Response Guidance

- **KOID:** KO-FC-AI-001
- **Title:** MUV Floor Cleaner™ — AI Response Guidance
- **Category:** FAQs & AI Responses
- **Tags:** [floor-cleaner, ai-guidance, shared, parent]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`
- **Relationships:** KO-FC-AI-002, KO-FC-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/intelligence/confidence-engine.ts`

**Content:**

The AI must answer only from this package's sourced Knowledge Objects. It must never present
Rose Water as having a confirmed formula, colour, or price. It must correctly apply the shared
Parent-level facts (formula, process, QC absence, safety absence) to Velvet Mist and Cloud Walk,
while never silently extending those same Parent-level facts to Rose Water without flagging that
Rose Water's relationship to the shared base formula is itself unconfirmed (see
`17_Variant_Inheritance_Map.md`).

**Per FR-001/FR-002 (Commercial/Knowledge Separation):** the AI must never answer a price, MRP,
discount, stock, image, URL, slug, or availability question from this package's content. Those
eleven fields (`CONSTITUTION.md` Article 2.1) are always resolved live from the Product Catalog at
answer time — see `LIVE_DATA_MAPPING.md`. This applies equally to Velvet Mist, Cloud Walk, and
Rose Water; it does not depend on whether a variant is currently catalogued.

---

## KO-FC-AI-002 — AI Escalation Rules

- **KOID:** KO-FC-AI-002
- **Title:** MUV Floor Cleaner™ — AI Escalation Rules
- **Category:** FAQs & AI Responses
- **Tags:** [floor-cleaner, ai-escalation, shared, parent]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/eios/cognitive-state.ts`
- **Relationships:** KO-FC-CRO-003, KO-FC-CRO-004, KO-FC-CRO-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/eios/cognitive-state.ts`

**Content:**

Any real safety report (skin/eye contact, pet or child exposure concern) always escalates to a
human regardless of confidence tier. Any real product-quality complaint always creates a
`SupportTicket`. See `16_Care_Response_Objects.md` for the full behavior templates.

---

## KO-FC-AI-003 — AI Confidence Rules

- **KOID:** KO-FC-AI-003
- **Title:** MUV Floor Cleaner™ — AI Confidence Rules
- **Category:** FAQs & AI Responses
- **Tags:** [floor-cleaner, ai-confidence, shared, parent]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`
- **Relationships:** KO-FC-AI-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/intelligence/confidence-engine.ts`

**Content:**

Pricing questions (1L or 5L, any variant) are never answered from a stored confidence tier — per
FR-001/FR-002, pricing is always resolved live from the Product Catalog API (see
`LIVE_DATA_MAPPING.md`), so no confidence rule applies to it here. (Historically, before FR-001,
this package tracked 1L pricing as HIGH-confidence/clean and 5L pricing as a CONFLICTED tier
requiring disclosure — see `20_Source_Conflict_Register.md` for that historical audit record;
that distinction no longer governs how the AI answers a pricing question, because the AI no
longer answers pricing questions from this package at all.) Rose Water questions get an explicit
"named but not yet formulated/priced" answer, never treated as equivalent in confidence to the two
sourced variants — this non-commercial sourcing-status distinction is unaffected by FR-001/FR-002.
