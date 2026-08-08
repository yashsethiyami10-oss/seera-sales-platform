# MUV Car Wash™ — Missing Knowledge Report

> Full priority-tiered detail in `14_FOUNDER_GAPS.md` (11 gaps: 3 Critical, 4 Important, 4
> Standard).

## FR-006 CMS source — currently unpopulated

Usage, Safety, Contraindications, First Aid, Storage, and Shelf Life all resolve to a
currently-empty CMS source (`ProductIntelligence`). The reference architecture is correct and
mandatory; the content itself does not exist anywhere yet, for this or any MUV product.

## Compatibility and claims — genuinely unsourced

No source states vehicle-surface compatibility (paint types, wraps, chrome, matte finishes) or
confirms any wax/gloss-lock/paint-protection claim. These are explicitly not invented, despite
the unrelated MUV Shield seed record using exactly this kind of language.

## Institutional gap

"Car Wash" is a real, tracked B2B customer segment (`lib/validations/inquiry.ts`
`BUSINESS_TYPES`), but no consumption-estimation category exists for this product in
`lib/inst-sales/consumption-rules.ts` — a genuine, code-evidenced product-market gap.

## What IS well-documented

The shared formula (11 raw materials, exact quantities), the 12-step manufacturing process, QC
criteria (pH, appearance, foam, finish), and fill weights per pack size are all HIGH-confidence,
directly sourced facts with zero Chart/SOP conflict — the cleanest source agreement of any
product this session.
