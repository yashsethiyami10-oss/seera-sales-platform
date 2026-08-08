# MUV White Phenyl™ — Product Architecture

---

## KO-WP-ARCH-001 — Parent Product Identity

- **KOID:** KO-WP-ARCH-001
- **Confidence:** HIGH (existence, formula, pack sizes) / MEDIUM (category, inferred from SOP
  filing) / N/A (manufacturer)
- **Evidence:** Product Chart rows 20–21; SOP title block; SOP filing location (HOME CARE)
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 20–21; `MUV_White_Phenyl_SOP_10L_Batch.docx`
- **Reused pattern:** structural template reused from KO-BP-ARCH-001 (Black Phenyl) — see
  `13_Reports/08_Knowledge_Reuse_Summary.md`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Name | MUV White Phenyl™ | Direct Founder Instruction, matching the SOP exactly |
| Source Name (Product Chart) | "MUV Phenyl" — generic, no "White" | HIGH |
| Source Name (SOP) | "MUV White Phenyl" — matches official name exactly | HIGH |
| Category | Home Care | MEDIUM — inferred from SOP folder placement (`SOPs/HOME CARE/`) |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | Pine-oil-emulsion-based, milky white floor cleaner, per the SOP's own Objective | HIGH |
| Catalogue Status | Not yet in the online storefront catalogue (`prisma/seed.ts` has zero matching records) | HIGH |
| Related but distinct product | "MUV Black Phenyl" (Chart row 22, 500ml/1L) — a separate, frozen product family with its own SOP and a visibly different (black, phenyl-concentrate-based) formula. **Confirmed distinct**, not a colour variant of this product. | HIGH — independently confirmed this package, resolving Black Phenyl's own open gap #20 |

---

## KO-WP-ARCH-002 — SKU / Pack Sizes (no conflict — a real difference from Black Phenyl)

- **KOID:** KO-WP-ARCH-002
- **Confidence:** HIGH — both sources agree exactly
- **Evidence:** Product Chart rows 20–21; SOP §2 "Product Variants," §6 "Filling & Packaging"
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 20–21; `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:**

| Field | 1L | 5L |
|---|---|---|
| Pack Size | 1 L Bottle (SOP) / 1L (Chart) — match | 5 L Can (SOP) / 5L (Chart) — match |
| Container | HDPE Bottle (SOP §6) | HDPE Can (SOP §6) |
| MRP | Commercial data — never stored here. Historical Chart citation recorded only in `00_Source_Register.md`. | Same |
| Fill Weight | Not stated anywhere in the SOP | Not stated anywhere in the SOP |
| SKU Code / Barcode | Not stated | Not stated |
| Dimensions / Shipping Weight | Not stated | Not stated |
| Product Images | No embedded photo exists in the source SOP | Same |

**No pack-size conflict exists for this product** — both sources independently agree on both
pack sizes, unlike Black Phenyl's genuine 500ml-vs-1L conflict. This is recorded explicitly as a
clean comparison, not silently skipped, per the same discipline used for every prior clean
comparison this session (e.g. Toilet Cleaner's pricing, Glass Cleaner's pricing, Floor Cleaner's
1L pricing).

---

## KO-WP-ARCH-003 — Naming Architecture

- **KOID:** KO-WP-ARCH-003
- **Confidence:** HIGH — official name is a direct Founder Instruction; both source names
  verified verbatim
- **Evidence:** `00_Source_Register.md` naming finding
- **Reused pattern:** naming-resolution mechanism reused from Bathroom Cleaner ("Fresh"), Glass
  Cleaner ("Crystal"), Pure Bleach ("Pure") — see `13_Reports/08_Knowledge_Reuse_Summary.md`

**Content:**

| Field | Value |
|---|---|
| Official Name | MUV White Phenyl™ |
| Legacy/Chart Name (historical reference only) | "MUV Phenyl" — used in both Product Chart rows |
| Manufacturing Name (per SOP) | "MUV White Phenyl" — matches Official Name exactly |
| AI Canonical Name | MUV White Phenyl™ |
| Forbidden Names | None explicitly stated. Recommend treating "MUV Phenyl" (without "White") as discouraged for new customer-facing content, matching the pattern already established three times this session — a recommendation, not an asserted Founder decision. |
| Related product never to confuse with | MUV Black Phenyl™ (a separate, frozen product family) |

**This is the fourth product family this session where the Founder-given official name differs
from the Product Chart's own name**, resolved identically each time: official name wins per
direct Founder Instruction, source name preserved as legacy reference, never presented as an
open, unresolved conflict.
