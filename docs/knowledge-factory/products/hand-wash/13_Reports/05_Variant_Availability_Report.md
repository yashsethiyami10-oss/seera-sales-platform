# MUV Hand Wash™ — Variant Availability Report

> New required report, specific to this package's Founder-pre-verified, deliberately asymmetric
> Variant Availability Matrix (execution step 5, distinct from Variant Inheritance, step 6).

---

## The matrix, as built

| Variant | 250ml | 500ml | 5L |
|---|---|---|---|
| Silk Blossom | ❌ | ✅ | ✅ |
| Ocean Fresh | ❌ | ✅ | ✅ |
| Citrus Blast | ✅ | ✅ | ❌ |
| Life Shield | ✅ | ✅ | ❌ |

**8 of 12 theoretical combinations (66.7%) are real.** Every ✅ has a corresponding Knowledge
Object (`02_Product_Architecture.md` KO-HW-*-VAR-*); every ❌ has zero Knowledge Objects anywhere
in this package — confirmed by direct grep of `11_JSON/knowledge_objects.json` for the four
excluded combinations, zero matches.

## By pack size

| Pack Size | Variants offered | Variants NOT offered |
|---|---|---|
| 250ml | Citrus Blast, Life Shield | Silk Blossom, Ocean Fresh |
| 500ml | All four | None |
| 5L | Silk Blossom, Ocean Fresh | Citrus Blast, Life Shield |

**500ml is the only pack size common to all four variants.** No variant is available in all three
sizes; no pack size is exclusive to a single variant.

## Verification method

Three independent checks confirm consistency:
1. `02_Product_Architecture.md` KO-HW-AVAIL-001's matrix table.
2. `11_JSON/variant_availability.json`'s `matrix` and `realSKUs` arrays (8 entries, verified via
   PowerShell against `explicitlyExcludedCombinations`' 4 entries — 8+4=12, matching the
   theoretical total).
3. `11_JSON/knowledge_objects.json`'s 8 `level: "variant"` entries under `02_Product_Architecture.md`
   — KOIDs and variant/pack-size pairings match KO-HW-AVAIL-001 exactly.

## Relationship to the Product Chart conflict

The Product Chart's own 8 Hand Wash rows are **not** the same set of 8 as the Founder's verified
matrix (see `00_Source_Register.md` §1; `14_FOUNDER_GAPS.md` gap 3). This package built the
Founder's matrix, not the Chart's row set — consistent with the established precedent that a
direct, current Founder Instruction for this specific package controls. The underlying Chart
discrepancy is not resolved by this report; it remains an open Founder item.

## Why this required a new report type

No prior package (including Floor Cleaner's Rose Water or Black Phenyl's pack-size conflict) had
a Founder-pre-verified, deliberately partial availability grid spanning multiple variants and
pack sizes simultaneously. This report exists to make the built/excluded boundary independently
auditable, separate from the Variant Statistics report (which counts Knowledge Objects) and the
Variant Inheritance section (which governs shared vs. override content, not existence).
