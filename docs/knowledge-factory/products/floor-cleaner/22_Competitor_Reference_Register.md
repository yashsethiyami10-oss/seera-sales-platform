# MUV Floor Cleaner™ — Competitor Reference Register

> Full-text scan of every source consulted for this product family (Product Chart, Production
> SOP, Knowledge Library, AI Sutra files, seed data, `lib/inst-sales/consumption-rules.ts`,
> `lib/knowledge-factory/conflict-service.ts`) against the named competitor-brand list: Comfort,
> Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel,
> Tide, Dettol. **Lizol, Domex, and Dettol are real, well-known floor-cleaner competitor brands
> in the Indian market — given special attention in this scan since they are the most directly
> relevant competitor names on the list for this specific product category.**

---

## KO-FC-COMPETITOR-001 — Competitor Brand Scan Result

- **KOID:** KO-FC-COMPETITOR-001
- **Title:** MUV Floor Cleaner™ — Competitor Brand Reference Scan
- **Category:** Competitor Reference
- **Tags:** [floor-cleaner, competitor-scan, governance]
- **Version:** 1.0
- **Confidence:** HIGH — exhaustive scan of all sourced material, verified with word-boundary
  matching to eliminate substring false positives
- **Relationships:** KO-FC-GQ-001 (GQ-09), `20_Source_Conflict_Register.md` Comparison 6
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Direct text scan of all sources listed in `00_Source_Register.md`

**Content:**

**Result: ZERO genuine competitor brand references found** in any Floor Cleaner source material
(Product Chart rows 14–17, Production SOP full text, Knowledge Library, AI Sutra files).

**Lizol, Domex, and Dettol specifically checked with zero hits** anywhere in the Product Chart,
the SOP, or the Knowledge Library.

**Methodology note — a real false-positive problem was found and corrected mid-scan:** an
initial unbounded-substring grep for "Rin" against the Knowledge Library produced roughly 250
noisy false positives (matching inside words like "du**rin**g," "b**rin**g," "P**rin**t"). Re-
running with word-boundary matching (`\bRin\b`) returned zero genuine matches. This is a more
severe version of the same false-positive class flagged in prior packages ("Comfort" inside
"Comfortable," "Rin" inside "Rinse") — worth recording as a methodology note for any future
product family scans, since a brand name that's also a common English word-fragment (like "Rin")
needs word-boundary matching, not simple substring search, to produce a trustworthy result.

**Scan methodology:** direct word-boundary keyword search of the extracted SOP text
(`word/document.xml`), the Product Chart PDF text, the Knowledge Library's Floor-Cleaner-relevant
passage and the entire Knowledge Library file, and repo-wide grep of
`lib/knowledge-factory/`, `prisma/seed.ts`, and `lib/inst-sales/consumption-rules.ts` — for each
of the 16 named brands, case-insensitive, with word-boundary enforcement and manual review of
every hit for false positives.

**Compliance:** no competitor name appears anywhere in this package's customer-facing content
(`13_Customer_Support.md`, `14_FAQs_and_AI_Responses.md`, `16_Care_Response_Objects.md`) or any
other file.
