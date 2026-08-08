# MUV Crystal Glass Cleaner™ — FAQs & AI Responses

---

## KO-GC-FAQ-001 — Customer FAQs

- **KOID:** KO-GC-FAQ-001
- **Title:** MUV Crystal Glass Cleaner™ — Customer FAQs
- **Category:** FAQs & AI Responses
- **Tags:** [glass-cleaner, faq]
- **Version:** 1.0
- **Confidence:** MIXED — some answers are confirmed facts, others are explicit "not documented" answers
- **Evidence:** All prior sections
- **Relationships:** KO-GC-GQ-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| Question | Answer |
|---|---|
| What sizes does MUV Crystal Glass Cleaner™ come in? | 500 ml only — no 5 Litre size confirmed |
| How much does it cost? | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`).** Never answered from this package's content — per FR-001/FR-002. |
| What colour is it? | Ocean Blue (a clear blue liquid, per the SOP) |
| What fragrance does it have? | Not documented — no fragrance name/descriptor exists in any source |
| What's in it? | DM Water, IPA, SLES, Butyl Cellosolve, Acetic Acid, BKC, a named colourant (Ocean Blue), and an unnamed fragrance |
| Is it safe to use? | Not confirmed — no consumer safety guidance exists in any source |
| Can I use it on other surfaces besides glass? | Not documented — REQUIRES FOUNDER INPUT |

---

## KO-GC-AI-001 — AI Response Guidance

- **KOID:** KO-GC-AI-001
- **Title:** MUV Crystal Glass Cleaner™ — AI Response Guidance
- **Category:** FAQs & AI Responses
- **Tags:** [glass-cleaner, ai-guidance]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`
- **Relationships:** KO-GC-AI-002, KO-GC-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/intelligence/confidence-engine.ts`

**Content:**

The AI must answer only from this package's sourced Knowledge Objects, using the real
HIGH/MODERATE/LOW confidence tiers from `lib/intelligence/confidence-engine.ts`. It must never
state a colour or fragrance for a product/attribute not sourced, never state a 5L SKU exists,
never invent a safety instruction that isn't in `09_Safety_and_Risk.md`, and must never present
"Crystal" in the name as if it corresponds to a sourced marketing claim.

**Per FR-001/FR-002 (Constitution Article 2.1):** the AI must never answer a price, stock, image,
availability, URL, or slug question from this package's content. Those fields are always resolved
live from the Product Catalog at answer time — see `LIVE_DATA_MAPPING.md`.

---

## KO-GC-AI-002 — AI Escalation Rules

- **KOID:** KO-GC-AI-002
- **Title:** MUV Crystal Glass Cleaner™ — AI Escalation Rules
- **Category:** FAQs & AI Responses
- **Tags:** [glass-cleaner, ai-escalation]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/eios/cognitive-state.ts`
- **Relationships:** KO-GC-CRO-002, KO-GC-CRO-004
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/eios/cognitive-state.ts`

**Content:**

Any real safety report (skin/eye contact, ingestion concern) always escalates to a human
regardless of confidence tier, per the platform's real SAFETY-category priority rule. Any real
product-quality complaint always creates a `SupportTicket`, never a purely conversational
response. See `16_Care_Response_Objects.md` for the full behavior templates.

---

## KO-GC-AI-003 — AI Confidence Rules

- **KOID:** KO-GC-AI-003
- **Title:** MUV Crystal Glass Cleaner™ — AI Confidence Rules
- **Category:** FAQs & AI Responses
- **Tags:** [glass-cleaner, ai-confidence]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`
- **Relationships:** KO-GC-AI-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/intelligence/confidence-engine.ts`

**Content:**

Pricing questions are never answered from this package's content, regardless of confidence tier —
per FR-001/FR-002, they are always resolved LIVE from the Product Catalog API (see
`LIVE_DATA_MAPPING.md`). (Historical source citation only, NOT a live commercial value: both
sources agreed on ₹90 at the time of research, with no conflict to disclose — see
`00_Source_Register.md`.) Fragrance-identity, safety, shelf-life, and 5L availability questions
must all return a LOW-confidence, "not documented"/"REQUIRES FOUNDER INPUT" style answer, never a
guessed one.
