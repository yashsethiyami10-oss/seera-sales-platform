# MUV Body Wash™ — Founder Rules (Application Record)

> Records how the global `FOUNDER_RULES.md` ledger applies specifically to this package.

---

## KO-BW-FR-001 — FR-001 (Commercial/Knowledge Separation) Application

- **Confidence:** HIGH
- **Evidence:** `FOUNDER_RULES.md` FR-001

**Content:** This package stores none of the eleven commercial fields anywhere. The commercial
figures found during source research (Product Chart rows 32–37) are recorded, as numbers, only in
`00_Source_Register.md`, explicitly labeled historical source-audit citations. See
`10_LIVE_DATA_MAPPING.md`.

---

## KO-BW-FR-002 — FR-002 (Full Remediation Pass) — Not Applicable

- **Confidence:** HIGH

**Content:** Applies to the six pre-Constitution packages only. Not applicable here.

---

## KO-BW-FR-003 — FR-003 (Knowledge Reuse First) Application

- **Confidence:** HIGH
- **Evidence:** `13_Reports/09_Knowledge_Reuse_Summary.md`

**Content:** No specific prior-package subset was named in this task's instruction, unlike White
Phenyl's explicit list. Per `01_Requirements.md`, this package therefore compares against the
full set of nine prior packages, with Floor Cleaner given particular weight as the only other
Variant Inheritance precedent. Full accounting in `13_Reports/09_Knowledge_Reuse_Summary.md`.

---

## KO-BW-FR-004 — FR-004 (Variant Inheritance Architecture) Application

- **Confidence:** HIGH — first package to apply this rule
- **Evidence:** `FOUNDER_RULES.md` FR-004; `02_Product_Architecture.md` KO-BW-INHERIT-001

**Content:** This is the first package built under `FR-004`. The Variant Inheritance Map is
embedded in `02_Product_Architecture.md` (no standalone file was named in this task's file
list). All three variants (Crimson Veil, Velvet Oak, Midnight Frost) are confirmed to inherit
the full Parent-level formula, process, QC, and safety-absence findings — a cleaner case than
Floor Cleaner's, since none of the three variants here is unsourced (unlike Rose Water). The
single override point is fragrance (SOP Step 9); colour is explicitly shared, not a variant
override — a real, sourced structural difference from Floor Cleaner worth noting for future
multi-variant packages: **the override point is whatever the source SOP's own variant-specific
process line actually is, never assumed to be colour by default.**

---

## KO-BW-FR-005 — Naming — No Resolution Required

- **Confidence:** HIGH
- **Evidence:** `00_Source_Register.md` naming finding

**Content:** All four names (parent + 3 variants) match the Product Chart and SOP exactly — no
naming resolution needed, the same clean situation as Floor Cleaner's Velvet Mist/Cloud Walk.

---

## KO-BW-FR-006 — Never Invent (Strict Application, Extended to Cosmetic/Dermatological Claims)

- **Confidence:** HIGH
- **Evidence:** This task's explicit instruction; `03_Product_Intelligence.md`; `08_Safety.md`

**Content:** Every field without a real source is marked Unknown/Founder Decision Required. This
package applies particular discipline against inventing cosmetic or dermatological claims,
fragrance notes, or emotional claims — a real, sourced Knowledge Library governance rule
explicitly forbids unsupported "safe," "non-toxic," "chemical-free," or "dermatologically
tested" claims, and this package follows it strictly throughout. The `prisma/seed.ts` "MUV
Cleanse" record's marketing claims and ingredient list are explicitly never used as a source for
any of the three real variants (`00_Source_Register.md` §5).

---

## KO-BW-FR-007 — Governance Document Scope

- **Confidence:** HIGH

**Content:** Only `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`
are treated as authoritative governance documents.
