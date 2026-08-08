# MUV Black Phenyl™ — Decision Trees

---

## KO-BP-DT-001 — Is MUV Black Phenyl™ the Correct Product?

- **Confidence:** LOW-MEDIUM — decision logic built from a single, narrow sourced purpose
  statement; most branches terminate in Unknown by design
- **Evidence:** KO-BP-INTEL-001, KO-BP-INTEL-002
- **Source:** Derived from SOP §1

**Decision logic:**

```
Customer describes a need
│
├─ Need is general floor cleaning (the one sourced purpose)?
│   ├─ YES → Confirm MUV Black Phenyl™ is a floor cleaner (sourced fact).
│   │        Then check: does answering fully require dilution, surface compatibility, or
│   │        usage-method detail? → If yes, those are Unknown — see KO-BP-INTEL-003/005/006/007.
│   │        Give the honest, sourced-only answer.
│   └─ NO  → Do not confirm suitability for a non-floor-cleaning need. Check KO-BP-DT-003.
│
└─ Need is confirming which "Phenyl" product they mean (Black Phenyl vs. the separate MUV
   Phenyl/White Phenyl product)?
    → Clarify explicitly per KO-BP-INTEL-015 before answering anything else — never assume
      which product the customer means from the word "phenyl" alone.
```

---

## KO-BP-DT-002 — When NOT to Recommend MUV Black Phenyl™

- **Confidence:** MEDIUM
- **Evidence:** KO-BP-INTEL-003, KO-BP-INTEL-015

**Content:** Do not recommend, or recommend only with an explicit caveat, when:

- The customer asks specifically about a surface MUV hasn't documented compatibility for
  (KO-BP-INTEL-003 is Unknown — never assert safe or unsafe without a source).
- The customer needs a specific dilution ratio or contact time to complete a task correctly right
  now (KO-BP-INTEL-006/007 are Unknown).
- It's unclear whether the customer actually means the separate "MUV Phenyl"/"White Phenyl"
  product — clarify first (KO-BP-DT-001).
- The customer's actual need is a task MUV has a more specifically-purpose-built, sourced product
  for (see KO-BP-DT-003).

---

## KO-BP-DT-003 — When Another MUV Product Is More Suitable

- **Confidence:** HIGH — cross-references real, sourced facts from seven frozen prior packages
- **Source:** Cross-package comparison, all sides independently sourced

**Content:**

| Customer's actual need | More suitable MUV product | Why (sourced) |
|---|---|---|
| Glass/mirror surfaces | MUV Crystal Glass Cleaner™ | Purpose-built, sourced glass formulation |
| General household surface cleaning/whitening | MUV Pure Bleach™ | Purpose-built for household cleaning/whitening (note: real, sourced mixing restriction — never suggest combining with an acid-based product; Black Phenyl's own formulation includes no acid, so this specific restriction doesn't apply to Black Phenyl itself, but the general "don't casually combine cleaning chemicals" principle still applies given neither product's mixing compatibility with the other is sourced) |
| Toilet bowl cleaning | MUV Floral Toilet Cleaner™ | Purpose-built, acid-based toilet-bowl formulation |
| Bathroom surface cleaning | MUV Fresh Bathroom Cleaner™ | Purpose-built bathroom-surface formulation |
| Dishware | MUV Spark Dishwash Gel™ | Purpose-built dishware formulation |
| Laundry | MUV Liquid Detergent™ | Purpose-built laundry detergent |
| Fragranced, non-disinfectant floor cleaning | MUV Floor Cleaner™ (Velvet Mist / Cloud Walk) | A different, dedicated floor-cleaner formulation and fragrance experience — MUV has two real floor-cleaning product lines; do not conflate them |

**Black Phenyl vs. MUV Floor Cleaner™ — a real, sourced distinction worth surfacing:** these are
two separate, genuinely different MUV floor-care product families (different formulations,
different SOPs, different fragrance/colour approach). Never present them as the same product or
as simple variants of one another.

---

## KO-BP-DT-004 — Safety Escalation Conditions

- **Confidence:** HIGH — grounded in real platform escalation code
- **Evidence:** `lib/eios/cognitive-state.ts`; SOP §7

**Content:** Always escalate to a human, immediately, regardless of confidence tier, when:

1. The customer describes actual eye, skin, inhalation, or ingestion contact.
2. The customer asks for first-aid instructions — none are sourced.
3. The customer reports a spill, leak, or damaged container.
4. The customer is asking on behalf of, or describes exposure involving, a child or a pet.
5. The customer describes an intent to mix MUV Black Phenyl™ with another cleaning product —
   compatibility with any other product (MUV's own or third-party) is not sourced either way.

This mirrors the SAFETY-category priority rule used identically across all seven prior Product
Knowledge Packages this session.
