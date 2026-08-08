# MUV Dishwash Gel™ — FAQs & AI Responses

---

## KO-DW-FAQ-001 — Customer FAQ Set

- **KOID:** KO-DW-FAQ-001
- **Title:** MUV Dishwash Gel™ — Customer FAQs
- **Category:** FAQ
- **Tags:** [dishwash-gel, faq]
- **Version:** 1.0
- **Confidence:** Mixed — see each answer
- **Evidence:** See individual referenced KOs
- **Relationships:** KO-DW-VAR-001/002/003, KO-DW-SAFETY-002/003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see individual answers

**Content:**

**Q: What sizes does MUV Dishwash Gel come in?**
A: 500 ml, 1 Litre, and 5 Litre. *(Source: KO-DW-VAR-001/002/003, HIGH confidence.)*

**Q: How much does it cost?**
A: **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)**. Per FR-001/FR-002,
the AI must never answer this question from Knowledge Package content; current MRP/selling price
for each pack size is always fetched live from the Product Catalog at answer time. *(Historical
note: the Product Chart recorded ₹85/₹155/₹699 for 500 ml/1 L/5 L during source research — see
`00_Source_Register.md` for that citation; it is not a live, AI-answerable fact.)*

**Q: What are the ingredients?**
A: The production formulation includes DM water, EDTA, caustic soda, LABSA slurry, SLES, CAPB,
CDEA, glycerine, phenoxy ethanol, a yellow colourant, lemon fragrance, salt, and citric acid
solution for pH adjustment. Full chemical/INCI names are not yet confirmed for public
disclosure. *(Source: KO-DW-MFG-001, HIGH confidence for the list.)*

**Q: Is it gentle on hands?**
A: We don't have confirmed information to answer this yet. *(Source: none found —
KO-DW-SAFETY-002, REQUIRES FOUNDER INPUT.)*

**Q: What's the shelf life?**
A: This information isn't available in our records yet. *(Source: none found —
KO-DW-SHELF-001, REQUIRES FOUNDER INPUT.)*

**Q: Can I use it in a dishwashing machine?**
A: We don't have confirmed information to answer this yet — it's formulated as a hand-
dishwashing gel based on what we know so far. *(Source: KO-DW-IDENT-002, REQUIRES FOUNDER INPUT
for a definitive answer.)*

**Q: Can I buy this in bulk for my restaurant/hotel?**
A: The 5 L size may suit bulk kitchen use, but confirmed institutional pricing isn't available
yet. *(Source: KO-DW-SALES-001, REQUIRES FOUNDER INPUT for institutional pricing.)*

---

## KO-DW-AI-001 — AI Response Guidance (Customer, Sales, Manufacturing, Support)

- **KOID:** KO-DW-AI-001
- **Title:** MUV Dishwash Gel™ — AI Response Guidance
- **Category:** AI Response Knowledge
- **Tags:** [dishwash-gel, ai, response-guidance]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Composed from real sourced facts only; cross-referenced against real platform
  AI-safety code. **Reused pattern**, not re-derived from scratch — see
  `22_Knowledge_Reuse_Report.md` for the explicit cross-package reuse mapping to
  KO-LD-AI-001..006 and KO-TC-AI-001..006.
- **Relationships:** KO-DW-VAR-001/002/003, KO-DW-AI-002 (escalation), KO-DW-AI-003 (confidence)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; see individual referenced KOs; pattern reused from KO-LD-AI-001/KO-TC-AI-001

**Content — what the AI MAY say, grounded in sourced fact:**

- Product family name and three pack sizes (500 ml / 1 L / 5 L).
- Category (Home Care), product type (hand dishwashing gel).
- Yellow colour and lemon fragrance identity.
- The pH-based QC criterion (6.5–7.5) if asked a manufacturing-facing question — this is the
  most fully-sourced QC fact across all three product families and may be stated with HIGH
  confidence.

**Content — what the AI MUST NOT say:**

- Any performance claim ("cuts grease fastest," "gentle on hands," "eco-friendly")
- Any consumer safety/skin-contact claim (KO-DW-SAFETY-002 unsourced)
- Shelf life
- Dishwashing-machine suitability (not confirmed either way)
- Any competitor comparison (none exists to draw from — confirmed clean, see
  `20_Competitor_Reference_Register.md`)
- **(Per FR-001/FR-002) Any MRP, selling price, discount, stock/availability status, product
  image, product URL, or product slug sourced from this Knowledge Package.** Those fields are
  never resolved from this package's content — they are always fetched live from the Product
  Catalog API at answer time (see `LIVE_DATA_MAPPING.md`). This applies even though this package
  happens to hold a historical, single-sourced ₹85/₹155/₹699 Product Chart citation
  (`00_Source_Register.md`) — that citation must never be surfaced as a current price.

---

## KO-DW-AI-002 — AI Escalation Rules

- **KOID:** KO-DW-AI-002
- **Title:** MUV Dishwash Gel™ — AI Escalation Rules
- **Category:** AI Response Knowledge
- **Tags:** [dishwash-gel, ai, escalation]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against `lib/eios/cognitive-state.ts`'s real SAFETY-category
  escalation rule. **Reused pattern from KO-LD-AI-005/KO-TC-AI-005.**
- **Relationships:** KO-DW-SAFETY-002, KO-DW-SUPPORT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/eios/cognitive-state.ts`

**Content:**

Escalate to a human when:
1. Any skin-reaction or safety-related question is asked — no consumer safety data is sourced.
2. A dishwashing-machine-suitability question is asked with intent to actually use it that way —
   not confirmed either direction.
3. A complaint is raised — routes to Support (KO-DW-SUPPORT-001).

---

## KO-DW-AI-003 — AI Confidence Rules

- **KOID:** KO-DW-AI-003
- **Title:** MUV Dishwash Gel™ — AI Confidence Rules
- **Category:** AI Response Knowledge
- **Tags:** [dishwash-gel, ai, confidence]
- **Version:** 1.0
- **Confidence:** N/A (behavioral guidance)
- **Evidence:** Cross-referenced against `lib/intelligence/confidence-engine.ts`. **Reused
  pattern from KO-LD-AI-006/KO-TC-AI-006.**
- **Relationships:** KO-DW-AI-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived; cross-checked against `lib/intelligence/confidence-engine.ts`

**Content:**

Same four-tier confidence rule (HIGH/MEDIUM/LOW/N/A) as both prior packages. One
product-specific nuance, now historical only: the Product Chart's pricing citation was HIGH
confidence in the sense that the figures were clearly stated, but **uncorroborated** (only one
source existed, vs. Toilet Cleaner's two-source match). Per FR-001/FR-002, this nuance no longer
has any live effect — the AI never states a price from this package's content at all, regardless
of confidence tier, so the corroborated-vs-uncorroborated distinction is preserved here only as a
sourcing note about the historical citation in `00_Source_Register.md`, not as guidance for how
confidently the AI may quote a price (it may not quote one from this package under any
confidence level).
