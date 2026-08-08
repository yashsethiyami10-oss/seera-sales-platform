# MUV Car Wash™ — Package Overview

> Product Family 12 of the MUV Product Knowledge Factory™ — **the final product family of the
> current repository**, per the Founder's explicit framing. Category: Car Care. First package
> built entirely under `FR-006` (Single Source of Truth / CMS Authority).

---

## What makes this package structurally different from every prior one

1. **Single-variant product family.** Unlike every fragrance/colour-variant family this session,
   the Chart and SOP both agree the product is simply **"MUV Car Wash"** — no sub-variant name.
   `FR-004` (Variant Inheritance Architecture) is therefore **Not Applicable** — there is nothing
   to inherit from a Parent to a Variant; there is only one formula in two pack sizes. This
   matches the "variant override logic (only where genuinely required)" instruction directly:
   here, it genuinely is not required.
2. **No Chart/SOP conflict of any kind.** Pack sizes (500ml, 5L) and pricing match exactly
   between the Product Chart and the Production SOP (see `00_Source_Register.md` §1–§2 for the
   historical figures) — the cleanest source agreement of any product this session.
3. **First package built entirely under `FR-006`.** Usage, Safety, Contraindications, First Aid,
   Storage, and Shelf Life are referenced via the CMS pattern (`Source: Website Product Master /
   Authority: CMS / Retrieval: Runtime / Status: Single Source of Truth`) rather than authored
   inline as sourced-fact-or-`Unknown` content — see `08_Safety.md`. This is a real simplification
   versus Hand Wash's field-by-field `Unknown — Founder Decision Required` pattern, but it does
   **not** mean the underlying content exists anywhere yet — see `14_FOUNDER_GAPS.md`.
4. **A real, confirmed naming-adjacency conflict with `prisma/seed.ts`'s "MUV Shield."** MUV
   Shield is a different, unrelated product: different name, a materially higher price (see
   `00_Source_Register.md` §3 for the historical comparison), a single 500ml pack vs. this
   product's 500ml+5L, and unsourced marketing claims ("gloss-lock formula," "safe on all
   exterior finishes") that have no counterpart in the real SOP's formula or QC criteria. Never
   used as a source here. This independently corroborates the naming-adjacency flag the Hand Wash
   package's own audit already raised about MUV Shield.
5. **Claims Validation is a first-class concern for this package** (explicitly named in the
   Founder's task Product Scope). The SOP's own QC criteria support "clear glossy liquid," "rich
   foam," and "smooth finish on vehicle" as sourced facts — but **not** "wax," "gloss-lock,"
   "paint-safe," or "scratch-free," none of which appear anywhere in the real formula or QC
   table. These four terms are explicitly the kind of claim MUV Shield's own unsourced
   `benefits`/`safety` fields use — this package draws that line explicitly rather than borrowing
   them. See `03_Product_Intelligence.md` KO-CW-INTEL-008.
6. **No institutional consumption category exists yet** (`lib/inst-sales/consumption-rules.ts`
   has no `CAR_WASH` member in its `ConsumptionCategory` union) — despite **"Car Wash" already
   being a real, tracked B2B customer/business-type value** in
   `lib/validations/inquiry.ts`'s `BUSINESS_TYPES` list. This is a genuine, real product-market
   signal grounded in existing platform code, flagged as a gap in `14_FOUNDER_GAPS.md`.
7. **Zero sourced safety content in the SOP**, the same pattern found for every prior MUV
   production SOP — but for this package, that absence is the expected, `FR-006`-governed state,
   not a defect requiring field-by-field disclosure the way it did for Hand Wash.

## Knowledge Reuse

Per `FR-003`, compared against all eleven prior packages. Pure Bleach (the original simple,
single-SKU package) is given particular weight as the closest structural precedent — this package
generalizes that lean, no-variant-architecture pattern for the first time since Pure Bleach, now
combined with `FR-006`'s CMS-reference simplification.

## Commercial Data

No MRP, selling price, discount, images, stock, availability, URL, slug, or marketplace pricing
is stored anywhere. Historical Chart/SOP figures are recorded, labeled, in `00_Source_Register.md`
only. See `10_LIVE_DATA_MAPPING.md`.

## Stop Rule

Per the Founder's explicit instruction: **STOP** after this package is complete. This is the
final product family of the current repository — do not begin any new product family, repository
refactoring, or documentation expansion without explicit Founder approval.
