# MUV Liquid Detergent™ — AI Response Knowledge

> These sections define HOW an AI system (MUV AI / Website AI / WhatsApp AI / Voice AI / Founder
> AI / Sales AI / Support AI) should behave when asked about this product — not new facts. Every
> response template below only ever surfaces facts already sourced elsewhere in this package
> (`01`–`06`, `10`), and explicitly instructs the AI to say "I don't have that information yet"
> rather than invent an answer for anything marked REQUIRES FOUNDER INPUT. This matches the
> platform's own real, code-verified behavior: `lib/eios/verification-gate.ts`'s Self-Verification
> Gate already blocks a response when confidence is LOW (built this session, Sprint 9), and
> `lib/execution/response-composer.ts` already never generates customer-facing language directly
> from an LLM (Module 7, "never customer language"). These templates are written to be consistent
> with that existing, real behavior, not to introduce a new AI-safety mechanism.

---

## KO-LD-AI-001 — AI Customer Responses

- **KOID:** KO-LD-AI-001
- **Title:** MUV Liquid Detergent™ — AI Customer Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, customer-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance, not a factual claim)
- **Evidence:** Composed from real sourced facts only (§01–§06, §10); cross-referenced against
  real platform AI-safety code (`lib/eios/*`, `lib/execution/response-composer.ts`).
- **Relationships:** KO-LD-VAR-001/002/003, KO-LD-AI-005, KO-LD-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see individual referenced KOs

**Content — what the AI MAY say, grounded in sourced fact:**

- Product family name, three variant names, fragrance identity, colour identity, two pack sizes
  (source: `10_Product_Variants.md`).
- Pricing (1 L / 5 L, any variant): per FR-001/FR-002, the AI must **never** state a
  package-sourced ₹ figure for any variant — including Lavender Garden and Indian Rose, whose
  pricing was previously treated as unambiguous. All pricing must be resolved live from the
  Product Catalog API at answer time (see `LIVE_DATA_MAPPING.md`).
- Historical note (audit trail only, not for use in live answers): source documents disclosed a
  pricing discrepancy for Cool Water specifically — see `KO-LD-CONFLICT-001` in
  `10_Product_Variants.md`, a historical source citation, never a live commercial value. This no
  longer distinguishes Cool Water's AI-response handling from the other two variants, since all
  variant pricing is now resolved the same way: live, never from this package.
- Category (Fabric Care) and general product type (liquid laundry detergent).

**Content — what the AI MUST NOT say (no source exists):**

- Any specific performance claim ("removes stains," "safe for sensitive skin," "eco-friendly,"
  "biodegradable," etc.)
- Any ingredient safety claim, allergen statement, or "suitable for X fabric" claim
- Shelf life or expiry guidance
- Any competitor comparison
- Any customer usage dosage instruction beyond what a real, approved source provides

For anything in the "must not say" list, the AI's correct response is a plain statement that the
information isn't available yet and, where appropriate for the caller's context, an offer to
escalate to a human (see KO-LD-AI-005).

---

## KO-LD-AI-002 — AI Sales Responses

- **KOID:** KO-LD-AI-002
- **Title:** MUV Liquid Detergent™ — AI Sales Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, sales-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `06_Sales_Intelligence.md`
- **Relationships:** KO-LD-SALES-001, KO-LD-AI-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-LD-SALES-001

**Content:**

When a Sales AI surface (e.g. the `SALES_INTELLIGENCE` agent built in this session's Sprint 13)
is asked about this product for a quotation or bulk-order context, it must resolve 1 L/5 L
pricing live from the Product Catalog API (per FR-001/FR-002; see `LIVE_DATA_MAPPING.md`) — it
must never state a package-sourced MRP — and must explicitly decline to state a wholesale/
institutional price, since none is sourced (KO-LD-SALES-001). It must not fabricate a bulk
discount percentage or minimum order quantity.

---

## KO-LD-AI-003 — AI Manufacturing Responses

- **KOID:** KO-LD-AI-003
- **Title:** MUV Liquid Detergent™ — AI Manufacturing Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, manufacturing-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `03_Manufacturing.md`
- **Relationships:** KO-LD-MFG-001, KO-LD-MFG-002, KO-LD-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-LD-MFG-001/002

**Content:**

A Manufacturing-facing AI surface may state the confirmed 10 L batch raw-material list, quantities,
and the 11-step process order exactly as documented in `03_Manufacturing.md` — this is the most
source-grounded content in the whole package (HIGH confidence, verbatim from the SOP). It must
**not** state a scaled batch size (e.g. "for a 50 L batch, use...") as if pre-approved — scaling
math can be shown as arithmetic, but must be labelled as unvalidated per KO-LD-MFG-003. It must
not expand SLES/CAPB/CDEA into full chemical names, since the source itself does not (see
KO-LD-MFG-001's caveat) — internal audiences who need the full names should be told this
requires Founder/technical confirmation, not given a guessed expansion.

**Access note:** this content is CONFIDENTIAL-appropriate (internal manufacturing detail) — see
KO-LD-AI-006 for the confidence/layer rule.

---

## KO-LD-AI-004 — AI Support Responses

- **KOID:** KO-LD-AI-004
- **Title:** MUV Liquid Detergent™ — AI Support Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, support-response]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Derived from `05_Safety.md`
- **Relationships:** KO-LD-SAFETY-006, KO-LD-SAFETY-007, KO-LD-AI-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see KO-LD-SAFETY-006/007

**Content:**

A Support AI surface (e.g. this session's Sprint 12 `SUPPORT_TICKET_LOOKUP`/
`CREATE_SUPPORT_TICKET` tools) handling a complaint about this product should: (1) confirm the
product/variant/pack size from `10_Product_Variants.md`, (2) **not** attempt to diagnose a root
cause itself (no troubleshooting knowledge is sourced — KO-LD-SAFETY-006), and (3) create a real
`SupportTicket` with `category: PRODUCT_ISSUE` for human follow-up rather than offer a
self-service resolution it has no grounded basis for.

---

## KO-LD-AI-005 — AI Escalation Rules

- **KOID:** KO-LD-AI-005
- **Title:** MUV Liquid Detergent™ — AI Escalation Rules
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, escalation]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against the real, already-built `lib/eios/cognitive-state.ts`
  (this session's Sprint 9) — a SAFETY-category message always escalates regardless of
  confidence, and any Cool-Water-pricing question is a genuine "don't answer with confidence"
  case per KO-LD-CONFLICT-001.
- **Relationships:** KO-LD-CONFLICT-001, KO-LD-SAFETY-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/eios/cognitive-state.ts`

**Content:**

Escalate to a human when:
1. The customer asks anything safety-related about this product (no safety data is sourced —
   KO-LD-SAFETY-001) — matches the platform's existing, real SAFETY-category escalation rule.
2. The customer or a sales caller asks for a firm Cool Water price — the conflict is unresolved
   (KO-LD-CONFLICT-001) and must go to a human, not be silently resolved by the AI.
3. Any ingredient/allergen question is asked — no INCI names or allergen data are sourced.
4. A complaint or product-issue report is raised — routes to Support AI (KO-LD-AI-004), which
   creates a real ticket rather than self-resolving.

---

## KO-LD-AI-006 — AI Confidence Rules

- **KOID:** KO-LD-AI-006
- **Title:** MUV Liquid Detergent™ — AI Confidence Rules
- **Category:** AI Response Knowledge
- **Tags:** [liquid-detergent, ai, confidence]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against `lib/intelligence/confidence-engine.ts`'s real,
  already-built formula ("confidence must decrease when evidence is incomplete; never
  manufacture confidence" — built prior to this session, verified present).
- **Relationships:** KO-LD-AI-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/intelligence/confidence-engine.ts`

**Content:**

Every Knowledge Object in this package is explicitly marked HIGH / MEDIUM / LOW / N/A confidence
(see each KO's own metadata block). An AI surface consuming this package should treat:
- **HIGH** — safe to state as fact with citation (e.g. the raw-material list, KO-LD-MFG-001).
- **MEDIUM** — safe to state with a caveat noted inline (e.g. positioning derived from pricing
  alone, KO-LD-DESC-002).
- **LOW** — must not be stated as fact; respond with "not yet available" language.
- **N/A** — behavioral/process guidance, not a factual claim, and not subject to a confidence
  score at all.

This mirrors the real, existing platform rule exactly (`ConfidenceLevel` in
`lib/intelligence/types.ts`: LOW/MODERATE/HIGH, "deliberately no 'certain' value") — this
package's four-tier scale is a superset for content-governance purposes, not a contradiction of
the platform's three-tier runtime scale.
