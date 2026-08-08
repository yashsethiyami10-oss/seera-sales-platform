# MUV Car Wash™ — Source Register

> Full audit record. Unlike every prior product this session, the Founder gave no variant names
> or pack sizes in advance — both were discovered fresh from source material. Source Authority
> Order applied: 1. Current Product Chart, 2. Founder Instructions, 3. Production SOP, 4.
> Knowledge Library, 5. Seed Data, 6. Historical Documents.

---

## §1 — Product Chart — FOUND

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

Rows 18–19 (2 rows, re-derived fresh — no other row anywhere in the chart mentions Car Wash, Car
Shampoo, Car Care, Auto, or Vehicle as a product name):

| # | Product | Quantity | MRP (Rs) |
|---|---|---|---|
| 18 | MUV Car Wash | 500ml | 70 |
| 19 | MUV Car Wash | 5L | 550 |

**These figures are historical citations only — never restated as live commercial data elsewhere
in this package (`FR-001`).** The product name is literally "MUV Car Wash" with no fragrance/
variant sub-name appended — unlike every other liquid-category product this session. This reads
as a single-variant, two-pack-size product, not a multi-variant family.

## §2 — Production SOP — FOUND

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/CARE CARE/MUV_Car_Wash_Production_SOP_With_Photos.docx`

(Subfolder is literally named "CARE CARE" — an apparent typo for "CAR CARE," the only
automotive-related SOP subfolder; full SOPs subfolder list: `BODY CARE`, `CARE CARE`, `FABRIC
CARE`, `HOME CARE`, `PERSONAL CARE`.) Extracted from `word/document.xml`. Single product, single
11-litre-batch formula, two pack sizes — **no variant-specific process branching anywhere**.

**Raw Materials (exact table, per 11L batch):**

| Material | Quantity |
|---|---|
| DM Water | 7.85 L |
| EDTA | 15 g |
| SLES | 2.5 kg |
| CAPB | 200 g |
| CDEA | 100 g |
| IPA | 100 g |
| Silicone Emulsion | 20 g |
| Phenoxy Ethanol | 50 g |
| Colour | 3 g |
| Perfume | 15 ml |
| Salt | 125 g (solution, for viscosity) |

**Manufacturing Procedure (exact, 12 steps, no branching):**

1. "Fill mixing tank with 7.85 L DM water and start stirrer."
2. "Add EDTA and dissolve completely (2 min)."
3. "Slowly add SLES. Mix for 10 min at low speed."
4. "Add CAPB. Mix for 5 min."
5. "Add CDEA. Mix for 5 min."
6. "Add IPA. Mix for 3 min."
7. "Add Phenoxy Ethanol preservative. Mix for 3 min."
8. "Add pre-dissolved colour. Mix for 2 min."
9. "Add perfume. Mix for 5 min."
10. "Premix Silicone Emulsion with a little water and add slowly. Mix for 10 min."
11. "Add salt solution gradually until required viscosity is achieved. Mix for 15 min."
12. "Perform QC check and fill the product."

**Quality Control (exact):** Appearance: clear glossy liquid. pH: 6.5–7.5. Rich foam. No
separation. Smooth finish on vehicle.

**Packing Standard (exact table):**

| Pack | Fill Weight | MRP |
|---|---|---|
| 500 ml | 510 g | ₹70 |
| 5 L | 5100 g | ₹550 |

**Exact match with the Product Chart on both pack sizes and pricing — no conflict, the cleanest
source agreement of any product this session.**

**Safety / Contraindications / First-Aid / Storage / Shelf-Life content: NOT FOUND — confirmed
absent.** The document's complete section list is: title → Product Reference → Raw Materials →
Manufacturing Procedure → Quality Control → Packing Standard. No safety, precautions,
contraindications, first aid, storage, shelf life, or handling section of any kind — the same
absence pattern found in every MUV production SOP this session. Per `FR-006`, this absence is now
the expected, governed state for this package (referenced via CMS, not documented field-by-field
as `Unknown`) — see `08_Safety.md`.

## §3 — `prisma/seed.ts` "MUV Shield" — FOUND, confirmed a DIFFERENT, unrelated product

**File:** `prisma/seed.ts`, lines 112–119 (full entry):

```
name: "MUV Shield", slug: "muv-shield", category: "car-care", hsnCode: "3405", gstRate: 18, bestSellerRank: 4,
shortDescription: "A professional-grade car shampoo with a gloss-lock finish.",
fragranceNotes: null, ingredients: "Aqua, Surfactants, Wax Emulsion.",
directions: "Dilute per label, apply with a wash mitt, rinse thoroughly.",
benefits: "Gloss-lock formula, safe on all exterior finishes.",
safety: "Avoid contact with eyes and skin for prolonged periods.",
variants: [{ size: "500ml", price: 599, mrp: 749, sku: "MUV-CC-SHD-500", stock: 4 }],
```

**Direct comparison against the sourced "MUV Car Wash" (Chart + SOP):**

| Field | MUV Shield (seed.ts) | MUV Car Wash (Chart + SOP) |
|---|---|---|
| Name | "MUV Shield" — never "MUV Car Wash" | "MUV Car Wash" |
| Pack sizes | 500ml only | 500ml AND 5L |
| MRP (500ml) | ₹749 | ₹70 — over 10× lower |
| Ingredients | "Aqua, Surfactants, Wax Emulsion" | DM Water, EDTA, SLES, CAPB, CDEA, IPA, Silicone Emulsion, Phenoxy Ethanol, Colour, Perfume, Salt — no wax anywhere |
| Claims | "Gloss-lock formula, safe on all exterior finishes" | No such claim in the SOP's QC ("clear glossy liquid," "smooth finish on vehicle" describes the liquid/wash result, not a paint-protection claim) |

**Conclusion: MUV Shield and MUV Car Wash are different, unrelated products** — confirmed by
direct comparison, not assumed. This independently corroborates the Hand Wash package's own
naming-adjacency finding about MUV Shield (`docs/knowledge-factory/products/hand-wash/00_Source_Register.md`
§5), now verified against the real Car Wash Chart/SOP data rather than flagged by name-similarity
alone. MUV Shield is never used as a source for any Knowledge Object in this package.

## §4 — Knowledge Library — FOUND (category-level only, no product-specific content)

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge
Library™.txt`

No literal "car wash" as a product. "Car care" (the category) appears at lines 709, 1782, 2125,
2245, 2791, 5331 (generic delivery-vehicle inspection language, unrelated to this product), and
5553. The one concrete, product-adjacent finding: lines 2245/2791 name **"carbon-gloss orange"**
as an exploratory category-colour direction for car care (alongside lavender/purple for body
care, pink for skin care, emerald green for home care) — explicitly caveated at line 2247 as
"evidence-supported category directions, but not a complete final colour specification." **No
governance rule specifically restricting car-care claims language** ("gloss," "wax," "shine,"
"scratch-free," "paint-safe") was found anywhere in this file.

## §5 — AI Sutra — NOT FOUND

Both locations checked (`Muv_AI_Sutra_Master_MASTER1.md`, `Muv_AI_Sutra_Master_Phase1.md`).
Zero matches for car wash/car care/car shampoo/vehicle/automotive/shield.

## §6 — `lib/inst-sales/consumption-rules.ts` — NOT FOUND (no car-wash category exists)

Full `ConsumptionCategory` union: `FLOOR_CLEANER | LAUNDRY_DETERGENT | GLASS_CLEANER |
TOILET_CLEANER | HAND_WASH | DISHWASH`. No `CAR_WASH` member, label, unit, placeholder price, or
estimation function exists. Flagged as a real gap — see `14_FOUNDER_GAPS.md`.

## §7 — `lib/knowledge-factory/conflict-service.ts` — FOUND, header re-confirmed unchanged

Header (lines 8–19) names Bathroom Cleaner/Floor Cleaner/Black Phenyl/White Phenyl/GLOW/Liquid
Detergent Cool Water conflicts — no "car wash" or "shield" mention. The MUV Shield
naming-adjacency finding (§3) is not yet reflected here as a queued `KnowledgeConflict` row —
it exists only as this package's own documentation finding.

## §8 — Competitor Brand Scan — NOT FOUND

Word-boundary scan for `3M|Turtle Wax|Meguiar's|Bosch|CarPlan|Autoglym|Griot's Garage|Chemical
Guys|Armor All` against the Chart, SOP, and Knowledge Library — zero hits.

## §9 — Other Repo-Wide Mentions

- `lib/validations/inquiry.ts` line 3: `BUSINESS_TYPES` includes `"Car Wash"` as a real,
  tracked B2B institutional-customer business type (alongside Hotel, Restaurant, Hospital,
  Office, Laundry, Other) — a genuine product-market signal, distinct from whether MUV sells a
  Car Wash *product*. `components/storefront/business-section.tsx` echoes the same list in
  customer-facing copy.
- `docs/knowledge-factory/PRODUCT_REGISTRY.md`, `REPOSITORY_INDEX.md`, `CHANGE_LOG.md`,
  `FOUNDER_RULES.md` (`FR-006`), `VALIDATION_RULES.md` (§7) — all already reference this Product
  Family as "IN PROGRESS" / the trigger for `FR-006`, consistent with the governance work already
  completed this session before this audit began.

---

## Summary

**9 candidate sources checked. 5 found real content** (Product Chart, SOP, Knowledge Library
category references, seed-data naming conflict, `BUSINESS_TYPES` institutional signal). **4
confirmed absent** (AI Sutra, competitor brands, `conflict-service.ts` product-specific entries,
`consumption-rules.ts` car-wash category). **Zero conflicts between the Chart and SOP** — the
cleanest source agreement this session. One real, confirmed naming-adjacency conflict (MUV
Shield). Zero safety content, now governed by `FR-006` rather than documented field-by-field.
