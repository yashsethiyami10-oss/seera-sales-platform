# MUV Pure Bleach™ — Decision Trees

> Lets the AI determine product fit and safety escalation from real, sourced facts only. Where a
> branch would require an unsourced fact to resolve, the tree terminates in "Unknown — defer/
> escalate," never a guessed answer.

---

## KO-PB-DT-001 — Is MUV Pure Bleach™ the Correct Product?

- **KOID:** KO-PB-DT-001
- **Confidence:** MEDIUM — decision logic built from sourced purpose statement; many branches
  terminate in Unknown by design
- **Evidence:** KO-PB-INTEL-001, KO-PB-INTEL-002
- **Source:** Derived from SOP §1

**Decision logic:**

```
Customer describes a need
│
├─ Need matches "household cleaning" or "whitening" (the two sourced purposes)?
│   ├─ YES → Confirm MUV Pure Bleach™ is intended for this general purpose (sourced fact).
│   │        Then check: does answering fully require dilution, contact time, or surface-
│   │        compatibility detail? → If yes, those specific answers are Unknown — see
│   │        KO-PB-INTEL-005/006/007/003. Give the customer the honest, sourced-only answer,
│   │        never fabricate the missing specifics.
│   └─ NO  → Do not confirm suitability. State plainly this isn't a sourced use case for this
│            product. Check KO-PB-DT-003 (another MUV product may fit better).
│
└─ Need involves mixing with another cleaning product?
    → Always route to KO-PB-DT-004 (safety escalation) BEFORE answering the suitability
      question — safety always outranks product-fit reasoning, per Care Intelligence's
      Truth → Safety → Care ordering.
```

---

## KO-PB-DT-002 — When NOT to Recommend MUV Pure Bleach™

- **KOID:** KO-PB-DT-002
- **Confidence:** MEDIUM-HIGH — grounded in real sourced facts (mixing restriction, unsourced
  surface compatibility)
- **Evidence:** SOP §7; KO-PB-INTEL-003
- **Source:** Derived from KO-PB-INTEL-003, KO-PB-INTEL-015

**Content:** Do not recommend MUV Pure Bleach™, or recommend it only with an explicit caveat,
when:

- The customer intends to mix it with any acid-based cleaner (real, sourced restriction — SOP
  §7) or an ammonia-based cleaner (also explicitly restricted).
- The customer asks specifically about a coloured fabric, a delicate surface, or a material
  MUV hasn't documented compatibility for (KO-PB-INTEL-003 is Unknown — never assert either
  "safe" or "unsafe" without a source; direct them to check compatibility cautiously themselves
  or await a real Founder-supplied compatibility answer).
- The customer needs a specific dilution ratio or contact time to complete a task correctly
  right now and cannot wait (KO-PB-INTEL-006/007 are Unknown) — the honest answer is that MUV
  hasn't published this yet, not a guessed ratio.
- The customer's actual need is dedicated glass, floor, toilet-bowl, or general surface cleaning
  where MUV already has a purpose-built, more specifically sourced product — see KO-PB-DT-003.

---

## KO-PB-DT-003 — When Another MUV Product Is More Suitable

- **KOID:** KO-PB-DT-003
- **Confidence:** HIGH — cross-references real, sourced facts from six frozen prior packages
- **Evidence:** Each named product's own frozen Knowledge Package
- **Source:** Cross-package comparison, all sides independently sourced

**Content:**

| Customer's actual need | More suitable MUV product | Why (sourced) |
|---|---|---|
| Glass/mirror surfaces | MUV Crystal Glass Cleaner™ | Purpose-built, sourced formulation for glass (`crystal-glass-cleaner/04_Ingredients_and_Functions.md`) |
| Floor cleaning | MUV Floor Cleaner™ | Purpose-built, sourced formulation for floors (`floor-cleaner/06_Manufacturing_SOP.md`) |
| Toilet bowl cleaning | MUV Floral Toilet Cleaner™ | Purpose-built, acid-based toilet-bowl formulation (`toilet-cleaner/03_Manufacturing.md`) — **note: never suggest combining this with MUV Pure Bleach™, per the real mixing restriction** |
| Bathroom surface cleaning | MUV Fresh Bathroom Cleaner™ | Purpose-built bathroom-surface formulation (`fresh-bathroom-cleaner/06_Manufacturing_SOP.md`) — **same mixing caution applies** |
| Dishware | MUV Spark Dishwash Gel™ | Purpose-built dishware formulation |
| Laundry (general detergent needs) | MUV Liquid Detergent™ | Purpose-built laundry detergent — MUV Pure Bleach™'s SOP names "household cleaning and whitening," not general laundry detergency, as its purpose |

MUV Pure Bleach™'s own sourced purpose is general household cleaning and whitening — it is not
positioned, in any source, as a replacement for these purpose-built products.

---

## KO-PB-DT-004 — Safety Escalation Conditions

- **KOID:** KO-PB-DT-004
- **Confidence:** HIGH — grounded in real platform escalation code
- **Evidence:** `lib/eios/cognitive-state.ts`; SOP §7
- **Source:** Real platform code + KO-PB-INTEL-016

**Content:** Always escalate to a human, immediately, regardless of confidence tier, when:

1. The customer describes actual eye, skin, inhalation, or ingestion contact.
2. The customer describes an intent to mix MUV Pure Bleach™ with an acid-based or ammonia-based
   product (MUV's own or third-party) — the real, sourced restriction must be stated proactively,
   not just in response.
3. The customer asks for first-aid instructions — none are sourced; the AI must not improvise
   medical guidance (see `08_Safety.md`).
4. The customer reports a spill, leak, or damaged container.
5. The customer is asking on behalf of, or describes exposure involving, a child or a pet.

This mirrors the SAFETY-category priority rule already used identically across all six prior
Product Knowledge Packages this session.
