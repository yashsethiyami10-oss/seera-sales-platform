# MUV Crystal Glass Cleaner™ — Competitor Reference Register

> Full-text scan of every source consulted for this product family (Product Chart, Production
> SOP, Knowledge Library, AI Sutra files, seed data, `lib/inst-sales/consumption-rules.ts`,
> `lib/knowledge-factory/conflict-service.ts`) against the named competitor-brand list: Comfort,
> Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel,
> Tide, Dettol. **"Colin" is a real, well-known glass-cleaner competitor brand in the Indian
> market — given special attention in this scan since it's the single most directly relevant
> competitor name on the list for this specific product category.**

---

## KO-GC-COMPETITOR-001 — Competitor Brand Scan Result

- **KOID:** KO-GC-COMPETITOR-001
- **Title:** MUV Crystal Glass Cleaner™ — Competitor Brand Reference Scan
- **Category:** Competitor Reference
- **Tags:** [glass-cleaner, competitor-scan, governance]
- **Version:** 1.0
- **Confidence:** HIGH — exhaustive scan of all sourced material, verified result
- **Relationships:** KO-GC-GQ-001 (GQ-09), `19_Source_Conflict_Register.md` Comparison 5
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Direct text scan of all sources listed in `00_Source_Register.md`

**Content:**

**Result: ZERO genuine competitor brand references found** in any Glass Cleaner source material
(Product Chart row 13, Production SOP full text, Knowledge Library, AI Sutra files).

**"Colin" specifically checked with no substring-collision risk found** — the string "Colin"
does not appear anywhere in the Product Chart, the Glass Cleaner SOP, or the Knowledge Library,
either as a standalone brand reference or as a substring inside another word (no
"Coliseum"-style false positive exists either).

**One false positive found and ruled out**, consistent with the discipline established in prior
packages:

| String matched | Found in | Why it is NOT a competitor reference |
|---|---|---|
| "Comfort" (substring of "Comfortable") | Knowledge Library, line 2228, in an unrelated typography-guidance table entry ("Body copy \| Comfortable reading across print and digital") | A design-system usage note about body-copy readability, entirely unrelated to Glass Cleaner or any cleaning-product context |

**Scan methodology:** direct substring/keyword search of the extracted SOP text
(`word/document.xml`), the Product Chart PDF text, the Knowledge Library's Glass-Cleaner-relevant
passage and, as a sanity check, the entire Knowledge Library file, and repo-wide grep of
`lib/knowledge-factory/`, `prisma/seed.ts`, and `lib/inst-sales/consumption-rules.ts` — for each
of the 16 named brands, case-insensitive, with manual review of every hit for false positives.

**Compliance:** no competitor name appears anywhere in this package's customer-facing content
(`13_Customer_Support.md`, `14_FAQs_and_AI_Responses.md`, `16_Care_Response_Objects.md`) or any
other file — nothing to scrub or launder, since the source material was already clean.
