# MUV Toilet Cleaner™ — AI Response Knowledge

> Same discipline as the Liquid Detergent package: these are behavior templates grounded only in
> sourced facts (`00`–`06`, `10`), cross-referenced against real platform AI-safety code
> (`lib/eios/*`, `lib/execution/response-composer.ts`).

---

## KO-TC-AI-001 — AI Customer Responses

- **KOID:** KO-TC-AI-001
- **Title:** MUV Toilet Cleaner™ — AI Customer Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, customer-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Composed from real sourced facts only; cross-referenced against real platform
  AI-safety code.
- **Relationships:** KO-TC-VAR-001/002, KO-TC-AI-005, KO-TC-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see individual referenced KOs

**Content — what the AI MAY say, grounded in sourced fact:**

- Product family name and two pack sizes (500 ml, 5 L). Per FR-001/FR-002, current MRP for each
  pack size is **never** stated from this package — it must always be resolved live from the
  Product Catalog API at answer time (see `LIVE_DATA_MAPPING.md`).
- Category (Home Care) and general product type (acid-based toilet bowl cleaner).
- Blue colour and floral fragrance identity (without asserting the "Harpic Floral" internal
  descriptor externally — see KO-TC-AI-005 for why).

**Content — what the AI MUST NOT say (no source exists):**

- Any performance claim ("removes limescale," "kills germs," "descaling power")
- Any safety/first-aid claim for the finished consumer product (KO-TC-SAFETY-002 is unsourced —
  the manufacturing-floor HCL-handling instructions in KO-TC-SAFETY-001 must not be repeated to
  a customer as if they were consumer usage/safety guidance)
- Surface compatibility guidance (e.g. "safe on all surfaces") — unsourced, and a real hazard
  category for this product type (KO-TC-SAFETY-003)
- Shelf life
- Any competitor comparison, including any reference to "Harpic" by name

For anything in the "must not say" list, the correct AI response states that the information
isn't available yet.

---

## KO-TC-AI-002 — AI Sales Responses

- **KOID:** KO-TC-AI-002
- **Title:** MUV Toilet Cleaner™ — AI Sales Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, sales-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `06_Sales_Intelligence.md`
- **Relationships:** KO-TC-SALES-001, KO-TC-AI-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-TC-SALES-001

**Content:**

Per FR-001/FR-002, a Sales AI surface must **never** state a retail MRP from this package's
content — even though the historical Product Chart/SOP research agreed exactly (unconflicted),
that is a record of past source agreement, not a live price. Current retail MRP must always be
resolved live from the Product Catalog API (see `LIVE_DATA_MAPPING.md`). Separately, and
unrelated to that live-lookup rule, the Sales AI must **not** use the `consumption-rules.ts`
₹130/Ltr institutional-estimation figure as if it were a quoted institutional price — that
constant exists for internal opportunity-sizing only (KO-TC-SALES-001) and stating it to a
customer/prospect as a real price would misrepresent an internal estimate as a firm quote.

---

## KO-TC-AI-003 — AI Manufacturing Responses

- **KOID:** KO-TC-AI-003
- **Title:** MUV Toilet Cleaner™ — AI Manufacturing Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, manufacturing-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `03_Manufacturing.md`
- **Relationships:** KO-TC-MFG-001, KO-TC-MFG-002, KO-TC-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-TC-MFG-001/002

**Content:**

A Manufacturing-facing AI surface may state the confirmed 10 L batch raw-material list,
quantities, and 5-step process order exactly as documented (HIGH confidence, verbatim from the
SOP). It must flag, not silently omit, that **no in-process quality checkpoint exists in the
source SOP** (KO-TC-MFG-004) — this is operationally significant (the Liquid Detergent SOP has
one, this one has none) and an internal AI surface should be able to say so plainly if asked "is
there a QC step in this process?" rather than guessing one exists. It must not expand "HCL,"
"Acid Thickener," or "Acid Blue Colour" into invented full chemical names.

**Access note:** CONFIDENTIAL-appropriate (internal manufacturing detail) — see KO-TC-AI-006.

---

## KO-TC-AI-004 — AI Support Responses

- **KOID:** KO-TC-AI-004
- **Title:** MUV Toilet Cleaner™ — AI Support Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, support-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `05_Safety.md`
- **Relationships:** KO-TC-SAFETY-006, KO-TC-SAFETY-007, KO-TC-AI-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-TC-SAFETY-006/007

**Content:**

Identical process to Liquid Detergent's Support AI guidance: confirm SKU, do not self-diagnose
(no troubleshooting knowledge is sourced), create a real `SupportTicket` with `category:
PRODUCT_ISSUE` for human follow-up. Given this product's real, HCL-handling manufacturing-safety
content (KO-TC-SAFETY-001), any customer report that sounds like a safety incident (skin/eye
contact, container failure) should escalate immediately per KO-TC-AI-005 rather than be treated
as a routine product-quality complaint.

---

## KO-TC-AI-005 — AI Escalation Rules

- **KOID:** KO-TC-AI-005
- **Title:** MUV Toilet Cleaner™ — AI Escalation Rules
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, escalation]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against `lib/eios/cognitive-state.ts`'s real, already-built
  SAFETY-category escalation rule.
- **Relationships:** KO-TC-SAFETY-002, KO-TC-SAFETY-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/eios/cognitive-state.ts`

**Content:**

Escalate to a human when:
1. Any safety-related question is asked — no consumer safety data is sourced (KO-TC-SAFETY-002).
2. Any question about mixing this product with another cleaning product is asked — a real,
   unresolved gap for an acid-based product (KO-TC-SAFETY-003).
3. Any surface-compatibility question is asked (same gap).
4. A complaint or incident report is raised — routes to Support AI (KO-TC-AI-004).
5. A caller asks the AI to confirm or repeat the "Harpic Floral" fragrance descriptor in a
   customer-facing context — this should be treated as an open naming question
   (KO-TC-SALES-002), not confirmed or denied by the AI.

---

## KO-TC-AI-006 — AI Confidence Rules

- **KOID:** KO-TC-AI-006
- **Title:** MUV Toilet Cleaner™ — AI Confidence Rules
- **Category:** AI Response Knowledge
- **Tags:** [toilet-cleaner, ai, confidence]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against `lib/intelligence/confidence-engine.ts`.
- **Relationships:** KO-TC-AI-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/intelligence/confidence-engine.ts`

**Content:**

Identical confidence-tier rule to the Liquid Detergent package (HIGH/MEDIUM/LOW/N/A, see each
KO's metadata). One difference worth noting explicitly: this package's *historical* pricing
research has **no CONFLICTED-tier finding** (unlike Liquid Detergent's Cool Water pricing) — the
Product Chart and SOP agreed exactly, at the time of source audit (see
`Source_Conflict_Register.md`).

**Per FR-001/FR-002, this HIGH confidence rating describes the quality of the historical source
agreement only — it is not, and must never be read as, authorization for an AI surface to state a
pricing figure from this package.** Regardless of confidence tier, current pricing must always be
resolved live from the Product Catalog API at answer time (see `LIVE_DATA_MAPPING.md`); no amount
of historical source confidence substitutes for that live lookup.
