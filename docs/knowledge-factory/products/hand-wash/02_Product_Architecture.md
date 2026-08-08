# MUV Hand Wash™ — Product Architecture

> Includes the new **Variant Availability Architecture** section (execution step 5) and the
> `FR-004`-required **Variant Inheritance Map** (execution step 6, embedded — no standalone file
> was named in this task's file list). These are two distinct architectural concerns and are
> never conflated: Availability governs *which* Variant×Pack-Size combinations exist at all;
> Inheritance governs *what content* a variant shares with vs. overrides from the Parent.

---

## KO-HW-IDENT-001 — Parent Product Identity

- **KOID:** KO-HW-IDENT-001
- **Confidence:** HIGH (existence, formula, four variants) / MEDIUM (official parent name — the
  SOP's own title says "MUV GLOW HAND WASH," not "MUV Hand Wash™"; resolved by direct Founder
  Instruction, see KO-HW-NAME-001) / N/A (manufacturer)
- **Evidence:** Product Chart rows 24–31; SOP title block and §1/§4; SOP filing location
  (`SOPs/PERSONAL CARE/`)
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 24–31;
  `MUV_GLOW_Hand_Wash_Professional_SOP_With_Product_Photos.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Parent Name | MUV Hand Wash™ | MEDIUM — SOP internally titled "MUV GLOW Hand Wash"; official name per direct Founder Instruction |
| Official Variants | Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield | HIGH — all four have Chart rows and SOP §4 entries |
| Category | Personal Care | HIGH — stated directly in the task instruction, corroborated by the SOP's filing location |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | SLES/CAPB/CDEA-based pearlescent liquid hand wash | HIGH — SOP §2 formula, §3 process (pearl paste step) |
| Catalogue Status | Not yet in the online storefront catalogue under any of the four real variant names. **Two different, non-matching products exist in `prisma/seed.ts`** ("MUV Silk Hair Wash," "MUV Shield") — see `00_Source_Register.md` §5, never used as a source here. | HIGH |

---

## KO-HW-FAM-001 — Product Family Overview

- **KOID:** KO-HW-FAM-001
- **Confidence:** HIGH — all four variants sourced; availability confirmed by direct Founder
  Instruction
- **Evidence:** Product Chart rows 24–31; SOP §4 Fragrance/Colour Guide; Founder-verified
  Variant Availability Matrix
- **Source:** `00_Source_Register.md` §1–§2

**Content:**

| Variant | Colour (sourced) | Verified Pack Sizes | Sourcing Status |
|---|---|---|---|
| Silk Blossom | Purple | 500ml, 5L | **SOURCED — asymmetric (no 250ml)** |
| Ocean Fresh | Blue | 500ml, 5L | **SOURCED — asymmetric (no 250ml)** |
| Citrus Blast | Yellow | 250ml, 500ml | **SOURCED — asymmetric (no 5L)** |
| Life Shield | Pink (SOP spells "Lifeshield") | 250ml, 500ml | **SOURCED — asymmetric (no 5L)** |

**Unlike Body Wash's full 3×2 symmetry, this Product Family has a genuinely partial, Founder-
verified availability grid — 8 of 12 theoretical combinations are real.** See KO-HW-AVAIL-001.

**Shared base formula** (one 10L-batch SOP covers all four variants — see
`03_Product_Intelligence.md`): identical raw materials, identical 13-step process except Steps 9
and 10 (colour, fragrance), identical QC criteria, identical pack-size net-weight structure.
**Two variant-specific override points exist** — colour AND fragrance — a real, sourced structural
difference from both Floor Cleaner (colour only) and Body Wash (fragrance only, colour shared).

---

## KO-HW-AVAIL-001 — Variant Availability Matrix (new architectural concern, execution step 5)

- **KOID:** KO-HW-AVAIL-001
- **Confidence:** HIGH — directly Founder-verified; MEDIUM on corroboration (the Product Chart
  partially conflicts, see below)
- **Evidence:** Founder Instruction (Product Family 11 task); Product Chart rows 24–31
- **Source:** Task instruction (authoritative); `00_Source_Register.md` §1

**Content:**

### Principle

Distinct from Variant Inheritance (`FR-004`, KO-HW-INHERIT-001 below). Availability answers "does
this SKU exist at all?" — Inheritance answers "what does an existing SKU share vs. override from
the Parent?" A combination must pass Availability before Inheritance is even relevant to it.

### The verified matrix (authoritative — reproduced exactly, never expanded)

| Variant | 250ml | 500ml | 5L |
|---|---|---|---|
| Silk Blossom | ❌ NOT REAL | ✅ REAL | ✅ REAL |
| Ocean Fresh | ❌ NOT REAL | ✅ REAL | ✅ REAL |
| Citrus Blast | ✅ REAL | ✅ REAL | ❌ NOT REAL |
| Life Shield | ✅ REAL | ✅ REAL | ❌ NOT REAL |

**8 real combinations. 4 combinations that must never be created or inferred:** Silk Blossom
250ml, Ocean Fresh 250ml, Citrus Blast 5L, Life Shield 5L.

### Rule

"Only create verified Variant × Pack Size combinations. Never infer availability." (Founder
Instruction, verbatim.) This package builds exactly 8 SKU-level Knowledge Objects
(KO-HW-*-VAR-* below) — never 12, regardless of what any other source implies.

### Relationship to the Product Chart conflict

The Product Chart (`00_Source_Register.md` §1) shows a *different* set of 8 rows: it is silent on
Silk Blossom 5L (which the Founder confirms is real) and prices a Citrus Blast 5L row (historical
citation only, see `00_Source_Register.md` §1) that the Founder's matrix says is not real. **This package follows the Founder's matrix, not the
Chart's row set**, consistent with the established precedent that a direct, current Founder
Instruction for this specific package controls (as with Black Phenyl's 1L-vs-500ml pack-size
decision). The Chart discrepancy itself is not silently resolved — it remains open in
`14_FOUNDER_GAPS.md` as a real, unexplained mismatch between two source-of-record documents.

### Why this is a distinct category from "unsourced" (Rose Water) or "conflicting" (Black Phenyl)

Floor Cleaner's Rose Water was named but had zero corroborating source material at all — its
status was "unconfirmed." Black Phenyl's pack-size conflict was two sources disagreeing about the
*same* SKU's size. Here, the four missing combinations are neither unsourced nor a same-SKU
conflict — they are **combinations the Founder has directly stated do not exist**, a new,
explicit-absence category. They are not marked "unconfirmed" (which would wrongly imply they
might turn out to exist) — they are simply not built.

---

## KO-HW-INHERIT-001 — Variant Inheritance Map (per `FR-004`, execution step 6)

- **KOID:** KO-HW-INHERIT-001
- **Confidence:** HIGH — directly derived from the shared SOP's own structure
- **Evidence:** SOP full structure (§1–§4); `00_Source_Register.md` §2

**Content:**

### Principle

Per `FR-004`: shared knowledge exists exactly once at Parent level; only genuinely
variant-specific knowledge exists in Variant Knowledge Objects. Unlike Body Wash (one override
point: fragrance) or Floor Cleaner (one override point: colour), **this product's SOP has two
variant-specific process lines** — Step 9 (colour) and Step 10 (fragrance) — both explicitly
instructed not to be premixed with each other.

### Parent Knowledge Objects (shared, exist exactly once)

```
MUV Hand Wash™ (Parent)
│
├─ KO-HW-IDENT-001 ................ Product Identity (family-level)
├─ KO-HW-FAM-001 .................. Product Family Overview
├─ KO-HW-AVAIL-001 ................ Variant Availability Matrix
├─ KO-HW-INHERIT-001 .............. This Variant Inheritance Map
├─ KO-HW-NAME-001 ................. Canonical Naming
├─ KO-HW-INTEL-001–007, 009–015 ... Purpose, mechanism, usage, formula, process, QC, packaging,
│                                    pearl effect, skin-type/ingredient gaps, category
│                                    positioning, variant differentiation, GLOW naming note,
│                                    gaps pointer — all shared across variants
├─ KO-HW-SAFETY-001–011 ........... Safety & Risk (documents field-by-field absence per FR-005,
│                                    plus the Life Shield antibacterial-claim status finding)
├─ KO-HW-FAQ-001/002 .............. Customer FAQs and AI Response Guidance (family-level)
├─ KO-HW-OBJ-001–008 .............. Objection Handling (family-level)
├─ KO-HW-DT-001/002/003 ........... Parent Decision Trees (need, pack size, fragrance/colour)
├─ KO-HW-DT-COMPARE-001 ........... Cross-variant factual comparison table
└─ KO-HW-CONV-001–012 ............. Parent Customer Conversation flows (all 12 required flows)
```

**KO-HW-INTEL-008 (Fragrance & Colour Characteristics) is the one Parent-level Knowledge Object
that directly documents both variant-specific override points together** — it states all four
variants' colour and fragrance-family labels in one table, functioning as the bridge between the
Parent-level formula and the Variant-level SKU KOs below.

### Inheritance by variant (only the Founder-verified real SKUs are listed — per KO-HW-AVAIL-001)

| Variant | Inherits Parent KOs? | Overrides / Variant-Specific Additions |
|---|---|---|
| **Silk Blossom** | **YES — confirmed.** Sourced from the same shared SOP as the other three; inherits all Parent-level KOs without modification. | Colour: Purple. Fragrance: not named beyond variant label. KO-HW-SB-VAR-500, KO-HW-SB-VAR-5L (no 250ml — see KO-HW-AVAIL-001). KO-HW-DT-REC-SB-001. |
| **Ocean Fresh** | **YES — confirmed.** Same basis. | Colour: Blue. KO-HW-OF-VAR-500, KO-HW-OF-VAR-5L (no 250ml). KO-HW-DT-REC-OF-001. |
| **Citrus Blast** | **YES — confirmed.** Same basis. | Colour: Yellow. KO-HW-CB-VAR-250, KO-HW-CB-VAR-500 (no 5L). KO-HW-DT-REC-CB-001. |
| **Life Shield** | **YES — confirmed** for formula/process/QC. **NOT confirmed** for any antibacterial/protective claim — no source assigns one (see KO-HW-SAFETY-010). | Colour: Pink (SOP spells "Lifeshield"). KO-HW-LS-VAR-250, KO-HW-LS-VAR-500 (no 5L). KO-HW-DT-REC-LS-001, which explicitly must not recommend on an antibacterial basis. |

### The two override points, precisely

> SOP Step 9: *"Add colour separately. Mix until shade is uniform. **Do NOT premix with
> fragrance.**"*
> SOP Step 10: *"Add fragrance separately. Mix gently for 10–15 minutes. **Do NOT premix with
> colour.**"*

Every other Parent-level fact (raw material quantities, the other 11 process steps, net-weight/
pack structure, QC criteria) is identical across all four variants. This is a real, sourced
structural difference from both prior variant precedents — the override point is never assumed to
be the same shape (single field, e.g. colour-only or fragrance-only) product to product; it is
whatever the source SOP's own variant-specific process lines actually are.

### What is genuinely NOT known per variant (never invented)

No source states fragrance notes (top/heart/base), sensory descriptions, or emotional/lifestyle
positioning for any of the four variants beyond their colour and name. **No source states any
antibacterial, protective, or germ-related property for Life Shield specifically** — its name is
the only signal, and per `FR-005` a name is never treated as a claim. See
`04_Decision_Trees.md` for how this is handled in recommendation logic and `08_Safety.md`
KO-HW-SAFETY-010.

---

## KO-HW-SB-VAR-500 — Silk Blossom, 500ml

- **KOID:** KO-HW-SB-VAR-500
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 26; SOP §1/§4
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 26;
  `MUV_GLOW_Hand_Wash_Professional_SOP_With_Product_Photos.docx`

| Field | Value |
|---|---|
| Colour | Purple (sourced) |
| Fragrance Family | Not named beyond "Silk Blossom" |
| Pack Size | 500ml |
| Net Weight | 510g (SOP §1, generic across variants) |
| Pricing (MRP) | **Commercial data — never stored here.** See `10_LIVE_DATA_MAPPING.md`. Historical Chart citation recorded only in `00_Source_Register.md`. |
| SKU Code / Barcode / Dimensions / Shipping Weight | Not stated |
| Product Images | 8 embedded photos exist in the SOP but are uncaptioned/unattributable to a specific variant or pack size — not usable as sourced per-SKU imagery |

---

## KO-HW-SB-VAR-5L — Silk Blossom, 5L

- **KOID:** KO-HW-SB-VAR-5L
- **Confidence:** MEDIUM — real per direct Founder Instruction; **the Product Chart has no
  corresponding row** (see KO-HW-AVAIL-001), so this SKU's existence rests on the Founder's
  matrix rather than independent Chart corroboration
- **Evidence:** Founder-verified Variant Availability Matrix; SOP §1/§4 (generic 5L pricing row,
  not variant-specific)

| Field | Value |
|---|---|
| Colour | Purple (sourced) |
| Pack Size | 5L |
| Net Weight | 5030g (SOP §1, generic across variants) |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-HW-OF-VAR-500 — Ocean Fresh, 500ml

- **KOID:** KO-HW-OF-VAR-500
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 27; SOP §1/§4

| Field | Value |
|---|---|
| Colour | Blue (sourced) |
| Pack Size | 500ml |
| Net Weight | 510g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-HW-OF-VAR-5L — Ocean Fresh, 5L

- **KOID:** KO-HW-OF-VAR-5L
- **Confidence:** HIGH — sourced, no conflict (this is the one 5L combination where Chart and
  Founder matrix agree)
- **Evidence:** Product Chart row 28; SOP §1/§4

| Field | Value |
|---|---|
| Colour | Blue (sourced) |
| Pack Size | 5L |
| Net Weight | 5030g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-HW-CB-VAR-250 — Citrus Blast, 250ml

- **KOID:** KO-HW-CB-VAR-250
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 29; SOP §1/§4

| Field | Value |
|---|---|
| Colour | Yellow (sourced) |
| Pack Size | 250ml |
| Net Weight | 260g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-HW-CB-VAR-500 — Citrus Blast, 500ml

- **KOID:** KO-HW-CB-VAR-500
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 30; SOP §1/§4

| Field | Value |
|---|---|
| Colour | Yellow (sourced) |
| Pack Size | 500ml |
| Net Weight | 510g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-HW-LS-VAR-250 — Life Shield, 250ml

- **KOID:** KO-HW-LS-VAR-250
- **Confidence:** HIGH (existence/colour/pack size) / N/A (any antibacterial or protective
  property — explicitly unconfirmed, see KO-HW-SAFETY-010)
- **Evidence:** Product Chart row 24 ("MUV Lifeshield Hand Wash," 250ml); SOP §1/§4

| Field | Value |
|---|---|
| Colour | Pink (sourced; SOP spells the variant "Lifeshield") |
| Pack Size | 250ml |
| Net Weight | 260g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Antibacterial / Protective Claim | **Unknown — Founder Decision Required. Never assumed from the name.** See `08_Safety.md` KO-HW-SAFETY-010. |
| Other fields | Not stated |

---

## KO-HW-LS-VAR-500 — Life Shield, 500ml

- **KOID:** KO-HW-LS-VAR-500
- **Confidence:** HIGH (existence/colour/pack size) / N/A (antibacterial or protective property)
- **Evidence:** Product Chart row 25 ("MUV Lifeshield Hand Wash," 500ml); SOP §1/§4

| Field | Value |
|---|---|
| Colour | Pink (sourced) |
| Pack Size | 500ml |
| Net Weight | 510g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Antibacterial / Protective Claim | **Unknown — Founder Decision Required. Never assumed from the name.** |
| Other fields | Not stated |

---

## KO-HW-NAME-001 — Canonical Naming

- **KOID:** KO-HW-NAME-001
- **Confidence:** HIGH — resolution basis is clear, even though two real discrepancies exist
- **Evidence:** `00_Source_Register.md` §1–§2

**Content:**

| Field | Value |
|---|---|
| Official Parent Name | MUV Hand Wash™ |
| Official Variant Names | Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield |
| Source Discrepancy 1 — Parent Name | SOP's own title is "MUV GLOW HAND WASH." Resolved: "MUV Hand Wash™" is official per direct Founder Instruction; "GLOW" preserved only as the SOP's internal/legacy title, never presented to customers. |
| Source Discrepancy 2 — Life Shield Spelling | Both the Chart ("MUV Lifeshield Hand Wash") and the SOP ("Lifeshield") spell it as one word. Resolved: "Life Shield" (two words) is official per direct Founder Instruction; "Lifeshield" preserved only as a source citation. |
| Forbidden/Legacy Names | "MUV GLOW Hand Wash" and "Lifeshield" are legacy/source spellings only — never used in customer-facing content. **"MUV Silk Hair Wash" and "MUV Shield" (`prisma/seed.ts`) are NOT alternate names for any of these four variants** — they are separate, non-matching seed-data placeholders (see `00_Source_Register.md` §5) and must never be conflated with this Product Family. |
