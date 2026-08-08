# MASTER — MUV Hand Wash™

> Single-page index and status summary. Product Family 11 of the MUV Product Knowledge Factory™.
> First package built under `FR-005` (Safety Critical Product Classification) and the first
> package with a Founder-pre-verified, deliberately asymmetric Variant Availability Matrix.

---

## Status

| Field | Value |
|---|---|
| Official Name | MUV Hand Wash™ |
| Category | Personal Care |
| Variants | Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield — all four sourced |
| Pack Sizes | 250ml, 500ml, 5L — **asymmetric, Founder-verified**: Silk Blossom/Ocean Fresh (500ml, 5L only); Citrus Blast/Life Shield (250ml, 500ml only) |
| KOID Prefix | KO-HW- (with -SB-/-OF-/-CB-/-LS- variant infixes) |
| Total Knowledge Objects | 77 (65 Parent + 12 Variant) |
| Real SKUs | 8 of 12 theoretical Variant×Pack-Size combinations |
| Package Version | 1.0 |
| Knowledge Package Status | **FINAL FREEZE** |
| Repository Status | **LOCKED** |
| Architecture Status | **APPROVED** |
| Freeze Date | 2026-07-31 |
| Freeze Reason | All remaining `FR-005` safety and operational fields are intentionally delegated to the Website Product Master under the approved `FR-006` Single Source of Truth architecture. No further duplication is permitted or required. This package's existing inline `Unknown — Founder Decision Required` field-by-field content (pre-`FR-006`) is preserved exactly as authored — see `CONSTITUTION.md` Article 9's Applicability clause; not retroactively rewritten. |
| Post-Freeze Modification Policy | Every file in this package's directory is locked against modification except by explicit, current Founder instruction naming this specific package — see `FREEZE_LOG.md` |
| Commercial Data Stored | None (FR-001/FR-002 compliant from inception) |
| Validation Status | PASSED (15/15 checks, 1 corrected in-pass — see `12_Validation/Commercial_Data_Grep_Check.md`) |
| Product Quality Score | Process Quality 100/100; Content Completeness 69/100 — **see the Safety Risk Flag in `13_Reports/08_Product_Quality_Score.md` before reading this number as reassuring** |
| Knowledge Reuse | 23.4% (17 Parent Objects Reused + 1 Shared Object) / 77 total — see `13_Reports/10_Knowledge_Reuse_Summary.md` |
| Freeze Recommendation | CONDITIONAL FREEZE — WITH ELEVATED CAUTION (see `13_Reports/11_Freeze_Recommendation.md`) |

## File index

| File | Purpose |
|---|---|
| `README.md` | Package overview |
| `00_Source_Register.md` | Source audit, including the Chart-vs-Founder-matrix conflict and two seed-data naming conflicts |
| `01_Requirements.md` | Implementation spec |
| `02_Product_Architecture.md` | Identity, SKUs, naming, **embedded Variant Availability Matrix**, **embedded Variant Inheritance Map** |
| `03_Product_Intelligence.md` | Purpose, mechanism, usage (FR-005 field 1/6), formula, process, QC, pearl effect, gaps |
| `04_Decision_Trees.md` | Availability-aware product-fit trees + 4 variant recommendation logic KOs |
| `05_Customer_Conversation.md` | 12 required flows, including 2 new ones (Availability, Antibacterial Claim) |
| `06_FAQs.md` | Customer FAQ set |
| `07_Objection_Handling.md` | Honest objection responses |
| `08_Safety.md` | Five of six FR-005 mandatory fields, field-by-field; Life Shield antibacterial-claim finding |
| `09_Founder_Rules.md` | Governance application record, including first FR-005 application |
| `10_LIVE_DATA_MAPPING.md` | Commercial field resolution, including availability-data note |
| `14_FOUNDER_GAPS.md` | Standalone, priority-ordered gap register (18 gaps) |
| `11_JSON/` | Machine-readable exports (12 files, includes new `variant_availability.json`) |
| `12_Validation/` | Validation checklist, results, grep check (3 files) |
| `13_Reports/` | Coverage, Validation, KO Stats, Variant Statistics, **Variant Availability Report**, Source Coverage, Missing Knowledge, Product Quality Score, Care Intelligence, Knowledge Reuse Summary, Freeze Recommendation (11 files) |

## Governance

Built under `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`
(`FR-001` through `FR-005`, first package to apply `FR-005`).

## Headline findings

- **All four variants fully sourced, but genuinely asymmetric** — 8 of 12 theoretical
  Variant×Pack-Size combinations are real, per a Founder-pre-verified matrix never inferred or
  expanded. A new architectural concern, Variant Availability, tracked distinctly from Variant
  Inheritance for the first time.
- **Two variant-specific override points** (colour AND fragrance) — a real, sourced structural
  difference from both Floor Cleaner (colour only) and Body Wash (fragrance only).
- **The same severity of safety gap found for Body Wash**, now documented field-by-field per
  `FR-005`'s six mandatory fields (Usage, Safety, Contraindications, First Aid, Storage, Shelf
  Life) — none silently omitted, all explicitly marked `Unknown — Founder Decision Required`.
- **Life Shield's antibacterial/protective claim status actively investigated and confirmed
  unconfirmed** — directly testing `FR-005`'s own named risk example against a real product.
- **A real, unresolved conflict between the Product Chart and the Founder's verified availability
  matrix** — the Chart's 8 rows are not the same set as the Founder's 8 real SKUs.
- **Two naming-adjacency conflicts found in `prisma/seed.ts`** ("MUV Silk Hair Wash," "MUV
  Shield"), neither used as a source.
- **Commercial data**: zero stored anywhere; 5 leaks found and corrected during this package's own
  validation pass (a recurrence of the pattern seen in Pure Bleach/Black Phenyl/White Phenyl,
  after Body Wash had been clean on the first pass).
- **First package under `FR-005`**, and the first to combine multiple override points with
  asymmetric availability in a single Product Family.

## Stop Rule

Superseded — the Founder has since approved this package for FINAL FREEZE and issued the Product
Family 12 (MUV Car Wash™) task. See `FREEZE_LOG.md` and `CHANGE_LOG.md` for the freeze event, and
`docs/knowledge-factory/products/car-wash/` for the next package.
