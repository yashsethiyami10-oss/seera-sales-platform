# MUV Car Wash™ — Product Intelligence

> Includes **KO-CW-INTEL-003 (Usage)**, now referenced via the `FR-006` CMS pattern rather than
> authored inline or marked `Unknown`. Includes **KO-CW-INTEL-008 (Claims Validation)** — a new,
> explicitly-required concern for this package.

---

## KO-CW-INTEL-001 — Product Purpose / Positioning

- **Confidence:** MEDIUM — product type and format sourced; no explicit positioning statement
- **Evidence:** SOP formula and QC criteria
- **Source:** `MUV_Car_Wash_Production_SOP_With_Photos.docx`

**Content:** A liquid exterior vehicle wash concentrate/product, SLES/CAPB/CDEA-based with a
silicone emulsion for finish. No marketing positioning statement exists in the SOP beyond its QC
description. **Unknown — Founder Decision Required** for any formal positioning beyond "liquid
vehicle wash."

---

## KO-CW-INTEL-002 — Cleansing / Foam Mechanism

- **Confidence:** MEDIUM — surfactant system sourced; mechanism explanation is a standard
  chemistry inference, not a sourced claim
- **Evidence:** SOP raw materials table

**Content:** Cleansing/foaming action from SLES (anionic surfactant) and CAPB (amphoteric
surfactant), with CDEA as a foam booster, IPA as a solvent/clarity aid, and Silicone Emulsion as a
finish/sheen agent on the washed surface. **Standard surfactant-chemistry inference from the named
raw materials, not a MUV-authored marketing claim.**

---

## KO-CW-INTEL-003 — Usage / Directions for Use

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

**Note:** Per `FR-006`/`ARCHITECTURE.md` §5.3, this CMS source (`ProductIntelligence`) is not yet
populated for this product — the reference above is the correct target architecture, not evidence
the content currently exists. See `14_FOUNDER_GAPS.md`.

---

## KO-CW-INTEL-004 — Raw Materials / Formula

- **Confidence:** HIGH — sourced exactly
- **Evidence:** SOP raw materials table

| Raw Material | Quantity (per 11L batch) |
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
| Salt | 125 g (solution, viscosity) |

No INCI consumer-facing ingredient names sourced — manufacturing raw-material names only.

---

## KO-CW-INTEL-005 — Manufacturing Process

- **Confidence:** HIGH — sourced exactly, 12 steps, no branching
- **Evidence:** SOP Manufacturing Procedure

**Content:** Water charge → EDTA → SLES (slow, low speed) → CAPB → CDEA → IPA → Phenoxy Ethanol
preservative → colour (pre-dissolved) → perfume → silicone emulsion (premixed) → salt solution to
viscosity → QC + fill. **No variant-specific step exists anywhere** — the entire process is
identical regardless of pack size.

---

## KO-CW-INTEL-006 — Quality Control Criteria

- **Confidence:** HIGH — sourced exactly
- **Evidence:** SOP QC section

**Content:** Appearance: clear glossy liquid. pH: 6.5–7.5. Rich foam. No separation. Smooth
finish on vehicle. No numeric viscosity spec, no microbiological/stability testing criteria
sourced beyond these five checks.

---

## KO-CW-INTEL-007 — Packaging & Filling

- **Confidence:** MEDIUM — fill instruction and net weights sourced; container material not
- **Evidence:** SOP Packing Standard table

**Content:** Fill weights: 500ml = 510g, 5L = 5100g. **Container material, cap/nozzle type, and
dispenser mechanism are Unknown — Founder Decision Required.**

---

## KO-CW-INTEL-008 — Claims Validation

- **Confidence:** HIGH — the boundary itself is precisely sourced (what IS and ISN'T supported)
- **Evidence:** SOP QC criteria (KO-CW-INTEL-006); `00_Source_Register.md` §3 (MUV Shield
  comparison)

**Content:** Sourced, defensible descriptive claims: "clear glossy liquid," "rich foam," "smooth
finish on vehicle" — all directly from the SOP's own QC criteria. **Never used, because
unsourced anywhere in the real formula or QC data:** "wax," "wax-based," "gloss-lock,"
"paint-safe," "scratch-free," or any claim implying long-term paint protection. These four terms
appear only in the unrelated `prisma/seed.ts` "MUV Shield" record's `benefits`/`shortDescription`
fields — a different product with a materially different formula (no wax ingredient in this SOP's
raw-materials table) — and must never be borrowed into this Product Family's content.

---

## KO-CW-INTEL-009 — Compatibility / Use Cases

- **Confidence:** N/A — not sourced
- **Source:** None found — **Founder Decision Required**

**Content:** **Unknown.** No source states compatibility or incompatibility with specific vehicle
surface types (paint types, vinyl wraps, chrome, matte finishes, plastic trim). No source states
whether pressure-washer or hose-and-bucket application was intended. Never invented to fill this
gap — see `05_Customer_Conversation.md` KO-CW-CONV-007.

---

## KO-CW-INTEL-010 — Category & Portfolio Positioning

- **Confidence:** MEDIUM — category is directly given; portfolio relationship is an observation
- **Evidence:** Task instruction (Category: Car Care); `00_Source_Register.md` §9

**Content:** MUV Car Wash is the first, and only, Car Care category product built this session.
`lib/validations/inquiry.ts`'s `BUSINESS_TYPES` already tracks "Car Wash" as a real institutional
customer segment — a genuine product-market signal — but no institutional consumption category
exists yet for this product (`00_Source_Register.md` §6). No source states how MUV Car Wash and
the unrelated "MUV Shield" car-care seed record are meant to coexist commercially.

---

## KO-CW-INTEL-011 — Content Gaps Summary Pointer

- **Confidence:** HIGH — accurate pointer, not a content claim

**Content:** See `14_FOUNDER_GAPS.md` for the full, priority-ordered register — most critically,
the six `FR-006`-referenced fields' currently-unpopulated CMS source, vehicle-surface
compatibility, and the missing institutional consumption category.
