# MUV White Phenyl™ — Decision Trees

---

## KO-WP-DT-001 — Is MUV White Phenyl™ the Correct Product?

- **Confidence:** LOW-MEDIUM
- **Evidence:** KO-WP-INTEL-001, KO-WP-INTEL-002

**Decision logic:**

```
Customer describes a need
│
├─ Need is general floor cleaning (the one sourced purpose)?
│   ├─ YES → Confirm MUV White Phenyl™ is a floor cleaner (sourced fact).
│   │        Then check: does answering fully require dilution, surface compatibility, or
│   │        usage-method detail? → If yes, those are Unknown — see KO-WP-INTEL-003/005/006/007.
│   └─ NO  → Do not confirm suitability for a non-floor-cleaning need. Check KO-WP-DT-003.
│
└─ Need is confirming which "Phenyl" product they mean (White Phenyl vs. Black Phenyl)?
    → Clarify explicitly per KO-WP-INTEL-015 before answering anything else.
```

---

## KO-WP-DT-002 — When NOT to Recommend MUV White Phenyl™

- **Confidence:** MEDIUM
- **Evidence:** KO-WP-INTEL-003, KO-WP-INTEL-015

**Content:** Do not recommend, or recommend only with an explicit caveat, when:

- The customer asks specifically about a surface MUV hasn't documented compatibility for.
- The customer needs a specific dilution ratio or contact time to complete a task correctly
  right now.
- It's unclear whether the customer means White Phenyl or the separate Black Phenyl product —
  clarify first.
- The customer's actual need is a task MUV has a more specifically-purpose-built product for
  (see KO-WP-DT-003).

---

## KO-WP-DT-003 — When Another MUV Product Is More Suitable

- **Confidence:** HIGH — cross-references real, sourced facts from eight frozen prior packages
- **Reused pattern:** table structure and cross-product comparison methodology reused directly
  from KO-BP-DT-003 (Black Phenyl) — see `13_Reports/08_Knowledge_Reuse_Summary.md`

**Content:**

| Customer's actual need | More suitable MUV product | Why (sourced) |
|---|---|---|
| Black-tinted, black-phenyl-concentrate floor disinfecting | MUV Black Phenyl™ | A genuinely different, separate formulation — not a colour choice within this product |
| Glass/mirror surfaces | MUV Crystal Glass Cleaner™ | Purpose-built glass formulation |
| General household cleaning/whitening | MUV Pure Bleach™ | Purpose-built for household cleaning/whitening |
| Toilet bowl cleaning | MUV Floral Toilet Cleaner™ | Purpose-built, acid-based toilet-bowl formulation |
| Bathroom surface cleaning | MUV Fresh Bathroom Cleaner™ | Purpose-built bathroom-surface formulation |
| Dishware | MUV Spark Dishwash Gel™ | Purpose-built dishware formulation |
| Laundry | MUV Liquid Detergent™ | Purpose-built laundry detergent |
| Fragranced, non-phenyl floor cleaning | MUV Floor Cleaner™ (Velvet Mist / Cloud Walk) | A different, dedicated floor-cleaner product line with its own formulation and fragrance experience |

---

## KO-WP-DT-004 — Safety Escalation Conditions

- **Confidence:** HIGH — grounded in real platform escalation code
- **Evidence:** `lib/eios/cognitive-state.ts`; SOP §7

**Content:** Always escalate to a human, immediately, regardless of confidence tier, when:

1. The customer describes actual eye, skin, inhalation, or ingestion contact.
2. The customer asks for first-aid instructions — none are sourced.
3. The customer reports a spill, leak, or damaged container.
4. The customer is asking on behalf of, or describes exposure involving, a child or a pet.
5. The customer describes an intent to mix MUV White Phenyl™ with another cleaning product —
   compatibility is not sourced either way.

This mirrors the SAFETY-category priority rule used identically across all eight prior Product
Knowledge Packages this session.
