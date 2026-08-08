# MUV Car Wash™ — Founder Gaps Register

> Structure reused from prior packages, content independently compiled for this product.

---

## Priority 1 — Critical (blocks confident customer-facing use)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 1 | **The `FR-006` CMS source (`ProductIntelligence`) is not yet populated** — Usage, Safety, Contraindications, First Aid, Storage, and Shelf Life all resolve to an empty source today. | The reference pattern is architecturally correct but the AI currently has no real answer for any of these six fields for this (or any) product. | `08_Safety.md` KO-CW-SAFETY-001–005; `03_Product_Intelligence.md` KO-CW-INTEL-003 |
| 2 | **Vehicle-surface compatibility is completely unsourced** (matte finishes, wraps, chrome, plastic trim). | Direct risk of customer damage-related dissatisfaction if the AI is ever pressured into guessing. | KO-CW-INTEL-009 |
| 3 | **No source confirms or denies any wax/gloss-lock/paint-protection claim**, despite the unrelated "MUV Shield" seed record using exactly this language for a different product. | Real risk of an assumed claim being borrowed across products if this discipline isn't maintained. | KO-CW-INTEL-008 |

## Priority 2 — Important (materially limits customer-facing usefulness)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 4 | **No institutional consumption-estimation category exists** (`lib/inst-sales/consumption-rules.ts` has no `CAR_WASH` member), despite "Car Wash" already being a real, tracked `BUSINESS_TYPES` institutional customer segment. | A genuine, code-evidenced product-market gap — the institutional sales pipeline can identify a car-wash-business lead but cannot estimate their MUV Car Wash consumption the way it can for five other categories. | `00_Source_Register.md` §6, §9 |
| 5 | **Container material, cap/nozzle type, dispenser mechanism** — not stated for either pack size. | KO-CW-INTEL-007 |
| 6 | **No formal product positioning statement** beyond the SOP's own QC description. | KO-CW-INTEL-001 |
| 7 | **`prisma/seed.ts`'s "MUV Shield" naming-adjacency conflict is not yet reflected in `lib/knowledge-factory/conflict-service.ts`'s known-conflicts list.** | A real, confirmed conflict (independently corroborating the earlier Hand Wash-audit finding) exists only as documentation, not as a tracked `KnowledgeConflict` record. | `00_Source_Register.md` §3, §7 |

## Priority 3 — Standard completeness gaps

| # | Gap | Related KOID |
|---|---|---|
| 8 | Manufacturer name | KO-CW-IDENT-001 |
| 9 | SKU codes, barcodes (2 real SKUs) | KO-CW-SKU-500/5L |
| 10 | Packaging dimensions, shipping weight | Same |
| 11 | Product images (SOP references exist but are uncaptioned, unusable per-SKU) | `10_LIVE_DATA_MAPPING.md` |

---

## Summary

**11 distinct gaps recorded — 3 Critical, 4 Important, 4 Standard.** Structurally leaner than
every prior package's gap register, reflecting both the absence of variant complexity and
`FR-006`'s consolidation of six previously-separate safety-field gaps into one Critical item (gap
1). The Critical tier's real center of gravity is the currently-unpopulated CMS source (gap 1) —
architecturally correct, but the actual content still doesn't exist anywhere, a fact this
register states plainly rather than letting the CMS reference pattern imply otherwise.
