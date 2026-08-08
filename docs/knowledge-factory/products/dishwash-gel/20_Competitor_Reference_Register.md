# MUV Dishwash Gel™ — Competitor Reference Register

> First applied as a dedicated register this product family (the concept was informed by the
> "Harpic Floral" finding in the Toilet Cleaner package). Records the full competitor-name scan
> performed and its result — a "zero found" result is recorded explicitly and verifiably, not
> silently omitted, matching this package's established discipline for other registers.

---

## KO-DW-COMPETITOR-001 — Competitor Detection Scan

- **KOID:** KO-DW-COMPETITOR-001
- **Title:** MUV Dishwash Gel™ — Competitor Brand Detection
- **Category:** Competitor Reference
- **Tags:** [dishwash-gel, competitor-detection, governance]
- **Version:** 1.0
- **Confidence:** HIGH — a completed, exhaustive scan against a defined watch-list plus
  open-ended review, not a partial check
- **Relationships:** KO-DW-MFG-001, KO-DW-SALES-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Full-text review of every Dishwash Gel-related source document found in this
  package's research pass

**Content:**

**Scan scope:** the complete extracted text of `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`,
all three Product Chart rows (9–11), the Knowledge Library's category-level mention (line 5553),
and every code-level hit (`consumption-rules.ts`, `consumption-engine.ts`,
`inst-sales.ts`, `SurveyForm.tsx`, `inst-visits.ts`, `schema.prisma`).

**Watch-list checked explicitly:** Comfort, Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic,
Domex, Lizol, Colin, Robin, Rin, Ariel, Tide, Dettol.

**Result: ZERO competitor brand references found anywhere in Dishwash Gel source material.**

Every proper noun appearing in the SOP is either MUV's own product name or a generic chemical/
ingredient abbreviation (DM Water, EDTA, LABSA, SLES, CAPB, CDEA) — none resembles a consumer
brand name. This is a materially different, cleaner result than the Toilet Cleaner package,
where "Harpic Floral" appeared as a literal fragrance descriptor in that product's SOP.

**Institutional-survey field note (not a source-document finding, included for completeness):**
`prisma/schema.prisma`'s `InstSurvey.currentDishwash` field is a free-text competitor-name
capture field used during institutional sales visits (e.g. a sales officer might type "Vim" or
"Pril" into this field when recording what a prospect currently uses) — this is a real platform
feature, but it is **empty schema structure, not source content**, and contains no actual
competitor name unless and until a real sales visit populates it. It is not a "competitor
reference" in the sense this register tracks (a name appearing in MUV's own product/
manufacturing documentation), and is noted here only for completeness/transparency, not counted
toward the "zero found" result above.

**Conclusion:** no `Competitor_Reference_Register` entry needs Founder action for this product —
this file exists to prove the check was performed, not because a resolution is required.
