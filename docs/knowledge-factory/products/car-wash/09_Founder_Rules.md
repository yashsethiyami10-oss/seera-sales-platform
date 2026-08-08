# MUV Car Wash™ — Founder Rules (Application Record)

> Records how the global `FOUNDER_RULES.md` ledger applies specifically to this package.

---

## KO-CW-FR-001 — FR-001 (Commercial/Knowledge Separation) Application

- **Confidence:** HIGH

**Content:** This package stores none of the eleven commercial fields anywhere. The commercial
figures found during source research (Chart rows 18–19; SOP Packing Standard) are recorded, as
numbers, only in `00_Source_Register.md`, explicitly labeled historical citations. See
`10_LIVE_DATA_MAPPING.md`.

---

## KO-CW-FR-002 — FR-002 (Full Remediation Pass) — Not Applicable

- **Confidence:** HIGH

**Content:** Applies to the six pre-Constitution packages only. Not applicable here.

---

## KO-CW-FR-003 — FR-003 (Knowledge Reuse First) Application

- **Confidence:** HIGH
- **Evidence:** `13_Reports/08_Knowledge_Reuse_Summary.md`

**Content:** No specific prior-package subset was named. Compared against all eleven prior
packages, with Pure Bleach (the original single-SKU, no-variant package) given particular weight
as the closest structural precedent.

---

## KO-CW-FR-004 — FR-004 (Variant Inheritance Architecture) — Not Applicable

- **Confidence:** HIGH
- **Evidence:** `01_Requirements.md`, `02_Product_Architecture.md`

**Content:** MUV Car Wash is a single-variant product — one formula, two pack sizes, zero
variant-specific process steps. No Parent/Variant KO split is authored. This is the first package
since Pure Bleach/Black Phenyl/White Phenyl (all single-SKU-family products, pre-`FR-004`) to have
no variant architecture at all — a deliberate absence per the task's own "variant override logic
(only where genuinely required)" instruction, not an oversight.

---

## KO-CW-FR-005 — FR-005 (Safety Critical Product Classification) — Discipline Applied, Not
Formally Classified

- **Confidence:** MEDIUM — the task did not explicitly designate this product "Safety Critical"
  the way Hand Wash's task did

**Content:** `FR-005` is listed as ACTIVE in this task's Mandatory Founder Rules, and this package
applies its Never-Invent discipline (no unsupported safety/dermatological/functional claims)
precautionarily throughout. However, `FR-005`'s specific six-mandatory-field enumeration
requirement is functionally superseded for this package by `FR-006`'s CMS-reference mechanism —
the same six fields are addressed via reference rather than inline field-by-field marking,
regardless of formal Safety Critical classification. No conflict between `FR-005` and `FR-006`
was found; `FR-006`'s own binding interpretation (`FOUNDER_RULES.md`) states it changes the
*mechanism*, not the underlying requirement that the fields be addressed somehow.

---

## KO-CW-FR-006 — FR-006 (Single Source of Truth Architecture) Application

- **Confidence:** HIGH — first package built entirely under this rule from inception
- **Evidence:** `FOUNDER_RULES.md` FR-006; `08_Safety.md`; `03_Product_Intelligence.md`
  KO-CW-INTEL-003

**Content:** Usage, Safety, Contraindications, First Aid, Storage, and Shelf Life are all
referenced via the CMS pattern (`Source: Website Product Master / Authority: CMS / Retrieval:
Runtime / Status: Single Source of Truth`), mapped to the real `ProductIntelligence`/
`ProductIntelligenceVersion.sections` schema as the closest evidence-grounded fit. The real,
disclosed limitation (this CMS source is currently unpopulated for every product, including this
one) is stated plainly in `08_Safety.md` and `14_FOUNDER_GAPS.md`, per `ARCHITECTURE.md` §5.3 —
never left implicit.

---

## KO-CW-FR-007 — Never Invent (Strict Application, Claims Validation Emphasis)

- **Confidence:** HIGH
- **Evidence:** `03_Product_Intelligence.md` KO-CW-INTEL-008; `00_Source_Register.md` §3

**Content:** Every field without a real source is marked Unknown/Founder Decision Required
(compatibility, positioning) or referenced via CMS (the six `FR-006` fields). Particular
discipline applied against borrowing the unrelated `prisma/seed.ts` "MUV Shield" record's
unsourced wax/gloss-lock/paint-safe claims into this Product Family's content — explicitly tested
and resisted throughout `02_Product_Architecture.md`, `03_Product_Intelligence.md`,
`05_Customer_Conversation.md`, and `07_Objection_Handling.md`.

---

## KO-CW-FR-008 — Governance Document Scope

- **Confidence:** HIGH

**Content:** Only `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`
are treated as authoritative governance documents.
