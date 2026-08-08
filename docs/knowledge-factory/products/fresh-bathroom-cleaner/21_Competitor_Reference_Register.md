# MUV Fresh Bathroom Cleaner™ — Competitor Reference Register

> Full-text scan of every source consulted for this product family (Product Chart, Production
> SOP, Knowledge Library, AI Sutra files, seed data, `lib/inst-sales/consumption-rules.ts`,
> `lib/knowledge-factory/conflict-service.ts`) against the named competitor-brand list: Comfort,
> Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel,
> Tide, Dettol.

---

## KO-BC-COMPETITOR-001 — Competitor Brand Scan Result

- **KOID:** KO-BC-COMPETITOR-001
- **Title:** MUV Fresh Bathroom Cleaner™ — Competitor Brand Reference Scan
- **Category:** Competitor Reference
- **Tags:** [bathroom-cleaner, competitor-scan, governance]
- **Version:** 1.0
- **Confidence:** HIGH — exhaustive scan of all sourced material, verified result
- **Relationships:** KO-BC-GQ-001 (GQ-09), `19_Source_Conflict_Register.md` Comparison 4
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Direct text scan of all sources listed in `00_Source_Register.md`

**Content:**

**Result: ZERO genuine competitor brand references found** in any Bathroom Cleaner source
material (Product Chart row 12, Production SOP full text, Knowledge Library, AI Sutra files).

Unlike Toilet Cleaner (where "Harpic Floral" was found verbatim as a fragrance descriptor),
Bathroom Cleaner's sources contain **no competitor brand name at all** — not even as an informal
descriptor, since this product has no named fragrance/colour to begin with (see
`04_Ingredients_and_Functions.md`).

**False positives explicitly checked and ruled out** (same discipline as the Dishwash Gel
package):

| String matched | Found in | Why it is NOT a competitor reference |
|---|---|---|
| "Comfort" (substring of "Comfortable") | Not actually present in Bathroom Cleaner sources — checked as a precaution since it appeared as a false positive in a prior product's scan; confirmed absent here | N/A — listed for audit completeness only |
| "Rin" (substring of "Rinse") | SOP process steps reference "rinse"/"rinsing" language incidentally in the general household-cleaning-process sense (not literally present as a manufacturing instruction verb in this specific SOP, but checked as a precaution given "Rin" is a listed competitor brand) | "Rinse" is a generic English cleaning verb, not a reference to the Rin brand |

**Scan methodology:** direct substring/keyword search of the extracted SOP text
(`word/document.xml`), the Product Chart PDF text, and repo-wide grep of
`lib/knowledge-factory/`, `prisma/seed.ts`, and `lib/inst-sales/consumption-rules.ts` for each of
the 16 named brands, case-insensitive, with manual review of every hit for false positives (the
"Comfort"/"Rin" substring problem identified in the Dishwash Gel package).

**Compliance:** no competitor name appears anywhere in this package's customer-facing content
(`13_Customer_Support.md`, `14_FAQs_and_AI_Responses.md`, `17_Care_Response_Objects.md`) or any
other file — nothing to scrub or launder, since the source material was already clean.
