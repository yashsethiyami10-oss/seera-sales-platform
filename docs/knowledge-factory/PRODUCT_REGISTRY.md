# MUV Product Knowledge Factory™ — Product Registry

> One row per Product Family. Updated on freeze, remediation, or new-family creation.

| # | Product Family | KOID Prefix | Pack Size(s) | Knowledge Objects | Status | FR-001/FR-002/FR-003/FR-004/FR-005/FR-006 | Frozen Date |
|---|---|---|---|---|---|---|---|
| 1 | MUV Liquid Detergent™ | KO-LD- | 3 fragrances × 2 sizes (6 SKUs) | 40 | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 2 | MUV Floral Toilet Cleaner™ | KO-TC- | 500ml, 5L | ~38 | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 3 | MUV Spark Dishwash Gel™ | KO-DW- | 500ml, 1L, 5L | 41 | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 4 | MUV Fresh Bathroom Cleaner™ | KO-BC- | 500ml | 45 | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 5 | MUV Crystal Glass Cleaner™ | KO-GC- | 500ml | 48 | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 6 | MUV Floor Cleaner™ | KO-FC- | Velvet Mist (1L, 5L), Cloud Walk (1L, 5L), Rose Water (unsourced) | 54 (46 parent + 8 variant) | FROZEN, APPROVED | Remediated | pre-2026-07-31 (remediated 2026-07-31) |
| 7 | MUV Pure Bleach™ | KO-PB- | 500ml | 62 | **CONDITIONAL FREEZE** | FR-001/FR-002 compliant from inception (FR-003 postdates this package) | 2026-07-31 |
| 8 | MUV Black Phenyl™ | KO-BP- | 1L (Chart conflictingly shows 500ml — see package's `14_FOUNDER_GAPS.md`) | 65 | **CONDITIONAL FREEZE** | FR-001/FR-002 compliant from inception (FR-003 postdates this package) | 2026-07-31 |
| 9 | MUV White Phenyl™ | KO-WP- | 1L, 5L (no conflict) | 65 | **CONDITIONAL FREEZE** | FR-001/FR-002/FR-003 compliant from inception; first package built under FR-003 Knowledge Reuse First (30.8% reuse) | 2026-07-31 |
| 10 | MUV Body Wash™ | KO-BW- | Crimson Veil, Velvet Oak, Midnight Frost — 250ml, 950ml each (all fully sourced, symmetric) | 72 (63 parent + 9 variant) | **CONDITIONAL FREEZE** | FR-001/FR-002/FR-003/FR-004 compliant from inception; first package under FR-004; retroactively FR-005 compliant at freeze time (FR-005 postdates authoring, directly triggered by this package's findings); 26.4% reuse | 2026-07-31 |
| 11 | MUV Hand Wash™ | KO-HW- | Silk Blossom (500ml, 5L), Ocean Fresh (500ml, 5L), Citrus Blast (250ml, 500ml), Life Shield (250ml, 500ml) — Founder-verified asymmetric availability, 8 real SKUs | 77 (65 parent + 12 variant) | **FINAL FREEZE** | FR-001/FR-002/FR-003/FR-004/FR-005 compliant from inception; first package under FR-005; pre-FR-006 (inline Unknown-marker pattern preserved, not retroactively rewritten); first package with a Founder-pre-verified partial Variant Availability Matrix; 23.4% reuse | 2026-07-31 |
| 12 | MUV Car Wash™ | KO-CW- | 500ml, 5L (no conflict, single-variant product) | 54 (all parent — FR-004 Not Applicable) | DRAFT — Pending Founder Review | FR-001/FR-002/FR-003/FR-006 compliant from inception; first package under FR-006; final product family of this repository; 33.3% reuse | — |

## Notes

- Products 1–6 are the "legacy six" — built before `CONSTITUTION.md`/`FR-001` existed, then fully
  remediated under `FR-002` on 2026-07-31. See `LEGACY_REMEDIATION_REPORT.md`.
- Product 7 (Pure Bleach) is the first package built entirely under the new standard structure
  (`README.md`/`00`–`10`/`11_JSON`/`12_Validation`/`13_Reports`/`MASTER_*.md`) and the new
  Commercial/Knowledge Separation regime from its first Knowledge Object onward.
- Product 8 (Black Phenyl) additionally introduces `14_FOUNDER_GAPS.md` as a new mandatory file,
  and carries a real, confirmed pack-size conflict (Chart 500ml vs. SOP 1L) — the third
  independently-verified conflict this session corroborating a pre-existing
  `conflict-service.ts` comment.
- Legacy naming pattern: every product whose Founder-given official name differs from what its
  source documents actually say (Bathroom Cleaner's "Fresh," Glass Cleaner's "Crystal," Pure
  Bleach's "Pure") is resolved the same way — official name wins per direct Founder Instruction,
  source name preserved as a legacy reference only, never presented as an open conflict.
- "CONDITIONAL FREEZE" (distinct from plain "FROZEN, APPROVED") denotes a package that is
  internally complete and validated but has a Founder-flagged content-completeness gap large
  enough to warrant real input before customer-facing launch — see the package's own
  `13_Reports/08_Freeze_Recommendation.md` (or `09_Freeze_Recommendation.md` for packages with a
  Knowledge Reuse Summary inserted at position 8, from White Phenyl onward).
- Product 9 (White Phenyl) is the first package built under `FR-003` (Knowledge Reuse First) and
  independently confirmed the Black Phenyl↔White Phenyl product-identity relationship that Black
  Phenyl's own package could only presume — resolving that open question without modifying the
  frozen Black Phenyl package.
- Product 10 (Body Wash) is the first Body Care category package this session and the first
  built under `FR-004` (Variant Inheritance Architecture), successfully generalizing the pattern
  first built for Floor Cleaner to a product where all three variants are fully sourced (no
  unsourced variant like Rose Water) and the override point is fragrance rather than colour. It
  also carries the most severe safety-documentation gap of any product this session (zero
  sourced safety content for a direct-skin-contact product) and a newly-discovered data conflict
  between the real, sourced variants and an unrelated `prisma/seed.ts` placeholder ("MUV
  Cleanse") — see the package's own `13_Reports/07_Product_Quality_Score.md` Safety Risk Flag.
  Approved for CONDITIONAL FREEZE 2026-07-31; its zero-safety-content finding was the direct
  trigger for `FR-005` (Safety Critical Product Classification), recorded the same day.
- Product 11 (Hand Wash) is the first Personal Care category package this session and the first
  built under `FR-005` — mandatory Usage/Safety/Contraindications/First Aid/Storage/Shelf Life
  documentation, with dermatological, antibacterial, and skin-safe claims all forbidden absent a
  real source. It is also the first package with a Founder-pre-verified, deliberately asymmetric
  Variant Availability Matrix (8 of the 12 possible Variant×Pack-Size combinations are real;
  the other 4 must never be created or inferred) — a new architectural concern (Variant
  Availability) tracked separately from Variant Inheritance (FR-004). Approved for **FINAL
  FREEZE** 2026-07-31 under the newly-adopted `FR-006` Single Source of Truth architecture — its
  existing inline field-by-field content is preserved exactly as authored, not retroactively
  rewritten to the CMS-reference pattern (see `CONSTITUTION.md` Article 9).
- Product 12 (Car Wash) is the **final product family** of the current Knowledge Library
  repository and the first built entirely under `FR-006` — Usage/Safety/Contraindications/First
  Aid/Storage/Shelf Life are referenced via the CMS pattern (`Source: Website Product Master /
  Authority: CMS / Retrieval: Runtime / Status: Single Source of Truth`) rather than authored
  inline, mapped to the real `ProductIntelligence`/`ProductIntelligenceVersion.sections` schema
  as the closest evidence-grounded match for "Website Product Master." It is also the first
  package since Pure Bleach/Black Phenyl/White Phenyl to correctly need no variant architecture
  at all (`FR-004` Not Applicable — single formula, two pack sizes, zero variant-specific process
  steps), confirmed via source audit rather than assumed. Zero conflict exists between the
  Product Chart and SOP — the cleanest source agreement of any product this session. A real
  naming-adjacency conflict with `prisma/seed.ts`'s "MUV Shield" was independently corroborated
  against the real Chart/SOP data, and this package's own "Claims Validation" discipline
  (explicitly required by this task) held the line against borrowing MUV Shield's unsourced
  wax/gloss-lock/paint-safe claims. Highest Knowledge Reuse percentage (33.3%) of any package
  this session. Awaiting Founder review.
