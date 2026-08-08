# MUV Fresh Bathroom Cleaner™ — FAQs & AI Responses

---

## KO-BC-FAQ-001 — Customer FAQ Set

- **KOID:** KO-BC-FAQ-001
- **Title:** MUV Fresh Bathroom Cleaner™ — Customer FAQs
- **Category:** FAQ
- **Tags:** [bathroom-cleaner, faq]
- **Version:** 1.0
- **Confidence:** Mixed — see each answer
- **Relationships:** KO-BC-VAR-001, KO-BC-SAFETY-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see individual answers

**Content:**

**Q: What size does MUV Fresh Bathroom Cleaner come in?**
A: 500 ml is the only confirmed size in our records. *(Source: KO-BC-VAR-001, HIGH confidence.)*

**Q: How much does it cost?**
A: Current pricing is confirmed live from our product catalog at the time you ask, not from this
answer set — please check the product page or checkout for the current price. *(Source: LIVE —
resolve from Product Catalog API, see `LIVE_DATA_MAPPING.md`. MUV's internal historical source
records show a past pre-launch discrepancy for this product, which is not used for live
customer-facing answers — see `19_Source_Conflict_Register.md`, historical audit citation only.)*

**Q: What are the ingredients?**
A: The production formulation includes DM water, hydrochloric acid (HCl), SLES, an acid
thickener, a colourant, and a fragrance. Full chemical/INCI names aren't yet confirmed for
public disclosure, and this product's specific colour/fragrance names aren't documented yet
either. *(Source: KO-BC-MFG-001, HIGH confidence for the material list.)*

**Q: Is it safe on skin?**
A: We don't have confirmed consumer safety information to answer this yet. *(Source: none found
— KO-BC-SAFETY-002, REQUIRES FOUNDER INPUT.)*

**Q: Can I mix it with other bathroom cleaning products?**
A: We don't have confirmed information to answer this yet, and recommend not mixing cleaning
products unless the label says it's safe to do so. *(Source: KO-BC-SAFETY-003, REQUIRES FOUNDER
INPUT.)*

**Q: What's the shelf life?**
A: This information isn't available in our records yet. *(Source: KO-BC-SHELF-001, REQUIRES
FOUNDER INPUT.)*

---

## KO-BC-AI-001 — AI Response Guidance

- **KOID:** KO-BC-AI-001
- **Title:** MUV Fresh Bathroom Cleaner™ — AI Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [bathroom-cleaner, ai]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Composed from real sourced facts only; reused pattern from the three prior
  packages (see `23_Knowledge_Reuse_Report.md`).
- **Relationships:** KO-BC-VAR-001, KO-BC-AI-002, KO-BC-AI-003, `17_Care_Response_Objects.md`
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; pattern reused from KO-LD-AI-001/KO-TC-AI-001/KO-DW-AI-001

**Content — what the AI MAY say:**

- Product name (MUV Fresh Bathroom Cleaner™, the canonical name, per `20_Canonical_Naming_Register.md`)
- The 500 ml pack size and fill weight
- General formulation category (HCl-based bathroom surface cleaner)

**Content — what the AI MUST NOT say:**

- Any specific price from this package's content, with or without confidence — price must always
  be resolved live from the Product Catalog API per FR-001/FR-002 (see `LIVE_DATA_MAPPING.md`),
  never recited from a static figure written here
- Any performance, safety, or hygiene claim (none sourced)
- A colour or fragrance name (neither is documented for this product — unlike all three prior
  products, the AI has nothing to name here even if asked)
- Confirmation of a 5 Litre size (does not exist in any source)

---

## KO-BC-AI-002 — AI Escalation Rules

- **KOID:** KO-BC-AI-002
- **Title:** MUV Fresh Bathroom Cleaner™ — AI Escalation Rules
- **Category:** AI Response Knowledge
- **Tags:** [bathroom-cleaner, ai, escalation]
- **Version:** 1.0
- **Confidence:** N/A
- **Evidence:** Cross-referenced against `lib/eios/cognitive-state.ts`'s real SAFETY-category
  escalation rule; reused pattern.
- **Relationships:** KO-BC-SAFETY-002, KO-BC-SUPPORT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/eios/cognitive-state.ts`

**Content:**

Escalate to a human when: (1) any safety-related question is asked; (2) a firm price is requested
and the live Product Catalog lookup cannot be completed or confirmed at that moment (per FR-001/
FR-002, pricing itself is resolved live from the Product Catalog API, not escalated as an internal
conflict — see `LIVE_DATA_MAPPING.md`); (3) a complaint is raised — routes to Support
(KO-BC-SUPPORT-001).

---

## KO-BC-AI-003 — AI Confidence Rules

- **KOID:** KO-BC-AI-003
- **Title:** MUV Fresh Bathroom Cleaner™ — AI Confidence Rules
- **Category:** AI Response Knowledge
- **Tags:** [bathroom-cleaner, ai, confidence]
- **Version:** 1.0
- **Confidence:** N/A
- **Evidence:** Cross-referenced against `lib/intelligence/confidence-engine.ts`; reused pattern.
- **Relationships:** KO-BC-AI-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/intelligence/confidence-engine.ts`

**Content:**

Same four-tier confidence rule as all three prior packages. This product has the **fewest
HIGH-confidence facts of the four** — even pricing, normally a safe HIGH-confidence fact, is
CONFLICTED here rather than HIGH or even MEDIUM.
