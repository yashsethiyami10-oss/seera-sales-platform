# MUV Body Wash™ — Decision Trees

> Parent-level product-fit trees, plus the three required Variant Intelligence recommendation
> KOs (one per variant), per this task's "VARIANT INTELLIGENCE" section.

---

## KO-BW-DT-001 — Is MUV Body Wash™ the Correct Product?

- **Confidence:** MEDIUM
- **Evidence:** KO-BW-INTEL-001, KO-BW-INTEL-002

**Decision logic:**

```
Customer describes a need
│
├─ Need is general body cleansing (the sourced purpose)?
│   ├─ YES → Confirm MUV Body Wash™ is a liquid, salicylic-acid-active body wash (sourced
│   │        fact). Then check: does answering fully require skin-type, usage, or benefit
│   │        detail? → If yes, those are Unknown — see KO-BW-INTEL-003/004/005.
│   └─ NO  → Do not confirm suitability. Check KO-BW-DT-003.
│
└─ Need involves a skin condition, contraindication, or dermatological concern?
    → Always route to KO-BW-DT-004 (safety escalation) BEFORE answering any suitability
      question — safety/health questions always outrank product-fit reasoning.
```

---

## KO-BW-DT-002 — When NOT to Recommend MUV Body Wash™

- **Confidence:** MEDIUM
- **Evidence:** KO-BW-INTEL-004, KO-BW-INTEL-014

**Content:** Do not recommend, or recommend only with an explicit caveat, when:

- The customer asks specifically about a skin type or condition MUV hasn't documented suitability
  for (KO-BW-INTEL-004 is Unknown — never assert "yes, safe for your skin type").
- The customer describes a real dermatological concern or contraindication question — route to a
  qualified professional, never answer definitively (KO-BW-INTEL-014).
- The customer needs specific usage/application guidance MUV hasn't published (KO-BW-INTEL-005).

---

## KO-BW-DT-003 — When Another MUV Product Is More Suitable

- **Confidence:** MEDIUM — this is the first Body Care product this session, so cross-references
  are necessarily limited to category-adjacent products, not a direct substitute
- **Evidence:** Cross-package comparison

**Content:** MUV Body Wash™'s sourced purpose is body cleansing specifically — it is not
positioned, in any source, as a substitute for hand washing (a different real MUV product
category referenced in `lib/inst-sales/consumption-rules.ts`'s `HAND_WASH` category, though no
MUV Hand Wash™ Knowledge Package exists yet this session) or any household surface-cleaning
product. No cross-product substitution table is built here beyond this general boundary, since
Body Wash has no directly overlapping MUV product this session.

---

## KO-BW-DT-004 — Safety Escalation Conditions

- **Confidence:** HIGH — grounded in real platform escalation code
- **Evidence:** `lib/eios/cognitive-state.ts`

**Content:** Always escalate to a human/professional, immediately, regardless of confidence tier,
when:

1. The customer describes actual skin irritation, an allergic reaction, or eye contact.
2. The customer asks a real dermatological/contraindication question (e.g. pregnancy, existing
   skin condition, concurrent active-ingredient use).
3. The customer asks for first-aid or medical guidance — none is sourced, and this category
   requires routing to a professional, never an AI-generated answer.
4. The customer is asking on behalf of a child.

This mirrors the SAFETY-category priority rule used identically across all ten Product Knowledge
Packages this session, applied here with extra caution given the total absence of sourced safety
content (`08_Safety.md`).

---

## Variant Intelligence — Recommendation Logic (per `FR-004` "VARIANT INTELLIGENCE" requirement)

> Recommend variants only using verified differences. Do not invent fragrance notes or emotional
> claims — per this task's explicit instruction.

## KO-BW-DT-CV-001 — Crimson Veil Recommendation Logic

- **Confidence:** MEDIUM — recommendation bounded strictly by the one sourced fact
- **Evidence:** KO-BW-INTEL-008 (fragrance family: "Premium Floral")

**Content:** When a customer's stated preference matches "floral" as a general fragrance
category, Crimson Veil is the sourced match (fragrance family: Premium Floral). The AI must not
elaborate beyond this two-word label — no invented floral notes (e.g. "jasmine," "rose"), no
emotional/lifestyle claim (e.g. "romantic," "elegant"). If the customer wants more sensory detail
than this, the honest answer is that MUV hasn't published it yet.

## KO-BW-DT-VO-001 — Velvet Oak Recommendation Logic

- **Confidence:** MEDIUM
- **Evidence:** KO-BW-INTEL-008 (fragrance family: "Woody Premium")

**Content:** When a customer's stated preference matches "woody"/"earthy" as a general fragrance
category, Velvet Oak is the sourced match (fragrance family: Woody Premium). No invented woody
notes (e.g. "sandalwood," "cedar") or emotional claims (e.g. "masculine," "grounding") — only the
two-word sourced label.

## KO-BW-DT-MF-001 — Midnight Frost Recommendation Logic

- **Confidence:** MEDIUM
- **Evidence:** KO-BW-INTEL-008 (fragrance family: "Fresh Cooling")

**Content:** When a customer's stated preference matches "fresh"/"cooling"/"invigorating" as a
general fragrance category, Midnight Frost is the sourced match (fragrance family: Fresh
Cooling). No invented cooling notes (e.g. "mint," "eucalyptus") or emotional claims (e.g.
"energizing," "crisp night air") — only the two-word sourced label.

## KO-BW-DT-COMPARE-001 — Cross-Variant Comparison (Fragrance Comparison / Variant Recommendation flows)

- **Confidence:** HIGH — a factual comparison table, no invented content
- **Evidence:** KO-BW-FAM-001

**Content:**

| Variant | Fragrance Family (sourced) | Pack Sizes |
|---|---|---|
| Crimson Veil | Premium Floral | 250ml, 950ml |
| Velvet Oak | Woody Premium | 250ml, 950ml |
| Midnight Frost | Fresh Cooling | 250ml, 950ml |

This is the entire sourced basis for any "which variant should I choose" or "how do these
compare" conversation. All three have identical pack-size availability; the only real
differentiator sourced is the fragrance-family label.
